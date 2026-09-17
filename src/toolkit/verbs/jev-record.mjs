// `jev-record start|stop|serve|read` — a local recording proxy for Jev traffic, and the
// reader for what it wrote down.
//
// **What this exists for.** `src/toolkit/lib/jev.mjs` never throws: every failure resolves to
// a result with an empty answer map, which `docs/adrs/0013-the-eval-bar-is-pre-registered.md`
// fixes as the layer's contract. So a refused key, a rejected body and a model that answered 7
// of 125 questions are one observation at the call site, and a call that failed silently
// surfaces as a verdict. Something outside the client has to write down what actually crossed
// the wire. This is that something, and it is outside the client deliberately — `jev.mjs` is
// not modified, and pointing Jev here is `ask({ endpoint: <the proxy url> })`, a parameter the
// client already takes.
//
// **It records; it does not judge.** No answer is read, no failure is repaired, no request is
// retried, and no response is synthesised. `docs/adrs/0008-no-question-set-acts-in-this-campaign.md`
// holds that nothing acts on a Jev answer, and this verb is not an exception to it: it is a
// wire tap whose output is evidence.
//
// **The key is forwarded and never written.** It is read from `TYPESAFE_API_KEY` in the
// environment and from nowhere else, supplied on the upstream request only when the caller
// sent no `Authorization` of its own, and redacted out of every record — by header name, and
// by literal scan of each body, which is what catches an endpoint echoing a rejected key back
// inside its 401. `package.json` ships `src`, so a key written into a file here is a key
// published to npm.
//
// **Nothing is gated on and nothing is wired in.** Starting the proxy needs no `--judge` and
// no `MY_COMMAND_JUDGE=1`, because those two gates govern *asking Jev a question*
// (`docs/adrs/0009-conversation-derived-state-leaves-the-device.md`), and this verb asks
// nothing: it forwards what a caller already decided to send. Running it with no caller sends
// nothing at all. No command calls it.

import { spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bool, str } from '../lib/flags.mjs';
import { ENDPOINT, HEALTH_PATH, HOST, startProxy } from '../lib/jev-record.mjs';
import {
  keepRoot,
  listSessions,
  openSession,
  readSession,
  sessionDir,
  sessionName,
  writeSession,
} from '../lib/jev-record-store.mjs';
import { asRecord } from '../lib/json.mjs';
import { UsageError } from '../lib/proc.mjs';

export const usage = `jev-record start [--port <n>] [--endpoint <url>] [--timeout <s>]
jev-record stop [--session <name>] [--all]
jev-record serve [--port <n>] [--endpoint <url>] [--exchanges <n>] [--idle <s>]
jev-record read [--session <name>] [--all] [--full]

Record what actually crosses the wire between a caller and TypeSafe's System One
endpoint, because the Jev client cannot: it never throws, and every failure mode
resolves to an empty answer map, so a 401, a 422 and a model that answered 7 of 125
questions are the same observation at the call site.

  start   Spawn the proxy detached and print {url, port, pid, session, dir}. Point
          Jev at it with ask({ endpoint: <url> }); nothing else changes.
  stop    Stop what start recorded, and print the session it wrote.
  serve   Run the proxy in the foreground until --exchanges or --idle is reached, or
          a signal arrives. This is what start spawns.
  read    Print a recorded session: one summary per exchange, or the records whole
          with --full.

  --port <n>        Bind this port instead of an ephemeral one.
  --endpoint <url>  Upstream. Default ${ENDPOINT}
  --timeout <s>     start: how long to wait for the proxy to answer (default 10).
  --exchanges <n>   serve: stop after recording this many exchanges.
  --idle <s>        serve: stop after this long with no traffic.
  --session <name>  Which session to stop or read. Default: the most recent.
  --all             stop: every running proxy. read: every session, as a list.
  --full            read: the records themselves, not a summary per exchange.

Records land outside any checkout, under
${keepRoot()}
so a record of what crossed the wire can never be committed by accident. The format
is specified in docs/specs/command-toolkit.md, because an eval harness here and an
ingest pass in another repository both parse it.

The API key is read from TYPESAFE_API_KEY in the environment and from nowhere else.
It is forwarded upstream when the caller sent no Authorization of its own, and it is
redacted out of every record — by header name, and by scanning each body for it.
No record ever contains it.

This verb is wired into no command, asks Jev nothing of its own, and needs neither
--judge nor MY_COMMAND_JUDGE: those gate sending state to a third party, and this
forwards only what a caller already chose to send.

Exit codes: 0 success · 1 the verb failed · 2 bad usage.`;

