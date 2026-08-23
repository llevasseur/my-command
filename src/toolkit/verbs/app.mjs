// `app start|stop` — boot the repo's own app for a verification round, then stop it again.
//
// `verify` runs the repo's gates; this runs the repo's *app*, which is what a closed-loop
// check needs and what nothing else here provided. The pid and port are recorded at start,
// so `stop` never has to guess: `worktree reap` matches on a command line containing the
// worktree path and misses a dev server whose argv does not name it, and under `/task --here`
// there is no worktree for it to scan at all. A recorded pid closes both gaps.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bool, str } from '../lib/flags.mjs';
import { asRecord, recordOrEmpty } from '../lib/json.mjs';
import { run as exec, ToolkitError, UsageError } from '../lib/proc.mjs';
import { repoRoot } from '../lib/repo.mjs';

export const usage = `app start [--boot <cmd>] [--health <url>] [--port <n>] [--timeout <s>] [--cwd <path>]
app stop [--port <n>] [--all] [--cwd <path>]

Boot this repo's app on an ephemeral port and stop it again.

  start   Spawn the boot command detached, wait for the health probe, and record the
          pid and port. Prints {pid, port, url, log, healthy, ms}.
  stop    Stop what start recorded, and anything still listening on its port.
          Idempotent. Prints {stopped: [pid], already: bool}.

  --boot <cmd>     Boot command. Default: the run contract, else a detected dev script.
  --health <url>   Health probe. Default: the run contract's, else the booted origin.
  --port <n>       Use this port instead of an ephemeral one.
  --timeout <s>    Health-wait ceiling (default 90).
  --all            stop: every app this device recorded, not just this repo's.
  --cwd <path>     Run against a different directory.

The pid is recorded because argv is not reliable evidence: a dev server re-exec'd by its
own watcher can drop the worktree path from its command line, and \`worktree reap\` finds
it by that path. \`stop\` reads the record instead, and sweeps the port as a second pass.`;

/** Boot scripts to look for, in the order a repo most likely means them. */
const DETECTED = ['dev', 'start', 'preview'];

/** @type {[string, string][]} */
const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['package-lock.json', 'npm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
];

/** Seconds to wait for the health probe before reporting the boot unhealthy. */
const DEFAULT_TIMEOUT_SECONDS = 90;

/** How often the health wait retries. In-process, so no agent is sleeping. */
const PROBE_MS = 300;

/** Where the pid/port records live. One file per repo root. */
function appDir() {
  return join(process.env.MY_COMMAND_APP_DIR ?? tmpdir(), 'my-command-app');
}

/**
 * A record filename derived from the repo root, so two worktrees of one repo — and the main
 * checkout beside them — each get their own and never stop each other's server.
 * @param {string} root @returns {string}
 */
function recordPath(root) {
  return join(appDir(), `${root.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.json`);
}

/** @param {string} root @returns {string} */
function packageManager(root) {
  for (const [lock, pm] of LOCKFILES) if (existsSync(join(root, lock))) return pm;
  return 'npm';
}

/** @param {string} root @returns {Record<string, string>} */
function scriptsOf(root) {
  const pkg = join(root, 'package.json');
  if (!existsSync(pkg)) return {};
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(pkg, 'utf8'));
  } catch {
    return {};
  }
  /** @type {Record<string, string>} */
  const scripts = {};
  for (const [name, command] of Object.entries(recordOrEmpty(asRecord(manifest)?.scripts))) {
    scripts[name] = String(command);
  }
  return scripts;
}

/**
 * The repo's run contract, when its bootstrap script declares one. A bootstrap without the
 * flag, or no bootstrap at all, answers null and detection takes over.
 * @param {string} root
 * @returns {{boot?: string, health?: string, login?: unknown, routes?: unknown} | null}
 */
export function runContract(root) {
  const script = join(root, 'scripts', 'bootstrap-worktree.sh');
  if (!existsSync(script)) return null;
  const r = exec('bash', [script, '--print-verify-contract'], { cwd: root });
  if (!r.ok || !r.stdout) return null;
  try {
    const parsed = asRecord(JSON.parse(r.stdout));
    return parsed ? /** @type {Record<string, never>} */ (parsed) : null;
  } catch {
    // A bootstrap that does not recognise the flag prints its usage instead of JSON.
    return null;
  }
}

/**
 * The command that boots this repo. Explicit flag, then the run contract, then the first
 * detected script — and nothing invented if none of those answer.
 * @param {string} root @param {string | undefined} given
 * @param {{boot?: string} | null} contract
 * @returns {{boot: string, source: string}}
 */
