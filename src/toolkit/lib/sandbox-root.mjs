// Where `sandbox` keeps its clones, and whether a checkout is one of them.
//
// The default matches `sandbox`'s own: $MY_COMMAND_SANDBOX_ROOT, then "root" in
// ~/.my-command/ab/config.json, then ~/.my-command/ab/sandboxes. A clone made under
// `sandbox --root <dir>` is recognised only when the same directory is exported as
// MY_COMMAND_SANDBOX_ROOT or set in the config file.
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { run as exec } from './proc.mjs';

/** The config file's `root`, or undefined. `sandbox` reports a malformed file; this only falls back. */
function configRoot() {
  try {
    const root = JSON.parse(readFileSync(join(homedir(), '.my-command', 'ab', 'config.json'), 'utf8'))?.root;
    return typeof root === 'string' && root.trim() !== '' ? root : undefined;
  } catch {
    return undefined;
  }
}

/** @returns {string} */
export function sandboxRoot() {
  return process.env.MY_COMMAND_SANDBOX_ROOT || configRoot() || join(homedir(), '.my-command', 'ab', 'sandboxes');
}

/** @param {string} path */
function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Whether the repository `cwd` belongs to lives under the sandbox root. Judged by the
 * common git directory, so a worktree an arm cut from its sandbox clone counts as well,
 * wherever the worktree itself sits.
 * @param {string} cwd
 * @param {string} [root]
 * @returns {boolean}
 */
export function inSandbox(cwd, root = sandboxRoot()) {
  const common = exec('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd });
  if (!common.ok || !common.stdout) return false;
  const rel = relative(real(root), real(common.stdout.trim()));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
