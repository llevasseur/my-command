// `shots record|read` — what a verification loop did, written beside the screenshots it took.
//
// `/verify` ends holding two facts nothing else can derive: the driver tier that ran and
// the verdict it reached. `pr` needs the tier to decide whether a branch's screenshots
// belong in its description, and by then the loop is over. So the loop records it in the
// shots directory, which `worktree end` already moves, and the record travels with the
// images it describes.
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { bool, list, str } from '../lib/flags.mjs';
import { UsageError } from '../lib/proc.mjs';
import { currentBranch, repoRoot } from '../lib/repo.mjs';
import {
  collectShots,
  findShots,
  KEEP_MAX_AGE_DAYS,
  noteFor,
  parseShotNote,
  pruneKeep,
  readVerdict,
  shotsIn,
  TIERS,
  VERDICT_FILE,
  VERDICTS,
  writeVerdict,
} from '../lib/shots.mjs';

export const usage = `shots record --tier <tier> --verdict <verdict> [--rounds <n>] [--shot <note>]... [--gap <text>]...
shots read
shots prune [--max-age-days <n>] [--dry-run]

  record  Write ${VERDICT_FILE} into this workspace's .my-command/shots/, recording the
          driver tier and verdict a verification loop ended on, and what the verifier
          said it saw in each screenshot.
          --tier <tier>       ${TIERS.join(' | ')}
          --verdict <v>       ${VERDICTS.join(' | ')}
          --rounds <n>        How many rounds the loop took.
          --shot <note>       One per screenshot: "<file> | <label> | <one sentence>", the
                              payload of the verifier's own \`saw:\` line. The label names
                              what the shot is and the sentence says what it proves, or
                              that it proves nothing. Repeatable.
          --gap <text>        One thing this round could not prove. Repeatable.
  read    Report the recorded verdict and the screenshots found for this branch, from the
          live workspace and from ~/.my-command/shots/<repo>/<branch>/ alike.
  prune   Drop the branches in ~/.my-command/shots/ whose newest file is older than the
          cutoff, images and verdict files together. Never touches a live workspace's
          .my-command/shots/, which belongs to a run still going. \`worktree end\` runs
          this itself, so it rarely needs calling by hand.
          --max-age-days <n>  How old a branch's newest file may be. Default ${KEEP_MAX_AGE_DAYS}.
          --dry-run           Report what would go and remove nothing.

\`pr\` embeds a branch's screenshots when this record says a **browser** tier took them —
the verdict itself never gates it, since a red loop's screenshots are the ones a reviewer
most needs. A screenshot with no \`--shot\` is published as unlabelled and reported under
\`undescribed\`. A branch with screenshots and no record attaches none and says so.`;

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
  const action = ctx.positionals[0];

  // `prune` reads the device-wide keep, so it answers from outside a repository too.
  if (action === 'prune') return prune(ctx);
  if (action === 'record') return record(ctx, repoRoot(ctx.cwd));
  if (action === 'read') return read(repoRoot(ctx.cwd));
  throw new UsageError(action ? `unknown action \`${action}\`` : 'an action is required', { usage });
}

/** @param {import('../cli.mjs').Ctx} ctx */
function prune(ctx) {
  const given = str(ctx.flags['max-age-days']);
  const maxAgeDays = given === undefined ? KEEP_MAX_AGE_DAYS : Number(given);
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
    throw new UsageError(`--max-age-days must be a non-negative number (got \`${given}\`)`, { usage });
  }
  return pruneKeep({ maxAgeDays, dryRun: bool(ctx.flags['dry-run']) });
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

  // One note per file, the last `--shot` for it winning: the caller passes the latest round's
  // read-back, and an earlier line for the same shot is superseded.
  /** @type {Map<string, import('../lib/shots.mjs').ShotNote>} */
  const byName = new Map();
  for (const value of list(ctx.flags.shot)) {
    const note = parseShotNote(value);
    if (!note) {
      throw new UsageError(`--shot must read "<file> | <label> | <description>" (got \`${value}\`)`, { usage });
    }
    byName.delete(note.name);
    byName.set(note.name, note);
  }
  const notes = [...byName.values()];
  if (notes.length) record.shots = notes;
  const gaps = list(ctx.flags.gap)
    .map((gap) => gap.trim())
    .filter(Boolean);
  if (gaps.length) record.gaps = gaps;

  const written = writeVerdict(cwd, record);
  const dir = shotsIn(cwd);
  const shots = collectShots(dir);
  // Reported, never refused: the tier `pr` gates on is already written.
  const undescribed = shots.filter((name) => !noteFor(notes, name));
  const unmatched = notes.filter((note) => !shots.some((name) => noteFor([note], name))).map((note) => note.name);
  return {
    recorded: written,
    branch,
    shots: shots.length,
    described: notes.length,
    undescribed,
    unmatched,
    shotsDir: dir,
  };
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