/** How long `start` waits for the spawned proxy to answer before giving up. */
const DEFAULT_START_TIMEOUT_SECONDS = 10;

/** How often `start` re-probes while waiting. In-process, so no agent is sleeping. */
const PROBE_MS = 100;

/** This CLI's own entrypoint — what `start` spawns to get a `serve`. */
const CLI = fileURLToPath(new URL('../cli.mjs', import.meta.url));

/**
 * The positive integer a flag carried, or null for absent, zero, or anything unparseable.
 * @param {string | undefined} text
 * @returns {number | null}
 */
function positive(text) {
  const value = Number(text);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Not unref'd: a pending wait is the only work keeping the process alive while it runs, and
 * an unref'd timer would let Node exit mid-wait.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {number} pid @returns {boolean} */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * One session's header file, or null when it is absent or unreadable.
 * @param {string} name
 * @returns {Record<string, unknown> | null}
 */
function headOf(name) {
  try {
    return asRecord(JSON.parse(readFileSync(join(sessionDir(name), 'session.json'), 'utf8')));
  } catch {
    return null;
  }
}

/**
 * The session a subcommand means when none was named: the most recent one on disk, which the
 * sortable session-name format makes the last entry rather than a stat sweep.
 * @param {string | undefined} named
 * @param {string} forWhat
 * @returns {string}
 */
function resolveSession(named, forWhat) {
  if (named !== undefined) return named;
  const sessions = listSessions();
  const latest = sessions[sessions.length - 1];
  if (latest === undefined) {
    throw new UsageError(`there is no recorded session to ${forWhat}`, { keep: keepRoot() });
  }
  return latest;
}

/**
 * Run the proxy in the foreground until it is told to stop.
 *
 * Three ways to stop, and a caller usually wants one of them: a signal (what `stop` sends), an
 * exchange ceiling, or an idle period. Without any of them this runs until signalled, which is
 * the ordinary case for a proxy a harness is pointing at.
 * @param {import('../cli.mjs').Ctx} ctx
 * @returns {Promise<Record<string, unknown>>}
 */
async function serve(ctx) {
  const name = str(ctx.flags.session) ?? sessionName();
  const endpoint = str(ctx.flags.endpoint) ?? ENDPOINT;
  const startedAt = new Date().toISOString();
  const dir = openSession(name, { startedAt, endpoint, pid: process.pid, host: HOST, port: null, url: null });

  const ceiling = positive(str(ctx.flags.exchanges));
  const idleSeconds = positive(str(ctx.flags.idle));

  /** @type {() => void} */
  let stop = () => {};
  const stopped = new Promise((resolve) => {
    stop = () => resolve(undefined);
  });

  let lastActivity = Date.now();
  const proxy = await startProxy({
    dir,
    session: name,
    port: positive(str(ctx.flags.port)) ?? 0,
    endpoint,
    onRecord: () => {
      lastActivity = Date.now();
      if (ceiling !== null && proxy.recorded() >= ceiling) stop();
    },
  });

  // Rewritten now the port is known: `start` polls this file, so the port has to be in it
  // before the proxy is usable rather than only in this process's return value.
  writeSession(dir, {
    v: 1,
    session: name,
    startedAt,
    endpoint,
    pid: process.pid,
    host: HOST,
    port: proxy.port,
    url: proxy.url,
    health: `${proxy.url}${HEALTH_PATH}`,
  });

  for (const signal of /** @type {NodeJS.Signals[]} */ (['SIGTERM', 'SIGINT'])) process.once(signal, stop);

  if (idleSeconds === null) await stopped;
  else {
    // Polled rather than a single timer, because each exchange pushes the deadline out and a
    // rescheduled timer per request is a timer leak per request.
    for (;;) {
      const settled = await Promise.race([stopped.then(() => true), pause(PROBE_MS).then(() => false)]);
      if (settled) break;
      if (Date.now() - lastActivity >= idleSeconds * 1000) break;
    }
  }

  const recorded = proxy.recorded();
  await proxy.close();
  const endedAt = new Date().toISOString();
  writeSession(dir, {
    v: 1,
    session: name,
    startedAt,
    endedAt,
    endpoint,
    pid: process.pid,
    host: HOST,
    port: proxy.port,
    url: proxy.url,
    health: `${proxy.url}${HEALTH_PATH}`,
    recorded,
  });
  return { session: name, dir, url: proxy.url, port: proxy.port, endpoint, recorded, startedAt, endedAt };
}

/**
 * Spawn the proxy detached and wait until it answers, so what this prints is a URL that
 * already works rather than one that is about to.
 * @param {import('../cli.mjs').Ctx} ctx
 * @returns {Promise<Record<string, unknown>>}
 */
async function start(ctx) {
  const name = sessionName();
  const endpoint = str(ctx.flags.endpoint) ?? ENDPOINT;
  const dir = openSession(name, {
    startedAt: new Date().toISOString(),
    endpoint,
    pid: null,
    host: HOST,
    port: null,
    url: null,
  });
  const log = join(dir, 'serve.log');

  /** @type {string[]} */
  const args = [CLI, 'jev-record', 'serve', '--session', name, '--endpoint', endpoint];
  const port = positive(str(ctx.flags.port));
  if (port !== null) args.push('--port', String(port));
  const idle = positive(str(ctx.flags.idle));
  if (idle !== null) args.push('--idle', String(idle));
  const exchanges = positive(str(ctx.flags.exchanges));
  if (exchanges !== null) args.push('--exchanges', String(exchanges));

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', openSync(log, 'a'), openSync(log, 'a')],
  });
  child.unref();

  const seconds = positive(str(ctx.flags.timeout)) ?? DEFAULT_START_TIMEOUT_SECONDS;
  const deadline = Date.now() + seconds * 1000;
  /** @type {Record<string, unknown> | null} */
  let head = null;
  while (Date.now() < deadline) {
    const current = headOf(name);
    // The port is the readiness signal: `serve` writes it only once the server is listening,
    // so a file carrying one is a proxy that can already be posted to.
    if (current !== null && Number(current.port) > 0) {
      head = current;
      break;
    }
    if (child.pid !== undefined && !alive(child.pid) && !existsSync(log)) break;
    await pause(PROBE_MS);
  }

  if (head === null) {
    return {
      pass: false,
      session: name,
      dir,
      log,
      pid: child.pid ?? null,
      url: null,
      port: null,
      endpoint,
      reason: `the proxy did not start within ${seconds}s — read ${log}`,
    };
  }

  return {
    pass: true,
    session: name,
    dir,
    log,
    pid: head.pid ?? child.pid ?? null,
    url: head.url ?? null,
    port: head.port ?? null,
    health: head.health ?? null,
    endpoint,
    note:
      'Point Jev at this with ask({ endpoint: <url> }) — jev.mjs already takes the endpoint ' +
      'as a parameter. Every exchange is written to `dir`; the key is never in one.',
  };
}

