// Which agent host a run is driving, for the few verbs whose output differs by host.
//
// The PATH link points at whichever install ran last, so the install root a verb loaded from
// says nothing about the session calling it. The host is therefore stated, never inferred:
// a `--host` flag first, then MY_COMMAND_HOST, then Claude Code, the surface every
// pre-existing call was written for.
import { UsageError } from './proc.mjs';

/** @typedef {'claude' | 'codex' | 'copilot'} Host */

/** Each host's own config directory name, which is also where its worktrees live in a repo. */
const HOST_DIRS = /** @type {const} */ ({ claude: '.claude', codex: '.codex', copilot: '.copilot' });

export const HOSTS = /** @type {Host[]} */ (Object.keys(HOST_DIRS));

/**
 * @param {string | undefined} flag the `--host` value, if one was passed
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Host}
 */
export function resolveHost(flag, env = process.env) {
  const named = flag ?? env.MY_COMMAND_HOST;
  if (named === undefined || named === '') return 'claude';
  if (!HOSTS.includes(/** @type {Host} */ (named))) {
    throw new UsageError(`unknown host: ${named} — expected one of ${HOSTS.join(', ')}`, { host: named });
  }
  return /** @type {Host} */ (named);
}

/** The repo-relative directory a host's worktrees are created under. @param {Host} host */
export function worktreesDir(host) {
  return `${HOST_DIRS[host]}/worktrees`;
}
