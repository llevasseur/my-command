// Recognizing the Bash command shapes that fail for a known reason.
//
// Each function here answers about the command's *shape*, from evidence on this device —
// a glob that matches nothing, a `sleep` in the foreground, a heredoc composing a file,
// a path that belongs to another directory tree. None of them guesses at intent: every
// shape below either fails outright when it runs or is refused by the harness.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/** Binaries that dump a file's contents. `grep`/`rg` are absent: locating a symbol in a
 * file already in context is the faster form the re-read gate recommends. */
const DUMPERS = new Set(['cat', 'head', 'tail', 'sed', 'nl', 'less', 'more', 'bat']);

/** Characters that make a token's expansion something other than what is written. */
const UNJUDGEABLE = /[$`[\]{}~]|\*\*/;

/**
 * @typedef {object} Token
 * @property {string} text   The token with quotes stripped.
 * @property {boolean} quoted Any part of it was inside quotes, so the shell will not expand it.
 */

/**
 * Split a command the way a shell would, tracking which tokens were quoted. Quoting is the
 * whole question for the glob gate, so it cannot be answered by `split(/\s+/)`.
 * @param {string} command
 * @returns {Token[]}
 */
export function tokenize(command) {
  /** @type {Token[]} */
  const out = [];
  let text = '';
  let quoted = false;
  let started = false;
  /** @type {'"' | "'" | null} */
  let inside = null;

  const flush = () => {
    if (started) out.push({ text, quoted });
    text = '';
    quoted = false;
    started = false;
  };

  for (const ch of command) {
    if (inside) {
      if (ch === inside) inside = null;
      else text += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inside = ch;
      quoted = true;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    started = true;
    text += ch;
  }
  flush();
  return out;
}

/**
 * Match a shell glob against one directory entry. Only `*` and `?` — a token carrying any
 * other pattern syntax is skipped by the caller rather than approximated here.
 * @param {string} pattern @param {string} name
 * @returns {boolean}
 */
function globMatches(pattern, name) {
  // zsh's `*` does not match a leading dot unless the pattern has one.
  if (name.startsWith('.') && !pattern.startsWith('.')) return false;
  const rx = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')}$`,
  );
  return rx.test(name);
}

/**
 * The first unquoted glob in `command` that matches nothing from `cwd`, or null. zsh aborts
 * the whole command with `no matches found` in that case, so nothing in it runs — including
 * the parts that would have worked.
 * @param {string} command @param {string} cwd
 * @returns {string | null}
 */
export function unmatchedGlob(command, cwd) {
  // A heredoc body is literal text, and a redirection target is created rather than matched.
  if (command.includes('<<')) return null;

  for (const token of tokenize(command)) {
    const text = token.text;
    if (token.quoted) continue;
    if (!/[*?]/.test(text)) continue;
    if (UNJUDGEABLE.test(text)) continue;

    const cut = text.lastIndexOf('/');
    const dir = cut === -1 ? cwd : text.slice(0, cut) || '/';
    const pattern = cut === -1 ? text : text.slice(cut + 1);
    // A glob in the directory half needs the shell's own walk; not judged here.
    if (/[*?]/.test(dir) || !pattern) continue;

    const base = isAbsolute(dir) ? dir : resolve(cwd, dir);
    let names;
    try {
      names = readdirSync(base);
    } catch {
      // No such directory, or unreadable — the failure would not be the glob.
      continue;
    }
    if (names.some((name) => globMatches(pattern, name))) continue;
    return text;
  }
  return null;
}

/**
 * The `sleep` invocation in a foreground command, or null. The harness blocks it, and blocks
 * the whole call with it, so a probe chained after the wait never runs either.
 * @param {string} command @param {boolean} background
 * @returns {string | null}
 */
export function foregroundSleep(command, background) {
  if (background) return null;
  for (const m of command.matchAll(/(?:^|[;&|(]\s*|&&\s*|\|\|\s*)(sleep\s+[\d.]+\w*)/g)) return m[1];
  return null;
}

/**
 * Whether the command composes a file from a heredoc. That shape is refused wholesale in an
 * isolated worktree, and the `Write` tool writes the same file with no shell involved.
 * @param {string} command
 * @returns {boolean}
 */
export function heredocWrite(command) {
  if (!/<<-?\s*["']?[A-Za-z_]\w*["']?/.test(command)) return false;
  return /(^|[^0-9<>&])>{1,2}[^>]/.test(command) || /\btee\b/.test(command);
}

/**
 * Whether the command reaches for the job directory from inside an isolated worktree. The
 * worktree is the only writable root there, so the guard refuses the call however the path
 * is spelled — knowing the path was never the gap.
 * @param {string} command @param {string} cwd
 * @returns {boolean}
 */
export function jobDirFromWorktree(command, cwd) {
  if (!command.includes('CLAUDE_JOB_DIR')) return false;
  return cwd.includes(`/.claude/worktrees/`);
}

/**
 * Absolute paths of existing files this command would dump in full or in part.
 * @param {string} command @param {string} cwd
 * @returns {string[]}
 */
export function dumpedFiles(command, cwd) {
  /** @type {string[]} */
  const out = [];
  for (const segment of command.split(/\|\||&&|[;|\n]/)) {
    // A redirect makes this a copy rather than a look: the contents are going somewhere.
    if (/[<>]/.test(segment)) continue;
    const tokens = tokenize(segment.trim());
    const bin = tokens[0]?.text;
    if (!bin || !DUMPERS.has(bin)) continue;
    for (const token of tokens.slice(1)) {
      const text = token.text;
      if (!text || text.startsWith('-')) continue;
      if (UNJUDGEABLE.test(text) || /[*?]/.test(text)) continue;
      const path = isAbsolute(text) ? text : resolve(cwd, text);
      try {
        if (!existsSync(path) || !statSync(path).isFile()) continue;
      } catch {
        continue;
      }
      out.push(path);
    }
  }
  return out;
}