/**
 * Stop a running proxy by the pid its own session file recorded.
 *
 * The pid rather than the port: a proxy asked to stop should write its closing session file,
 * and SIGTERM is what `serve` listens for. A port sweep would kill it without that.
 * @param {import('../cli.mjs').Ctx} ctx
 * @returns {Promise<Record<string, unknown>>}
 */
async function stop(ctx) {
  const names = bool(ctx.flags.all) ? listSessions() : [resolveSession(str(ctx.flags.session), 'stop')];

  /** @type {Record<string, unknown>[]} */
  const stopped = [];
  for (const name of names) {
    const head = headOf(name);
    const pid = Number(head?.pid);
    if (!Number.isInteger(pid) || pid <= 0 || !alive(pid)) continue;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Exited between the liveness check and the signal, which is the outcome anyway.
    }
    stopped.push({ session: name, pid, url: head?.url ?? null });
  }

  // Give a signalled proxy its grace period, so what `read` reports next is the closing
  // session file rather than the one written when it started.
  for (let waited = 0; waited < 2000; waited += PROBE_MS) {
    if (!stopped.some((entry) => alive(Number(entry.pid)))) break;
    await pause(PROBE_MS);
  }

  /** @type {Record<string, unknown>[]} */
  const sessions = [];
  for (const entry of stopped) {
    const name = String(entry.session);
    const read = readSession(name);
    sessions.push({ session: name, dir: read.dir, recorded: read.records.length });
  }

  return { stopped, sessions, already: stopped.length === 0 };
}

