// `shots record|read` — what a verification loop did, written beside the screenshots it took.
//
// `/verify` ends holding two facts nothing else can derive: the driver tier that ran and
// the verdict it reached. `pr` needs the tier to decide whether a branch's screenshots
// belong in its description, and by then the loop is over. So the loop records it in the
// shots directory, which `worktree end` already moves, and the record travels with the
// images it describes.
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { str } from '../lib/flags.mjs';
import { UsageError } from '../lib/proc.mjs';
import { currentBranch, repoRoot } from '../lib/repo.mjs';
import {
  collectShots,
  findShots,
  readVerdict,
  shotsIn,
  TIERS,
  VERDICT_FILE,
  VERDICTS,
  writeVerdict,
} from '../lib/shots.mjs';

export const usage = `shots record --tier <tier> --verdict <verdict> [--rounds <n>]
shots read

  record  Write ${VERDICT_FILE} into this workspace's .my-command/shots/, recording the
          driver tier and verdict a verification loop ended on.
          --tier <tier>       ${TIERS.join(' | ')}
          --verdict <v>       ${VERDICTS.join(' | ')}
          --rounds <n>        How many rounds the loop took.
  read    Report the recorded verdict and the screenshots found for this branch, from the
          live workspace and from ~/.my-command/shots/<repo>/<branch>/ alike.

\`pr\` embeds a branch's screenshots when this record says a **browser** tier took them —
the verdict itself never gates it, since a red loop's screenshots are the ones a reviewer
most needs. A branch with screenshots and no record attaches none and says so.`;

/**
 * One of `allowed`, or a usage error naming the whole vocabulary. A tier spelled wrong
 * records cleanly and then withholds the screenshots silently.
 * @param {string | undefined} value @param {string} flag @param {string[]} allowed
 * @returns {string}
 */
function oneOf(value, flag, allowed) {
  if (!value) throw new UsageError(`--${flag} is required`, { usage });
  if (!allowed.includes(value)) {
    throw new UsageError(`--${flag} must be one of ${allowed.join(', ')} (got \`${value}\`)`, { usage });
  }
  return value;
}

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const cwd = repoRoot(ctx.cwd);
  const action = ctx.positionals[0];

  if (action === 'record') return record(ctx, cwd);
  if (action === 'read') return read(cwd);
  throw new UsageError(action ? `unknown action \`${action}\`` : 'an action is required', { usage });
}

/** @param {import('../cli.mjs').Ctx} ctx @param {string} cwd */
function record(ctx, cwd) {
  const branch = currentBranch(cwd);
  const rounds = str(ctx.flags.rounds);
  /** @type {import('../lib/shots.mjs').Verdict} */
  const record = {
    tier: oneOf(str(ctx.flags.tier), 'tier', TIERS),
    verdict: oneOf(str(ctx.flags.verdict), 'verdict', VERDICTS),
    branch,
    recordedAt: new Date().toISOString(),
  };
  if (rounds) record.rounds = Number(rounds);

  const written = writeVerdict(cwd, record);
  const dir = shotsIn(cwd);
  return { recorded: written, branch, shots: collectShots(dir).length, shotsDir: dir };
}

/** @param {string} cwd */
function read(cwd) {
  const branch = currentBranch(cwd);
  const dir = shotsIn(cwd);
  return {
    branch,
    verdict: readVerdict(cwd, branch),
    shotsDir: existsSync(dir) ? dir : null,
    shots: findShots(cwd, branch).map((s) => basename(s.path)),
  };
}
