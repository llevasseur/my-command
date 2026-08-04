// Process helpers shared by every verb. Zero dependencies: the toolkit ships as
// raw source and runs straight from a plugin clone, so it can never import anything
// that isn't in Node's standard library.
import { spawnSync } from 'node:child_process';

/**
 * @typedef {object} RunResult
 * @property {number} code
 * @property {string} stdout
 * @property {string} stderr
 * @property {boolean} ok
 * @property {boolean} missing  Binary was not found on PATH.
 */

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{cwd?: string, input?: string, raw?: boolean, env?: Record<string, string>}} [opts]
 * @returns {RunResult}
 */
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    input: opts.input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // Merged rather than replaced: a verb overrides one variable (an owner-scoped
    // GH_TOKEN) and still needs PATH, HOME, and the rest of the caller's environment.
    ...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
  });
  const missing = Boolean(r.error && /** @type {NodeJS.ErrnoException} */ (r.error).code === 'ENOENT');
  // `raw` keeps significant leading whitespace — git's porcelain status codes are
  // two columns wide and a trim eats the space that means "unstaged".
  const clean = (/** @type {string | undefined} */ s) => (opts.raw ? s || '' : (s || '').trim());
  return {
    code: r.status ?? (missing ? 127 : 1),
    stdout: clean(r.stdout),
    stderr: clean(r.stderr),
    ok: !missing && r.status === 0,
    missing,
  };
}

/**
 * Run a command that must succeed. Throws ToolkitError with both streams attached
 * so the caller never has to re-run it to find out why it failed.
 * @param {string} cmd
 * @param {string[]} args
 * @param {{cwd?: string, input?: string, raw?: boolean, env?: Record<string, string>}} [opts]
 * @returns {string} stdout
 */
export function must(cmd, args, opts = {}) {
  const r = run(cmd, args, opts);
  if (r.missing) throw new ToolkitError(`\`${cmd}\` is not on PATH`, { cmd, args });
  if (!r.ok) {
    throw new ToolkitError(`\`${cmd} ${args.join(' ')}\` exited ${r.code}`, {
      cmd,
      args,
      code: r.code,
      stderr: r.stderr,
      stdout: r.stdout,
    });
  }
  return r.stdout;
}

/** A failure the CLI reports as structured JSON rather than a stack trace. */
export class ToolkitError extends Error {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} [detail]
   */
  constructor(message, detail = {}) {
    super(message);
    this.name = 'ToolkitError';
    this.detail = detail;
    // The documented exit code for a failed verb or a refused guard. UsageError
    // overrides it; nothing else should.
    this.exitCode = 1;
  }
}

/**
 * The caller spelled the invocation wrong — a missing required flag, an unknown
 * subcommand. Separated from ToolkitError only so it can carry exit code 2, which the
 * CLI documents as "bad usage" and a caller uses to tell "I called it wrong" apart
 * from "it ran and said no".
 */
export class UsageError extends ToolkitError {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} [detail]
   */
  constructor(message, detail = {}) {
    super(message, detail);
    this.name = 'UsageError';
    this.exitCode = 2;
  }
}

/** @param {string} s @returns {string[]} */
export function lines(s) {
  return s.split('\n').filter((l) => l.length > 0);
}
