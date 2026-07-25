// Where the toolkit lives, and in what order to look for it.
//
// A command is a Markdown prompt with no idea how it was installed — plugin clone,
// npx wizard copy, or a symlink back into a dev checkout. Pinning the lookup order in
// one place is what lets every one of those spell the call the same way.
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The Claude config directory, honoring CLAUDE_CONFIG_DIR when the user relocates it. */
export function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

/** The device-wide install root: the shared logic folder every command can reach. */
export function deviceRoot() {
  return join(claudeDir(), 'my-command');
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
