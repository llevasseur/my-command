// `ab-diff` — one `/ab` arm's full diff, scrubbed of anything that names the arm, for the
// blind judge. `git diff --no-prefix` drops the `a/` and `b/` path prefixes, which a judge
// comparing two arms could read as labels, and every `--redact` string is replaced.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { str } from '../lib/flags.mjs';
import { run as exec, ToolkitError, UsageError } from '../lib/proc.mjs';
import { repoRoot } from '../lib/repo.mjs';

export const usage = `ab-diff --range <from>...<to> [--range ...] [--redact <text>]... [--out <file>]

One /ab arm's full diff with nothing in it that names the arm.

  --range <from>...<to>  A three-dot range: what <to> changed since its merge base with
                         <from>. Repeat for an arm whose work spans several refs, such as
                         what it merged plus each PR it left open. Parts are joined in order.
  --redact <text>        Replace every occurrence with <redacted>. Repeat once per name that
                         would reveal the arm: its repo, clone path, branch, trial name.
  --out <file>           Write the diff there and report its path instead of the text.

Diffs run with --no-prefix, --no-color and --no-ext-diff. Reports files (from --numstat),
bytes, redactions (how many replacements were made), and either diff or path.`;

/** A three-dot range with a ref on each side. @param {string} range */
const isRange = (range) => {
  const sides = range.split('...');
  return sides.length === 2 && sides.every((side) => /^[^\s.]\S*$/.test(side) && !side.endsWith('.'));
};
const TOKEN = '<redacted>';

/**
 * Replace every occurrence of each string, longest first so a name that contains another
 * is replaced whole.
 * @param {string} text @param {string[]} words
 * @returns {{text: string, count: number}}
 */
export function redact(text, words) {
  let out = text;
  let count = 0;
  for (const word of [...new Set(words.filter(Boolean))].sort((x, y) => y.length - x.length)) {
    const parts = out.split(word);
    count += parts.length - 1;
    out = parts.join(TOKEN);
  }
  return { text: out, count };
}

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const ranges = ctx.flags.range?.all ?? [];
  if (!ranges.length) throw new UsageError('ab-diff needs at least one --range <from>...<to>', { usage });
  for (const r of ranges) {
    if (!isRange(r)) throw new UsageError(`--range must be <from>...<to>, got '${r}'`, { usage });
  }
  const cwd = repoRoot(ctx.cwd);
  const words = ctx.flags.redact?.all ?? [];

  /** @type {string[]} */
  const parts = [];
  /** @type {{path: string, added: number, deleted: number}[]} */
  const files = [];
  ranges.forEach((range, i) => {
    const diff = exec('git', ['diff', '--no-prefix', '--no-color', '--no-ext-diff', range], { cwd, raw: true });
    if (!diff.ok) throw new ToolkitError(`git diff ${range} failed`, { range, stderr: diff.stderr });
    const numstat = exec('git', ['diff', '--numstat', range], { cwd });
    for (const line of numstat.stdout.split('\n').filter(Boolean)) {
      const [added, deleted, path] = line.split('\t');
      files.push({ path, added: Number(added) || 0, deleted: Number(deleted) || 0 });
    }
    parts.push(ranges.length > 1 ? `# part ${i + 1} of ${ranges.length}\n${diff.stdout}` : diff.stdout);
  });

  const scrubbed = redact(parts.join('\n'), words);
  const scrubbedFiles = files.map((f) => ({ ...f, path: redact(f.path, words).text }));
  const report = { files: scrubbedFiles, bytes: Buffer.byteLength(scrubbed.text), redactions: scrubbed.count };
  const out = str(ctx.flags.out);
  if (!out) return { ...report, diff: scrubbed.text };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, scrubbed.text);
  return { ...report, path: out };
}
