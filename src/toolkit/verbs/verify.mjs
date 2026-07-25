// `verify` — run the repo's own gates and report pass/fail structurally.
// The point is the output contract: passing gates return no log at all, and a failing
// gate returns a bounded tail. Callers stop hand-rolling `2>&1 | tail -12` and stop
// re-running a whole build because they guessed the window too small.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { list, str } from '../lib/flags.mjs';
import { run as exec } from '../lib/proc.mjs';
import { repoRoot } from '../lib/repo.mjs';

export const usage = `verify [--only <script,...>] [--tail <n>]

Run the repo's verification scripts and report which passed.

  --only <script,...>  Run just these package.json scripts, in the order given.
  --tail <n>           Lines of output kept for a failing gate (default 40).`;

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

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const root = repoRoot(ctx.cwd);
  const scripts = scriptsOf(root);
  const pm = packageManager(root);
  const tailLines = Number(str(ctx.flags.tail) ?? 40);

  const requested = list(ctx.flags.only)
    .flatMap((v) => v.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  // Every `check:*` gate counts — repos put their bespoke invariants there
  // (this repo's own `check:commands` is one).
  const discovered = [...PREFERRED, ...Object.keys(scripts).filter((s) => s.startsWith('check:'))];
  const selected = (requested.length > 0 ? requested : discovered).filter((s) => s in scripts);

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

  return {
    root,
    packageManager: pm,
    available: Object.keys(scripts),
    ran,
    missing,
    pass: ran.every((r) => r.ok) && missing.length === 0,
    // No package.json, or one with no recognizable gate — say so rather than
    // reporting a vacuous pass the caller would read as "verified".
    verified: ran.length > 0,
  };
}