function bootCommand(root, given, contract) {
  if (given) return { boot: given, source: 'flag' };
  if (contract?.boot) return { boot: contract.boot, source: 'contract' };
  const scripts = scriptsOf(root);
  const found = DETECTED.find((name) => name in scripts);
  if (found) return { boot: `${packageManager(root)} run ${found}`, source: `package.json:${found}` };
  throw new ToolkitError(
    'no boot command — pass --boot, or give the repo a run contract (`scripts/bootstrap-worktree.sh --print-verify-contract`) or a dev/start/preview script',
    { root, tried: DETECTED },
  );
}

/**
 * A port the kernel just told us is free. Bound and released rather than picked at random:
 * a guessed port collides with whatever the last round left behind.
 * @returns {Promise<number>}
 */
function ephemeralPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new ToolkitError('could not reserve a port'))));
    });
  });
}

/** @param {number} ms @returns {Promise<void>} */
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}

/**
 * The port the server actually bound, read out of its own startup output. The reserved port
 * is a request, not a promise: a dev server told a port is taken picks another and says so
 * only in the log, and probing the port we asked for would then verify nothing.
 * @param {string} log @returns {number | null}
 */
export function portFromLog(log) {
  let text = '';
  try {
    text = readFileSync(log, 'utf8');
  } catch {
    return null;
  }
  const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):(\d+)/i);
  return match ? Number(match[1]) : null;
}

/**
 * Whether the app answers. Any HTTP status counts: a 404 on the probe path still proves a
 * server is listening and serving, which is the question this asks.
 * @param {string} url @returns {Promise<boolean>}
 */
