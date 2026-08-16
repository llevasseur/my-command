// `verify` — run the repo's own gates and report pass/fail structurally.
// The point is the output contract: passing gates return no log at all, and a failing
// gate returns a bounded tail. Callers stop hand-rolling `2>&1 | tail -12` and stop
// re-running a whole build because they guessed the window too small.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bool, list, str } from '../lib/flags.mjs';
import { run as exec } from '../lib/proc.mjs';
import { repoRoot } from '../lib/repo.mjs';

export const usage = `verify [--only <script,...>] [--tail <n>] [--background]

Run the repo's verification scripts and report which passed.

  --only <script,...>  Run just these package.json scripts, in the order given.
  --tail <n>           Lines of output kept for a failing gate (default 40).
  --background         Start the same run detached and return immediately with the
                       one call that waits for it. Nothing to poll: send \`wait.call\`
                       verbatim and its completion notice carries the verdict.`;

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

/** @param {string} root @returns {Record<string, string>} */
function scriptsOf(root) {
  const pkg = join(root, 'package.json');
  if (!existsSync(pkg)) return {};
  try {
    const parsed = JSON.parse(readFileSync(pkg, 'utf8'));
    return parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
  } catch {
    return {};
  }
}

/** @param {string} text @param {number} n */
function tail(text, n) {
  const all = text.split('\n');
  return all.length <= n ? text : all.slice(-n).join('\n');
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
  const dir = join(process.env.MY_COMMAND_VERIFY_DIR ?? tmpdir(), 'my-command-verify');
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
      tool: 'Bash',
      // One call, one notification, and it ends itself. `sleep` inside a backgrounded command
      // is the form the harness allows; a foreground wait is refused outright.
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
      'Send wait.input as a single Bash call with run_in_background true. Do not read log or ' +
      'result before its completion notice arrives; the notice is what says the run is over.',
  };
}

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
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

  return {
    root,
    packageManager: pm,
    available: Object.keys(scripts),
    ran,
    missing,
    pass: verified && ran.every((r) => r.ok) && missing.length === 0,
    verified,
    ...(verified ? {} : { reason: 'no recognized verification gate to run' }),
  };
}
