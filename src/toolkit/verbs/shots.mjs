// `shots record|read` — what a verification loop did, written beside the screenshots it took.
//
// `/verify` ends holding two facts nothing else can derive: the driver tier that ran and
// the verdict it reached. `pr` needs the tier to decide whether a branch's screenshots
// belong in its description, and by then the loop is over. So the loop records it in its own
// run directory in the keep, beside the images that round took, and the record travels with
// the images it describes because it never leaves them.
import { bool, list, str } from '../lib/flags.mjs';
import { UsageError } from '../lib/proc.mjs';
import { currentBranch, repoRoot } from '../lib/repo.mjs';
import {
  baselineOf,
  collectShots,
  findShots,
  KEEP_MAX_AGE_DAYS,
  noteFor,
  openRunDir,
  parseShotNote,
  pruneKeep,
  readVerdict,
  runsFor,
  TIERS,
  VERDICT_FILE,
  VERDICTS,
  writeVerdict,
} from '../lib/shots.mjs';

export const usage = `shots record --tier <tier> --verdict <verdict> [--rounds <n>] [--shot <note>]... [--gap <text>]...
shots read
shots prune [--max-age-days <n>] [--dry-run]

  record  Write ${VERDICT_FILE} into this run's directory in the keep —
          ~/.my-command/shots/<repo>/<branch>/run-N/, the one \`worktree begin\` reported
          as \`shotsDir\` — recording the driver tier and verdict a verification loop
          ended on, and what the verifier said it saw in each screenshot. Recording
          closes the run, so the next loop in this workspace opens its own directory
          rather than writing over this one.
          --tier <tier>       ${TIERS.join(' | ')}
          --verdict <v>       ${VERDICTS.join(' | ')}
          --rounds <n>        How many rounds the loop took.
          --shot <note>       One per screenshot: "<file> | <label> | <one sentence>", the
                              payload of the verifier's own \`saw:\` line. The label names
                              what the shot is and the sentence says what it proves, or
                              that it proves nothing. Repeatable.
          --gap <text>        One thing this round could not prove. Repeatable.
  read    Report the recorded verdict and the screenshots found for this branch, across
          every run directory under ~/.my-command/shots/<repo>/<branch>/ and the live
          workspace alike. A screenshot is named for the run it came from.
          \`runs\` breaks that down one entry per run directory, newest first, each with
          its tier, verdict and every image by absolute path with the label and sentence
          its own run recorded. \`baseline\` is the newest of those that is not the run
          still open here and did photograph something, or null on a branch nobody has
          verified before. That is what a fresh round is handed to compare against.
  prune   Drop the run directories in ~/.my-command/shots/ whose newest file is older
          than the cutoff, images and verdict file together. The run ages out, not the
          branch, so a stale round goes without taking a fresh one on the same branch
          with it. \`worktree end\` runs this itself, so it rarely needs calling by hand.
          --max-age-days <n>  How old a run's newest file may be. Default ${KEEP_MAX_AGE_DAYS}.
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

  const { file, dir, run } = writeVerdict(cwd, branch, record);
  const shots = collectShots(dir);
  // Reported, never refused: the tier `pr` gates on is already written.
  const undescribed = shots.filter((name) => !noteFor(notes, name));
  const unmatched = notes.filter((note) => !shots.some((name) => noteFor([note], name))).map((note) => note.name);
  return {
    recorded: file,
    branch,
    run,
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
  const runs = runsFor(cwd, branch);
  return {
    branch,
    verdict: readVerdict(cwd, branch),
    // The run still open here, if one is. A workspace whose loop already recorded has none,
    // and its screenshots are found by branch below rather than by this path.
    shotsDir: openRunDir(cwd, branch),
    // Named for the run each came from, since two runs can hold the same filename.
    shots: findShots(cwd, branch).map((s) => s.name),
    runs,
    // What a fresh round compares itself against, resolved here so no caller has to work out
    // which of `runs` is theirs and which is an earlier round's.
    baseline: baselineOf(runs),
  };
}