async function responds(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      await fetch(url, { signal: controller.signal, redirect: 'manual' });
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
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
 * Everything listening on `port`, by pid. The second pass `stop` makes: a boot command that
 * hands off to a grandchild in a new process group outlives the group kill, and the port is
 * what it is still holding.
 * @param {number} port @returns {number[]}
 */
function listenersOn(port) {
  const r = exec('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
  if (!r.ok) return [];
  return r.stdout
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

/**
 * SIGTERM the whole process group, then SIGKILL whatever ignored it. The group, not the pid:
 * `pnpm dev` is a wrapper whose child is the actual server, and killing only the wrapper
 * orphans the thing holding the port.
 * @param {number[]} pids @returns {Promise<number[]>}
 */
async function stopPids(pids) {
  /** @type {number[]} */
  const signalled = [];
  for (const pid of pids) {
    let sent = false;
    // The group first — `start` spawns detached, so the child is its own group leader.
    try {
      process.kill(-pid, 'SIGTERM');
      sent = true;
    } catch {
      // No group under it, or already gone.
    }
    try {
      process.kill(pid, 'SIGTERM');
      sent = true;
    } catch {
      // Already gone.
    }
    if (sent) signalled.push(pid);
  }
  for (let waited = 0; waited < 3000 && signalled.some(alive); waited += 100) await pause(100);
  for (const pid of signalled) {
    if (!alive(pid)) continue;
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // No group.
    }
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Exited between the liveness check and the signal.
    }
  }
  return signalled;
}

/**
 * @param {import('../cli.mjs').Ctx} ctx @param {string} root
 * @returns {Promise<Record<string, unknown>>}
 */
async function start(ctx, root) {
  const contract = runContract(root);
  const { boot, source } = bootCommand(root, str(ctx.flags.boot), contract);

  const requested = Number(str(ctx.flags.port));
  const port = Number.isInteger(requested) && requested > 0 ? requested : await ephemeralPort();

  const dir = appDir();
  mkdirSync(dir, { recursive: true });
  const log = join(dir, `${Date.now()}-${process.pid}.log`);
  const record = recordPath(root);

  // Anything already recorded for this root is last round's server. Stop it first, or the
  // record is overwritten and that process becomes unreachable to every later `stop`.
  await stopRecorded(record, { quiet: true });

  const started = Date.now();
  const child = spawn(boot, {
    cwd: root,
    shell: true,
    detached: true,
    stdio: ['ignore', openSync(log, 'a'), openSync(log, 'a')],
    // PORT is what nearly every JS dev server reads; the log is what settles the truth below.
    env: { ...process.env, PORT: String(port), BROWSER: 'none' },
  });
  child.unref();
  const pid = child.pid ?? null;

  if (pid) writeFileSync(record, `${JSON.stringify({ root, pid, port, log, boot, startedAt: started }, null, 2)}\n`);

  const seconds = Number(str(ctx.flags.timeout));
  const timeoutMs = (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TIMEOUT_SECONDS) * 1000;

  let bound = port;
  let url = `http://localhost:${bound}`;
  let health = str(ctx.flags.health) ?? contract?.health ?? url;
  let healthy = false;

  while (Date.now() - started < timeoutMs) {
    // The log is re-read each pass: the real port often appears seconds after the spawn.
    const logged = portFromLog(log);
    if (logged && logged !== bound) {
      bound = logged;
      url = `http://localhost:${bound}`;
      // A contract health path is relative to whatever port the run actually bound.
      if (!str(ctx.flags.health) && contract?.health) health = rebase(contract.health, bound);
      else if (!str(ctx.flags.health) && !contract?.health) health = url;
    }
    if (await responds(health)) {
      healthy = true;
      break;
    }
    // A boot that exited is never going to answer; stop waiting out the full timeout for it.
    if (pid && !alive(pid)) break;
    await pause(PROBE_MS);
  }

  if (pid && healthy) {
    writeFileSync(record, `${JSON.stringify({ root, pid, port: bound, log, boot, startedAt: started }, null, 2)}\n`);
  }

  return {
    root,
    pid,
    port: bound,
    url,
    health,
    log,
    healthy,
    ms: Date.now() - started,
    boot,
    bootSource: source,
    contract: contract ? 'declared' : 'detected',
    record,
    ...(healthy ? {} : { reason: `the app did not answer ${health} within ${Math.round(timeoutMs / 1000)}s — read ${log}` }),
  };
}

/**
 * Point a contract health URL at the port the run actually bound, keeping its path.
 * @param {string} health @param {number} port @returns {string}
 */
function rebase(health, port) {
  try {
    const parsed = new URL(health);
    parsed.port = String(port);
    return parsed.toString();
  } catch {
    return health;
  }
}

/**
 * @param {string} record @param {{quiet?: boolean}} [opts]
 * @returns {Promise<{stopped: number[], port: number | null}>}
 */
async function stopRecorded(record, opts = {}) {
  /** @type {{pid?: number, port?: number} | null} */
  let saved = null;
  try {
    saved = JSON.parse(readFileSync(record, 'utf8'));
  } catch {
    return { stopped: [], port: null };
  }
  const port = typeof saved?.port === 'number' ? saved.port : null;
  /** @type {number[]} */
  const targets = [];
  if (typeof saved?.pid === 'number' && alive(saved.pid)) targets.push(saved.pid);
  // The port sweep is what catches a server the recorded pid handed off to.
  if (port) for (const pid of listenersOn(port)) if (!targets.includes(pid)) targets.push(pid);

  const stopped = await stopPids(targets);
  try {
    rmSync(record, { force: true });
  } catch {
    // Nothing to remove.
  }
  if (opts.quiet) return { stopped, port };
  return { stopped, port };
}

/**
 * @param {import('../cli.mjs').Ctx} ctx @param {string} root
 * @returns {Promise<Record<string, unknown>>}
 */
async function stop(ctx, root) {
  /** @type {string[]} */
  const records = [];
  if (bool(ctx.flags.all)) {
    try {
      for (const name of readdirSync(appDir())) if (name.endsWith('.json')) records.push(join(appDir(), name));
    } catch {
      // Nothing has ever started here.
    }
  } else {
    records.push(recordPath(root));
  }

  /** @type {number[]} */
  const stopped = [];
  /** @type {number[]} */
  const ports = [];
  for (const record of records) {
    const result = await stopRecorded(record);
    for (const pid of result.stopped) if (!stopped.includes(pid)) stopped.push(pid);
    if (result.port) ports.push(result.port);
  }

  // An explicit --port stops a server this device never recorded — the one a run left behind
  // before this verb existed, or one started by hand.
  const asked = Number(str(ctx.flags.port));
  if (Number.isInteger(asked) && asked > 0) {
    const extra = await stopPids(listenersOn(asked).filter((pid) => !stopped.includes(pid)));
    for (const pid of extra) stopped.push(pid);
    if (!ports.includes(asked)) ports.push(asked);
  }

  return { root, stopped, ports, already: stopped.length === 0 };
}

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const sub = ctx.positionals[0];
  const root = repoRoot(ctx.cwd);
  if (sub === 'start') return start(ctx, root);
  if (sub === 'stop') return stop(ctx, root);
  throw new UsageError(`unknown subcommand \`${sub ?? ''}\` — expected start or stop`, { usage });
}
