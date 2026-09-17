// `shots record|resolve|read` — what a verification loop did, written beside the screenshots
// it took.
//
// `/verify` ends holding two facts nothing else can derive: the driver tier that ran and
// the verdict it reached. `pr` needs the tier to decide whether a branch's screenshots
// belong in its description, and by then the loop is over. So the loop records it in its own
// run directory in the keep, beside the images that round took, and the record travels with
// the images it describes because it never leaves them.
//
// `record` and `resolve` are two halves of one record, split because they know different
// things at different times. The loop knows which gates went red; it does not know whether
// this branch turned them red, and it never will — that is settled afterwards, by a fix that
// clears the failure or by a look at the default branch. So `record` writes each failure with
// its provenance unset and `resolve` writes the answer onto it later. ADR 0017 carries the
// reasoning; ADR 0007 is why both halves are a verb rather than a classifier question.
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
  PROVENANCES,
  parseFailureNote,
  parseShotNote,
  pruneKeep,
  readVerdict,
  resolveFailure,
  runsFor,
  TIERS,
  VERDICT_FILE,
  VERDICTS,
  writeVerdict,
} from '../lib/shots.mjs';

export const usage = `shots record --tier <tier> --verdict <verdict> [--rounds <n>] [--shot <note>]... [--gap <text>]... [--failure <note>]...
shots resolve --failure <id> --provenance <provenance> [--note <text>]
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
          --failure <note>    One per failure this round hit: "<gate> | <what it said>".
                              Each is stored with an id derived from those two parts and a
                              provenance of null — nothing at record time knows whether the
                              branch caused it, so nothing here claims to. Repeatable.
  resolve Give one recorded failure its provenance, once somebody has established it: the
          branch introduced it and fixing the branch cleared it, or the gate was already
          red on the default branch. Every record on this branch carrying that id is
          updated, so a failure that survived four rounds reads the same in all four.
          --failure <id>      The id \`record\` derived, as \`shots read\` reports it.
          --provenance <p>    ${PROVENANCES.join(' | ')}
          --note <text>       Why it was settled that way, in your own words.
  read    Report the recorded verdict and the screenshots found for this branch, across
          every run directory under ~/.my-command/shots/<repo>/<branch>/ and the live
          workspace alike. A screenshot is named for the run it came from.
          \`runs\` breaks that down one entry per run directory, newest first, each with
          its tier, verdict, every image by absolute path with the label and sentence its
          own run recorded, and the failures it recorded. \`unresolved\` lists the failure
          ids across the branch that nobody has given a provenance yet, which is what
          \`resolve\` is waiting on. \`baseline\` is the newest of those that is not the run
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
  if (action === 'resolve') return resolve(ctx, repoRoot(ctx.cwd));
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

  // One entry per distinct failure. Two `--failure` values that describe the same failure
  // derive the same id, so a round that reports it twice records it once.
  /** @type {Map<string, import('../lib/shots.mjs').FailureNote>} */
  const byId = new Map();
  for (const value of list(ctx.flags.failure)) {
    const failure = parseFailureNote(value);
    if (!failure) {
      throw new UsageError(`--failure must read "<gate> | <what it said>" (got \`${value}\`)`, { usage });
    }
    byId.set(failure.id, failure);
  }
  const failures = [...byId.values()];
  if (failures.length) record.failures = failures;

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
    // Every one of them unresolved, by construction. Returned so the caller has the ids to
    // hand back to `resolve` without reading the record off disk to find them.
    failures,
    shotsDir: dir,
  };
}

/** @param {import('../cli.mjs').Ctx} ctx @param {string} cwd */
function resolve(ctx, cwd) {
  const branch = currentBranch(cwd);
  const id = str(ctx.flags.failure);
  if (!id) throw new UsageError('--failure is required', { usage });
  const provenance = oneOf(str(ctx.flags.provenance), 'provenance', PROVENANCES);
  const note = str(ctx.flags.note)?.trim();

  const resolved = resolveFailure(cwd, branch, id, provenance, note || undefined);
  if (!resolved.updated.length) {
    const known = resolved.known.length ? resolved.known.join(', ') : 'none — no failure was ever recorded';
    throw new UsageError(`no failure \`${id}\` on ${branch}. Recorded here: ${known}`, { usage });
  }
  return { branch, ...resolved };
}

/** @param {string} cwd */
function read(cwd) {
  const branch = currentBranch(cwd);
  const runs = runsFor(cwd, branch);
  const verdict = readVerdict(cwd, branch);
  return {
    branch,
    verdict,
    // The run still open here, if one is. A workspace whose loop already recorded has none,
    // and its screenshots are found by branch below rather than by this path.
    shotsDir: openRunDir(cwd, branch),
    // Named for the run each came from, since two runs can hold the same filename.
    shots: findShots(cwd, branch).map((s) => s.name),
    runs,
    // The failures still waiting on somebody to say where they came from. Read off the merged
    // verdict, so a failure resolved in any one run counts as resolved here.
    unresolved: (verdict?.failures ?? []).filter((failure) => !failure.provenance).map((failure) => failure.id),
    // What a fresh round compares itself against.
    baseline: baselineOf(runs),
  };
}
