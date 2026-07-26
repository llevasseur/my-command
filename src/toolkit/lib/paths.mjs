// Where the toolkit lives, and in what order to look for it.
//
// A command is a Markdown prompt with no idea how it was installed — plugin clone,
// npx wizard copy, or a symlink back into a dev checkout. Pinning the lookup order in
// one place is what lets every one of those spell the call the same way.
import { accessSync, constants, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/** The name a command spells the call with. Bare, so it has to be on PATH. */
export const TOOLKIT_BIN = 'my-command-tools';

/** The Claude config directory, honoring CLAUDE_CONFIG_DIR when the user relocates it. */
function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

/** The device-wide install root: the shared logic folder every command can reach. */
export function deviceRoot() {
  return join(claudeDir(), 'my-command');
}

/**
 * The fixed shim path every install writes. A PATH link points here, not at one install's
 * payload, so it survives the toolkit being replaced.
 */
export function deviceShim() {
  return join(deviceRoot(), 'bin', TOOLKIT_BIN);
}

/**
 * Where a PATH link may go, most preferred first. User-owned, so linking needs no elevation.
 * Keep in step with `linkOnPath()` in src/my-command.ts and scripts/install-personal.sh.
 * @returns {string[]}
 */
export function linkDirs() {
  return [join(homedir(), '.local', 'bin'), join(homedir(), 'bin')];
}

/**
 * PATH split into directories, empty entries dropped and trailing slashes normalized so a
 * dir compares equal however the user spelled it.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function pathDirs(env = process.env) {
  return (env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((d) => (d.length > 1 && d.endsWith('/') ? d.slice(0, -1) : d));
}

/**
 * Resolve a bare command the way a shell would, without spawning one: `command -v` in a
 * subshell would answer for the shell's PATH, not the caller's.
 * @param {string} cmd @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null} the first executable match, or null when PATH has none
 */
export function findOnPath(cmd, env = process.env) {
  for (const dir of pathDirs(env)) {
    const candidate = join(dir, cmd);
    try {
      accessSync(candidate, constants.X_OK);
      // A directory carries the execute bit as "searchable", so X_OK alone would match one.
      // statSync follows symlinks, so a link to the shim still counts as a file.
      if (!statSync(candidate).isFile()) continue;
      return candidate;
    } catch {
      // Not here, or not executable — keep looking, exactly as a shell would.
    }
  }
  return null;
}

/**
 * Candidate toolkit roots, most specific first.
 * @returns {{source: string, path: string}[]}
 */
export function candidateRoots() {
  /** @type {{source: string, path: string}[]} */
  const roots = [];
  // An explicit override wins so a checkout can test its own toolkit without installing.
  if (process.env.MY_COMMAND_TOOLKIT)
    roots.push({ source: 'MY_COMMAND_TOOLKIT', path: process.env.MY_COMMAND_TOOLKIT });
  // Plugin mode ships the toolkit beside the commands and auto-updates with them, so it
  // outranks the device copy, which is only as fresh as the last wizard run.
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    roots.push({ source: 'CLAUDE_PLUGIN_ROOT', path: join(process.env.CLAUDE_PLUGIN_ROOT, 'src', 'toolkit') });
  }
  roots.push({ source: 'device install', path: join(deviceRoot(), 'toolkit') });
  return roots;
}
