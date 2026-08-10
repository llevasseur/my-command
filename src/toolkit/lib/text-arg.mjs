// Reading a long piece of prose — a commit message, a PR body — as a literal, a file path,
// or stdin.
//
// The file form is the advertised one: piping a multi-line string in means composing it in
// the shell, which is a heredoc, which the workflow gates refuse inside a worktree. Stdin
// still works for a real pipeline.
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

  // Given as a bare switch, `str` drops the `true` the parser recorded, so the flag reads
  // as absent. A usage error, not a fallthrough to stdin.
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
