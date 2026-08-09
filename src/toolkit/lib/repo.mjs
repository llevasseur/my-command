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
  const records = out.split('\0');
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.length < 4) continue;
    const status = record.slice(0, 2);
    entries.push({ status, path: record.slice(3), untracked: status === '??' });
    // A rename or copy spends two NUL-terminated records: the new path, then the old
    // one bare. Consume the second here or it is read back as an entry of its own,
    // inventing a file that does not exist.
    if (status[0] === 'R' || status[0] === 'C' || status[1] === 'R' || status[1] === 'C') i++;
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
 * Files changed between `baseSha` and `head` — the working tree when `head` is omitted.
 * @param {string} cwd
 * @param {string} baseSha
 * @param {string} [head]
 * @returns {{path: string, added: number, deleted: number}[]}
 */
export function diffStat(cwd, baseSha, head) {
  const out = run('git', ['diff', '--numstat', baseSha, ...(head ? [head] : [])], { cwd });
  if (!out.ok) return [];
  return lines(out.stdout).map((l) => {
    const [added, deleted, path] = l.split('\t');
    return { path, added: Number(added) || 0, deleted: Number(deleted) || 0 };
  });
}

/**
 * @typedef {object} Hunk
 * @property {string} header    The `@@ … @@` line, section heading included.
 * @property {number} oldStart
 * @property {number} newStart
 * @property {string[]} lines   `<sign><line number>\t<text>`, the number being the line's
 *                              own file: the new one for `+` and context, the old for `-`.
 */

/**
 * @typedef {object} DiffFile
 * @property {string} path
 * @property {boolean} binary
 * @property {Hunk[]} hunks
 */

/**
 * Parse `git diff` output into per-file hunks whose every line carries its line number, so
 * a caller can go straight from a hunk to an edit without opening the file to count.
 *
 * `limit` caps the characters of hunk text kept. Past it, whole files are dropped and named
 * in `omitted` rather than a hunk being cut in half — a truncated hunk reads as complete.
 * @param {string} text @param {number} limit
 * @returns {{files: DiffFile[], truncated: boolean, omitted: string[], chars: number}}
 */
export function parseDiff(text, limit) {
  /** @type {DiffFile[]} */
  const files = [];
  /** @type {string[]} */
  const omitted = [];
  /** @type {DiffFile | null} */
  let file = null;
  /** @type {Hunk | null} */
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;
  let chars = 0;
  let truncated = false;

  const keep = (/** @type {string} */ line) => {
    if (!hunk) return;
    chars += line.length + 1;
    hunk.lines.push(line);
  };

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      // Over budget: this file and every one after it is named rather than carried.
      if (chars >= limit) truncated = true;
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
      const path = m ? m[2] : line.slice('diff --git '.length);
      hunk = null;
      if (truncated) {
        omitted.push(path);
        file = null;
        continue;
      }
      file = { path, binary: false, hunks: [] };
      files.push(file);
      continue;
    }
    if (!file) continue;
    if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) {
      file.binary = true;
      continue;
    }
    if (line.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
      if (!m) continue;
      oldLine = Number(m[1]);
      newLine = Number(m[3]);
      hunk = { header: line, oldStart: oldLine, newStart: newLine, lines: [] };
      file.hunks.push(hunk);
      chars += line.length + 1;
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith('+')) keep(`+${newLine++}\t${line.slice(1)}`);
    else if (line.startsWith('-')) keep(`-${oldLine++}\t${line.slice(1)}`);
    else if (line.startsWith(' ')) {
      keep(` ${newLine}\t${line.slice(1)}`);
      newLine++;
      oldLine++;
    }
    // `\ No newline at end of file` and the extended headers carry nothing to annotate.
  }

  return { files, truncated, omitted, chars };
}
