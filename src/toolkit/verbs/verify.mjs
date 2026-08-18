// `verify` — run the repo's own gates and report pass/fail structurally.
// The point is the output contract: passing gates return no log at all, and a failing
// gate returns a bounded tail. Callers stop hand-rolling `2>&1 | tail -12` and stop
// re-running a whole build because they guessed the window too small.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bool, list, str } from '../lib/flags.mjs';
import { asRecord, recordOrEmpty } from '../lib/json.mjs';
import { run as exec, ToolkitError } from '../lib/proc.mjs';
import { repoRoot } from '../lib/repo.mjs';

export const usage = `verify [--only <script,...>] [--tail <n>] [--background] [--wait [<verdict>]]

Run the repo's verification scripts and report which passed.

  --only <script,...>  Run just these package.json scripts, in the order given.
  --tail <n>           Lines of output kept for a failing gate (default 40).
  --background         Start the same run detached and return immediately with the
                       one call that waits for it.
  --wait [<verdict>]   Block until a detached run finishes, then print its whole report
                       and exit on its verdict — one call, no polling, no watch to arm.
                       With no argument it waits on the most recent detached run.
  --wait-timeout <s>   Give up waiting after this many seconds (default 570, which lands
                       inside the Bash tool's 600s ceiling). Timing out reports the run as
                       still going; it never kills it.

The wait is the point. A detached run writes its JSON report and *then* its verdict file,
so there is provably nothing to read before the verdict appears — polling the report early
returns the same nothing every time. \`--wait\` is the call that ends when the gates do.`;

// Ordered by how fast they fail: a lint error should not wait on a build.
const PREFERRED = ['check', 'lint', 'format:check', 'typecheck', 'test', 'build'];

/** @type {[string, string][]} */
const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['package-lock.json', 'npm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
];

/** @param {string} root @returns {string} */
function packageManager(root) {
  for (const [lock, pm] of LOCKFILES) if (existsSync(join(root, lock))) return pm;
  return 'npm';
}

/**
 * The repo's npm scripts, read at the one place package.json enters this verb. A repo
 * without a manifest, with an unreadable one, or with no `scripts` record in it all
 * answer the same way — no gates — so everything below runs over a plain name→command
 * record rather than over whatever the file happened to hold.
 * @param {string} root @returns {Record<string, string>}
 */
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

/** @param {string} text @param {number} n */
function tail(text, n) {
  const all = text.split('\n');
  return all.length <= n ? text : all.slice(-n).join('\n');
}

/** Where detached runs leave their verdict, report, and log. */
function verifyDir() {
  return join(process.env.MY_COMMAND_VERIFY_DIR ?? tmpdir(), 'my-command-verify');
}

/**
 * Seconds to block before giving up. Under the Bash tool's 600s ceiling on purpose: a wait
 * that outlives its own call is indistinguishable from a hung one, and the caller learns
 * nothing. Timing out reports the run as still going and never kills it.
 */
const DEFAULT_WAIT_SECONDS = 570;

/** How often the wait re-checks for the verdict file. In-process, so no agent is sleeping. */
const POLL_MS = 400;

/**
 * Block this process for `ms`. A tool may sleep; an agent may not.
 * @param {number} ms
 */
function pause(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // No shared memory available; fall through to a tighter loop rather than failing the wait.
  }
}

/**
 * The verdict file this wait is for. An explicit path wins; otherwise the most recent detached
 * run in the verify directory, identified by the `.log` the spawn creates immediately — the
 * verdict itself does not exist yet, which is precisely what is being waited for.
 * @param {string | undefined} given
 * @returns {string}
 */
function verdictPath(given) {
  if (given) return given.endsWith('.verdict') ? given : `${given}.verdict`;

  const dir = verifyDir();
  let newest = null;
  let newestAt = 0;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.log')) continue;
      const at = statSync(join(dir, name)).mtimeMs;
      if (at <= newestAt) continue;
      newestAt = at;
      newest = join(dir, `${name.slice(0, -'.log'.length)}.verdict`);
    }
  } catch {
    // No directory at all: no detached run has ever started here.
  }
  if (!newest) {
    throw new ToolkitError(
      'no detached verify run to wait on — start one with `my-command-tools verify --background`',
      {
        dir,
      },
    );
  }
  return newest;
}