/**
 * One exchange, as a line a person can scan. Every field here is derived from the record's own
 * fields and nothing is computed that the record does not already carry — a summary that
 * disagreed with the file beside it would be worse than no summary.
 * @param {Record<string, unknown>} record
 * @returns {Record<string, unknown>}
 */
function summarize(record) {
  const request = asRecord(record.request) ?? {};
  const response = asRecord(record.response) ?? {};
  const unanswered = Array.isArray(response.unansweredIds) ? response.unansweredIds : [];
  return {
    id: record.id ?? null,
    startedAt: record.startedAt ?? null,
    durationMs: record.durationMs ?? null,
    status: response.status ?? null,
    ok: response.ok ?? false,
    questionCount: request.questionCount ?? 0,
    answerCount: response.answerCount ?? 0,
    unanswered: unanswered.length,
    usage: response.usage ?? null,
    error: response.error ?? null,
    // The error body, kept short here and whole in the record: this is the line that tells a
    // 401 from a 422 without opening the file.
    errorBody: response.ok === true ? null : (response.bodyText ?? response.body ?? null),
  };
}

/**
 * Print what a session recorded.
 * @param {import('../cli.mjs').Ctx} ctx
 * @returns {Record<string, unknown>}
 */
function read(ctx) {
  if (bool(ctx.flags.all)) {
    const sessions = listSessions().map((name) => {
      const head = headOf(name);
      return {
        session: name,
        dir: sessionDir(name),
        startedAt: head?.startedAt ?? null,
        endedAt: head?.endedAt ?? null,
        endpoint: head?.endpoint ?? null,
        recorded: readSession(name).records.length,
        running: Number(head?.pid) > 0 && alive(Number(head?.pid)),
      };
    });
    return { keep: keepRoot(), sessions, count: sessions.length };
  }

  const name = resolveSession(str(ctx.flags.session), 'read');
  const { dir, session, records } = readSession(name);
  return {
    session: name,
    dir,
    head: session,
    recorded: records.length,
    // Totalled from the records rather than from the session file: the file is written by a
    // process that may have been killed, and the records are what is actually on disk.
    answered: records.reduce((total, record) => total + Number(asRecord(record.response)?.answerCount ?? 0), 0),
    asked: records.reduce((total, record) => total + Number(asRecord(record.request)?.questionCount ?? 0), 0),
    records: bool(ctx.flags.full) ? records : records.map(summarize),
  };
}

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const sub = ctx.positionals[0];
  if (sub === 'start') return start(ctx);
  if (sub === 'stop') return stop(ctx);
  if (sub === 'serve') return serve(ctx);
  if (sub === 'read') return read(ctx);
  throw new UsageError(`unknown subcommand \`${sub ?? ''}\` — expected start, stop, serve or read`, { usage });
}
