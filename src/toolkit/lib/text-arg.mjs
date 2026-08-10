// Reading a long piece of prose — a commit message, a PR body — from wherever the caller
// put it.
//
// The stdin form (`--message -`, `--body -`) is the one an agent reaches for first, and it
// is the one it cannot use: piping a multi-line string into a command means composing that
// string in the shell, which is a heredoc, which the workflow gates refuse wholesale inside
// an isolated worktree. Every recorded occurrence spent a refused call before rewriting.
//
// So the file form is first-class and is what the usage strings advertise. It pairs with the
// file-writing tool the refusal already names: write the prose to a path, pass the path.
// Stdin still works for a genuine pipeline; it is simply no longer the advertised route.
import { readFileSync } from 'node:fs';
import { str } from './flags.mjs';
import { ToolkitError, UsageError } from './proc.mjs';

/**
 * Resolve one piece of text given as a literal, as a file path, or on stdin.
 *
 * @param {Record<string, string | boolean | string[]>} flags
 * @param {string} name Flag name for the literal form, e.g. `message`.
 * @param {string} fileName Flag name for the file form, e.g. `message-file`.
 * @param {{usage: string, required?: boolean}} opts
 * @returns {string} The text, or '' when the flag is absent and not required.
 */
export function textArg(flags, name, fileName, opts) {
  const literal = str(flags[name]);
  const file = str(flags[fileName]);

  if (literal !== undefined && file !== undefined) {
    throw new UsageError(`--${name} and --${fileName} are mutually exclusive — give one`, { usage: opts.usage });
  }

  // Given as a bare switch, `str` drops the `true` the parser recorded — the flag is
  // present with no path rather than absent, and that is a usage error, not a fallthrough
  // to stdin.
  if (file === undefined && flags[fileName] !== undefined) {
    throw new UsageError(`--${fileName} needs a path`, { usage: opts.usage });
  }

  if (file !== undefined) {
    if (file === '') throw new UsageError(`--${fileName} needs a path`, { usage: opts.usage });
    try {
      return readFileSync(file, 'utf8');
    } catch (err) {
      throw new ToolkitError(`could not read --${fileName} ${file}`, {
        path: file,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (literal === undefined) {
    if (opts.required === false) return '';
    throw new UsageError(`--${name} or --${fileName} is required`, { usage: opts.usage });
  }

  if (literal !== '-') return literal;

  try {
    return readFileSync(0, 'utf8');
  } catch {
    throw new ToolkitError(`--${name} - was given but stdin was empty — pass --${fileName} <path> instead`, {});
  }
}