/**
 * Block until a detached verify run finishes, then return its whole report.
 *
 * Refusing the poll left an agent with nothing to do but poll again: recorded sessions read the
 * same report fifteen and twenty times, and two died inside the loop. The report is written
 * atomically at exit — the detached wrapper writes the JSON *before* the verdict — so every one
 * of those reads was guaranteed to return nothing new.
 * @param {string | undefined} given @param {number} timeoutMs
 * @returns {Record<string, unknown>}
 */
function waitFor(given, timeoutMs) {
  const verdict = verdictPath(given);
  const result = `${verdict.slice(0, -'.verdict'.length)}.json`;
  const log = `${verdict.slice(0, -'.verdict'.length)}.log`;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    let ready = false;
    try {
      ready = statSync(verdict).size > 0;
    } catch {
      // Not written yet.
    }
    if (ready) break;
    pause(POLL_MS);
  }

  const waitedMs = Date.now() - started;
  let verdictLine = '';
  try {
    verdictLine = readFileSync(verdict, 'utf8').trim();
  } catch {
    // Still absent: the timeout below reports it.
  }

  if (!verdictLine) {
    return {
      pass: false,
      waited: { ms: waitedMs, timedOut: true, verdict, result, log },
      reason:
        `the detached verify run has not finished after ${Math.round(waitedMs / 1000)}s. It is still going — ` +
        'nothing was killed. Re-issue this same `--wait` call to keep blocking, or read the log if you ' +
        'suspect it is stuck.',
    };
  }

  // The report is written before the verdict, so a verdict on disk means a complete report is
  // too. Anything unreadable here is a genuine fault rather than a race.
  let report;
  try {
    report = JSON.parse(readFileSync(result, 'utf8'));
  } catch (err) {
    return {
      pass: false,
      waited: { ms: waitedMs, timedOut: false, verdict, result, log },
      verdictLine,
      reason: `the run finished with "${verdictLine}" but its report at ${result} could not be read: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  return { ...report, waited: { ms: waitedMs, timedOut: false, verdict, result, log } };
}

/**
 * Start this same verify run detached and hand back the single call that waits for it.
 *
 * A full gate sweep outlives the Bash tool's two-minute window, so callers background it
 * themselves and then have nothing to wait *on* — the recorded shape is a log file read three
 * and five times while the run is still going, with a duplicate-watch refusal between each
 * read. Refusing those reads was rung 3 and it held; what it did not do was give the wait
 * anywhere to go. This does: the run writes one verdict file, and `wait.call` is a backgrounded
 * command that exits the moment that file appears and prints the verdict as it goes, so the
 * caller arms exactly one watch, reads nothing, and is told the answer by the completion notice.
 * @param {string} root @param {string[]} requested @param {number} tailLines
 * @returns {Record<string, unknown>}
 */
function background(root, requested, tailLines) {
  const dir = verifyDir();
  mkdirSync(dir, { recursive: true });
  const stamp = `${Date.now()}-${process.pid}`;
  const verdict = join(dir, `${stamp}.verdict`);
  const result = join(dir, `${stamp}.json`);
  const log = join(dir, `${stamp}.log`);

  const cli = join(dirname(dirname(fileURLToPath(import.meta.url))), 'cli.mjs');
  const args = ['--cwd', root, '--tail', String(tailLines)];
  for (const only of requested) args.push('--only', only);
  // A tiny wrapper rather than a shell redirect chain: it has to write the verdict file
  // *after* the JSON one, so a wait that sees the verdict can read a complete result.
  const child = spawn(
    process.execPath,
    [
      '-e',
      'const {execFileSync}=require("node:child_process"),fs=require("node:fs");' +
        'let out="",code=0;' +
        'try{out=execFileSync(process.argv[1],["verify",...process.argv.slice(4)],{encoding:"utf8",maxBuffer:64*1024*1024});}' +
        'catch(e){code=1;out=String(e.stdout??"")||JSON.stringify({pass:false,error:String(e.message)});}' +
        'fs.writeFileSync(process.argv[2],out);' +
        'fs.writeFileSync(process.argv[3],(code===0?"PASS":"FAIL")+" verify "+process.argv[2]+"\\n");',
      cli,
      result,
      verdict,
      ...args,
    ],
    { cwd: root, detached: true, stdio: ['ignore', openSync(log, 'a'), openSync(log, 'a')] },
  );
  child.unref();

  return {
    root,
    background: true,
    pid: child.pid ?? null,
    result,
    verdict,
    log,
    wait: {
      // The whole wait, in one foreground call that returns the report itself. Nothing to
      // arm, nothing to read afterwards, and the exit code is the verdict.
      blocking: `my-command-tools verify --wait ${verdict}`,
      blockingCall: {
        tool: 'Bash',
        input: {
          command: `my-command-tools verify --wait ${verdict}`,
          timeout: 600000,
          description: 'Block until the detached verify run finishes and print its report',
        },
      },
      tool: 'Bash',
      // Kept for a caller that would rather be notified than blocked. One call, one
      // notification, and it ends itself; a foreground `sleep` is refused outright.
      input: {
        run_in_background: true,
        command: `until [ -s ${verdict} ]; do sleep 2; done; cat ${verdict}`,
        description: 'Wait for the backgrounded verify run to finish',
      },
      // Named `next` rather than `then`: an object carrying a `then` key is a thenable, and
      // this one is returned as JSON and re-parsed by callers that may well await it.
      next: `Read({file_path: "${result}"}) — once, after that notification arrives.`,
    },
    note:
      `Send wait.blockingCall: one foreground Bash call, with its timeout, that returns this ` +
      `run's whole report and exits on its verdict. Prefer it — there is nothing to poll and ` +
      `no second call to make.\n` +
      `The report at ${result} is written atomically, before the verdict file, so it does not ` +
      `exist at all until the run is over. Reading it early returns the same nothing every ` +
      `time; that is why the wait is a call rather than a loop.\n` +
      `wait.input is the notified alternative for a caller that must stay free meanwhile: ` +
      `background it, and read result only once its completion notice arrives.`,
  };
}

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  // Before anything else, and before `repoRoot`: a wait is about a run that already started
  // somewhere, and the directory this call happens to be in is not part of the question.
  if (ctx.flags.wait !== undefined) {
    // Bare `--wait` waits on the newest run; `--wait <verdict>` names one, and `str`
    // already reports the bare form as no verdict given.
    const given = str(ctx.flags.wait);
    const seconds = Number(str(ctx.flags['wait-timeout']));
    const timeoutMs = (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_WAIT_SECONDS) * 1000;
    return waitFor(given, timeoutMs);
  }

  const root = repoRoot(ctx.cwd);
  const scripts = scriptsOf(root);
  const pm = packageManager(root);
  // A non-numeric --tail must not become NaN: `slice(-NaN)` silently returns the whole
  // log, which is the one thing this flag exists to prevent.
  const requestedTail = Number(str(ctx.flags.tail));
  const tailLines = Number.isFinite(requestedTail) && requestedTail > 0 ? requestedTail : 40;

  const requested = list(ctx.flags.only)
    .flatMap((v) => v.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  // Every `check:*` gate counts — repos put their bespoke invariants there
  // (this repo's own `check:commands` is one).
  const discovered = [...PREFERRED, ...Object.keys(scripts).filter((s) => s.startsWith('check:'))];
  const selected = (requested.length > 0 ? requested : discovered).filter((s) => s in scripts);

  // Detached *after* the flags are read, so a mistyped --tail or --only is reported here
  // rather than inside a child nobody is watching.
  if (bool(ctx.flags.background)) return background(root, requested, tailLines);

  // Only an explicit --only can name a script that isn't there; the discovered list is
  // drawn from package.json, so a gate absent from it is absent by design, not a mistake.
  const missing = requested.filter((s) => !(s in scripts));

  /** @type {{script: string, ok: boolean, code: number, ms: number, output?: string}[]} */
  const ran = [];
  for (const script of selected) {
    const started = Date.now();
    const r = exec(pm, ['run', script], { cwd: root });
    /** @type {{script: string, ok: boolean, code: number, ms: number, output?: string}} */
    const entry = { script, ok: r.ok, code: r.code, ms: Date.now() - started };
    if (!r.ok) entry.output = tail([r.stdout, r.stderr].filter(Boolean).join('\n'), tailLines);
    ran.push(entry);
  }

  // No package.json, or one with no recognizable gate. `ran.every` on an empty array is
  // true, so without this the verb would answer "pass" for a run that executed nothing —
  // and a caller branching on the exit code would read that as verified.
  const verified = ran.length > 0;

  const answer = {
    root,
    packageManager: pm,
    available: Object.keys(scripts),
    ran,
    missing,
    pass: verified && ran.every((r) => r.ok) && missing.length === 0,
    verified,
    /** @type {string | undefined} */
    reason: undefined,
  };
  // Only a run that verified nothing owes an explanation; `JSON.stringify` drops the key
  // for every run that does not.
  if (!verified) answer.reason = 'no recognized verification gate to run';
  return answer;
}
