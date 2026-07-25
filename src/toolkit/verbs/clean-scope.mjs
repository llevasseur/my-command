// `clean-scope` — extract the comments a /clean pass is allowed to touch.
//
// Deliberately half a command: it answers "which comment lines did this branch add or
// modify", which is mechanical, and stops there. Whether a comment is noise, a tightening
// candidate, or load-bearing is a judgment call that stays with the agent.
import { list, str } from '../lib/flags.mjs';
import { run as exec, lines } from '../lib/proc.mjs';
import { repoRoot, resolveBase } from '../lib/repo.mjs';

export const usage = `clean-scope [--base <ref>] [--path <glob>]

Report comments on lines this branch added or modified, grouped by file.

  --base <ref>   Compare against <ref> instead of origin/<default-branch>.
  --path <glob>  Limit to paths matching <glob> (repeatable).`;

// Generated and vendored files are never in scope for a comment pass.
const SKIP =
  /(^|\/)(node_modules|dist|build|vendor|__generated__|\.min\.)|\.(lock|snap)$|(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb)$/;

// Leading comment markers across the languages these commands actually run against.
const COMMENT = /^\s*(\/\/|\/\*|\*\/|\*(?!\/)|#(?!!)|<!--|\{\s*\/\*|--\s)/;

// Directives are load-bearing, not prose — never offer them up for cleaning.
const DIRECTIVE =
  /\b(biome-ignore|eslint-disable|eslint-enable|prettier-ignore|@ts-|c8 ignore|istanbul ignore|noqa|type:\s*ignore|shellcheck disable)\b|^\s*#!/;

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const cwd = repoRoot(ctx.cwd);
  const base = resolveBase(cwd, str(ctx.flags.base));
  const paths = list(ctx.flags.path);

  const args = ['diff', '--unified=0', '--no-color', `${base.sha}...HEAD`];
  if (paths.length > 0) args.push('--', ...paths);
  const committed = exec('git', args, { cwd });

  // Uncommitted edits sit on top of the branch's commits and are equally in scope.
  const workingArgs = ['diff', '--unified=0', '--no-color', 'HEAD'];
  if (paths.length > 0) workingArgs.push('--', ...paths);
  const working = exec('git', workingArgs, { cwd });

  /** @type {Map<string, {line: number, text: string}[]>} */
  const byFile = new Map();
  for (const diff of [committed.stdout, working.stdout]) {
    for (const hit of parse(diff)) {
      const found = byFile.get(hit.path) ?? [];
      if (!found.some((c) => c.line === hit.line && c.text === hit.text))
        found.push({ line: hit.line, text: hit.text });
      byFile.set(hit.path, found);
    }
  }

  const files = [...byFile.entries()]
    .map(([path, comments]) => ({ path, comments: comments.sort((a, b) => a.line - b.line) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    root: cwd,
    base,
    files,
    totalComments: files.reduce((n, f) => n + f.comments.length, 0),
    empty: files.length === 0,
  };
}

/**
 * Walk a unified diff and collect added lines that look like comments.
 * @param {string} diff
 * @returns {{path: string, line: number, text: string}[]}
 */
function parse(diff) {
  /** @type {{path: string, line: number, text: string}[]} */
  const hits = [];
  let path = '';
  let lineNo = 0;
  for (const line of lines(diff)) {
    if (line.startsWith('+++ ')) {
      path = line.slice(4).replace(/^b\//, '');
      continue;
    }
    if (line.startsWith('@@')) {
      const m = line.match(/\+(\d+)/);
      lineNo = m ? Number(m[1]) : 0;
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const text = line.slice(1);
    if (path && !SKIP.test(path) && COMMENT.test(text) && !DIRECTIVE.test(text)) {
      hits.push({ path, line: lineNo, text: text.trimEnd() });
    }
    lineNo++;
  }
  return hits;
}
