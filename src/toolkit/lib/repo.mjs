// Git state resolution. Every verb reads the repository through these helpers so
// "what branch, what base, what changed" is answered one way, not re-derived per call.
import { lines, must, run, ToolkitError } from './proc.mjs';

/** @param {string} [cwd] @returns {string} */
export function repoRoot(cwd) {
  const r = run('git', ['rev-parse', '--show-toplevel'], { cwd });
  if (!r.ok) throw new ToolkitError('not inside a git repository', { cwd: cwd ?? process.cwd() });
  return r.stdout;
}

/**
 * The repo's default branch, preferring origin's HEAD over a guess.
 * @param {string} cwd
 * @returns {string}
 */
export function defaultBranch(cwd) {
  const sym = run('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd });
  if (sym.ok && sym.stdout) return sym.stdout.replace(/^origin\//, '');
  for (const name of ['main', 'master']) {
    if (run('git', ['rev-parse', '--verify', `refs/remotes/origin/${name}`], { cwd }).ok) return name;
  }
  return 'main';
}

/** @param {string} cwd @returns {string} */
export function currentBranch(cwd) {
  return must('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
}

/** True when cwd is a linked worktree rather than the main checkout. @param {string} cwd */
export function inWorktree(cwd) {
  const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd });
  const dir = run('git', ['rev-parse', '--path-format=absolute', '--git-dir'], { cwd });
  return common.ok && dir.ok && common.stdout !== dir.stdout;
}

/**
 * Resolve the commit this run's work sits on top of.
 * Explicit `base` wins; otherwise origin/<default>, falling back to the local ref.
 * @param {string} cwd
 * @param {string} [base]
 * @returns {{ref: string, sha: string}}
 */
export function resolveBase(cwd, base) {
  const candidates = base ? [base] : [`origin/${defaultBranch(cwd)}`, defaultBranch(cwd)];
  for (const ref of candidates) {
    const r = run('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd });
    if (r.ok) return { ref, sha: r.stdout };
  }
  throw new ToolkitError(`could not resolve a base ref (tried ${candidates.join(', ')})`, { candidates });
}

/**
 * @typedef {object} PorcelainEntry
 * @property {string} status  Two-char porcelain code, e.g. ` M`, `A `, `??`.
 * @property {string} path
 * @property {boolean} untracked
 */

/** @param {string} cwd @returns {PorcelainEntry[]} */
export function porcelain(cwd) {
  const out = must('git', ['status', '--porcelain=v1', '-z'], { cwd, raw: true });
  /** @type {PorcelainEntry[]} */
  const entries = [];
  for (const record of out.split('\0')) {
    if (record.length < 4) continue;
    const status = record.slice(0, 2);
    entries.push({ status, path: record.slice(3), untracked: status === '??' });
  }
  return entries;
}

/**
 * Commits on HEAD that are not on `baseSha`.
 * @param {string} cwd
 * @param {string} baseSha
 * @returns {{sha: string, subject: string}[]}
 */
export function commitsSince(cwd, baseSha) {
  const out = run('git', ['log', '--format=%H%x1f%s', `${baseSha}..HEAD`], { cwd });
  if (!out.ok) return [];
  return lines(out.stdout).map((l) => {
    const [sha, subject] = l.split('\x1f');
    return { sha, subject };
  });
}

/**
 * Files changed between the merge-base of `baseSha` and the working tree.
 * @param {string} cwd
 * @param {string} baseSha
 * @returns {{path: string, added: number, deleted: number}[]}
 */
export function diffStat(cwd, baseSha) {
  const out = run('git', ['diff', '--numstat', baseSha], { cwd });
  if (!out.ok) return [];
  return lines(out.stdout).map((l) => {
    const [added, deleted, path] = l.split('\t');
    return { path, added: Number(added) || 0, deleted: Number(deleted) || 0 };
  });
}
