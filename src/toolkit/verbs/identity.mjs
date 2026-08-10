// `identity` — which GitHub account this checkout's remote wants, and switching to it.
//
// A device logged in as more than one account has to pick one per repository, and the
// pick is not a judgment call: the account that can write to `owner/repo` is `owner`. The
// verb exists because the hand-rolled alternative is
// `GH_TOKEN="$(gh auth token --user <login>)" <command>` — an assignment wrapping a
// command substitution, which the workflow gates refuse, and which guesses at the login
// rather than reading it off the remote.
//
// `pr` already resolves this on its own behalf; this verb is for the calls that are not
// `pr` — a `gh pr edit` appending to a description, a `gh api` write.
import { bool } from '../lib/flags.mjs';
import { identity } from '../lib/gh.mjs';
import { run as exec, ToolkitError } from '../lib/proc.mjs';
import { repoRoot } from '../lib/repo.mjs';

export const usage = `identity [--select]

Report which GitHub account this checkout's origin remote belongs to, which account
\`gh\` is currently using, and the plain command that reconciles them.

  --select   Run that command — \`gh auth switch --user <owner>\` — when the active
             account is not the owner and the device is logged in as the owner.

Never compose \`GH_TOKEN="$(gh auth token --user <login>)" <command>\` instead. The
assignment-plus-substitution shape is refused by the workflow gates, and the login it
guesses at is already known here: it is the remote's owner.`;

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const cwd = repoRoot(ctx.cwd);
  const found = identity(cwd);

  if (!bool(ctx.flags.select)) return { ...found, switched: false };

  if (found.matches) return { ...found, switched: false, reason: 'already the active account' };

  if (!found.owner) {
    throw new ToolkitError('no GitHub owner to switch to — origin is not a GitHub remote', { ...found });
  }

  if (!found.loggedIn) {
    throw new ToolkitError(
      `this device is not logged in as ${found.owner} — run \`gh auth login\` for that account first`,
      { ...found },
    );
  }

  const r = exec('gh', ['auth', 'switch', '--user', found.owner], { cwd });
  if (!r.ok) {
    throw new ToolkitError('gh auth switch failed', { ...found, code: r.code, stderr: r.stderr });
  }

  // Re-read rather than assume: the switch is only done if `gh` now reports it.
  return { ...identity(cwd), switched: true };
}
