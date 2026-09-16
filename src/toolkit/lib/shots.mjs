// Where a run's screenshots live, and how they reach a pull request.
//
// Three verbs share these paths. `worktree begin` opens a run directory in a device-wide
// keep, `worktree end` sweeps up anything that landed in the checkout instead, and `pr`
// publishes what it finds. The keep's layout is stated once, here, so the three cannot
// disagree about it.
//
// The keep is `<root>/<repo>/<branch…>/run-N/`, and **the run directory is the unit**: one
// verification loop's images and its own `verdict.json`, together. Two things follow from
// that and neither survives flattening it. Screenshots are written straight into the keep,
// so they outlive a teardown that never calls `worktree end` — `ExitWorktree` with
// `discard_changes`, or a bare `git worktree remove`. And a read-back binds to an image by
// sitting in the same directory as it, so two runs that both photograph `home.png` keep two
// images and two sentences, each attached to its own. Binding by filename could not: the
// keep had to rename the second image to store it, and the note still named the first.
//
// What makes a branch's screenshots publishable is the verdict `/verify` records beside
// them: a browser tier ran, or it did not. `docs/features/pr.md` covers why the shape of
// the diff cannot answer that.
//
// There is one way in, whatever the repository's visibility: an attachment comment.
// `gh pr comment --body-file <path> --attach <file>` uploads each file to GitHub's own
// `user-attachments` CDN, which serves under the reader's own credential, so a private
// repository renders it too. `docs/features/pr.md` carries the reasoning.
//
// `gh`'s exit code proves the comment was created, not that it shows anything: the
// body-to-attachment rewrite matches on the reference string, and a mismatch appends the
// images silently and leaves a dead link. So a posted comment is read back and its images
// requested — `verifyShotsComment` below.
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { ownerToken } from './gh.mjs';
import { run as exec } from './proc.mjs';

/**
 * Where a worktree's screenshots used to accumulate, relative to its root.
 *
 * Nothing writes here any more — `worktree begin` reports a run directory in the keep
 * instead. It is still read, and still swept up by `worktree end`, because a run that
 * started before that change, or any tool that still writes in-tree, would otherwise be
 * stranded in a directory about to be removed.
 */
const SHOTS = ['.my-command', 'shots'];

/** Where a workspace remembers which run directories it opened, relative to its root. */
const RUN_STATE = ['.my-command', 'run.json'];

/** A run directory's name inside a branch's keep. */
const RUN_DIR = /^run-(\d+)$/;

/** Where `/verify` records what it did, inside its run directory. */
export const VERDICT_FILE = 'verdict.json';

/** The driver tiers `mycommand-verifier` reports, and the one that takes screenshots. */
export const TIERS = ['playwright', 'http', 'static'];
const BROWSER_TIERS = new Set(['playwright']);

/** The four flat verdicts a round can end on. */
export const VERDICTS = ['green', 'red', 'unverified', 'skipped'];

/** What counts as an image worth embedding. */
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);

/** How many images a grid row carries before it wraps. */
const GRID_COLUMNS = 2;

/** How many files one `gh pr comment` call accepts. */
const ATTACH_LIMIT = 50;

/** Marks an attachment comment as this tool's, with a digest of what it carries. */
const COMMENT_MARKER = 'my-command-shots';
const MARKER_RE = /<!-- my-command-shots ([0-9a-f]+) -->/;

/** A before/after marker inside a filename's stem. */
const SIDE = /(^|[-_. ])(before|after)([-_. ]|$)/i;

/** The screenshots directory inside a worktree. @param {string} path @returns {string} */
export function shotsIn(path) {
  return join(path, ...SHOTS);
}

/**
 * The device-wide keep, expanded from the home directory at runtime.
 * `MY_COMMAND_SHOTS_DIR` overrides it, which is how the tests keep out of a real home.
 * @returns {string}
 */
export function keepRoot() {
  return process.env.MY_COMMAND_SHOTS_DIR || join(homedir(), '.my-command', 'shots');
}

/**
 * One path component, safe to join. Git already refuses a ref component of `.` or `..`;
 * a keep path built from a branch name does not lean on that.
 * @param {string} part @returns {string}
 */
export function segment(part) {
  const clean = part.replace(/[^A-Za-z0-9._-]/g, '-');
  return /^\.+$/.test(clean) ? clean.replace(/\./g, '-') : clean || '-';
}

/**
 * The repository's own name, for the keep's first level.
 *
 * Read from the *common* git dir, not from `cwd`: this is routinely called from inside a
 * worktree, whose basename is the worktree's, not the repo's.
 * @param {string} cwd @returns {string}
 */
export function repoName(cwd) {
  const common = exec('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd });
  if (!common.ok || !common.stdout) return basename(cwd);
  // A `.git` directory names the repo one level up; a bare repo names it outright.
  const name = basename(common.stdout);
  return name === '.git' ? basename(dirname(common.stdout)) : name.replace(/\.git$/, '');
}

/**
 * Where `worktree end` keeps a branch's screenshots, and where `pr` looks for them after
 * the workspace is gone. A slashed branch becomes nested directories, one per segment.
 * @param {string} cwd @param {string} branch @returns {string}
 */
export function keepDirFor(cwd, branch) {
  return join(keepRoot(), segment(repoName(cwd)), ...branch.split('/').map(segment));
}

/** Where a workspace records the run directories it opened. @param {string} cwd */
export function runStateFile(cwd) {
  return join(cwd, ...RUN_STATE);
}

/**
 * @typedef {object} RunState
 * @property {string | null} current  The run still open here, if one is.
 * @property {string[]} all           Every run this workspace opened, closed or not.
 */

/**
 * A run directory's name, or null for anything that is not one.
 *
 * The state file comes back off disk holding whatever was last written to it, so it is
 * checked against the one shape a run name has rather than taken at its word. That also
 * rules out a name that would escape the branch directory it is joined onto.
 * @param {unknown} value @returns {string | null}
 */
function asRunName(value) {
  const name = String(value ?? '');
  return RUN_DIR.test(name) ? name : null;
}

/** @param {string} cwd @returns {RunState} */
function readRunState(cwd) {
  try {
    const parsed = JSON.parse(readFileSync(runStateFile(cwd), 'utf8'));
    const listed = Array.isArray(parsed?.all) ? parsed.all : [];
    const all = listed.flatMap((/** @type {unknown} */ entry) => {
      const name = asRunName(entry);
      return name ? [name] : [];
    });
    return { current: asRunName(parsed?.current), all };
  } catch {
    // Absent, half-written, or hand-mangled: a workspace that remembers nothing has no runs.
    return { current: null, all: [] };
  }
}

/** @param {string} cwd @param {RunState} state */
function writeRunState(cwd, state) {
  const file = runStateFile(cwd);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * The next free `run-N` under `branchDir`, created.
 *
 * `mkdir` without `recursive` fails outright on a directory that is already there, so the
 * check and the claim are one syscall: two runs racing for the same number cannot both
 * believe they took it, which a read-then-create would let them.
 * @param {string} branchDir @returns {string} the name claimed
 */
function claimRunName(branchDir) {
  mkdirSync(branchDir, { recursive: true });
  let next = 1;
  for (const entry of readdirSync(branchDir, { withFileTypes: true })) {
    const m = entry.isDirectory() ? entry.name.match(RUN_DIR) : null;
    if (m) next = Math.max(next, Number(m[1]) + 1);
  }
  for (;;) {
    const name = `run-${next}`;
    try {
      mkdirSync(join(branchDir, name));
      return name;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error;
      next += 1;
    }
  }
}

/**
 * Open a fresh run directory for this workspace, whatever it already has open.
 *
 * `worktree end` uses this for the sweep: in-tree screenshots are some *other* run's, so
 * folding them into the run this workspace is holding would caption them with its notes.
 * @param {string} cwd @param {string} branch @returns {{run: string, dir: string}}
 */
export function claimRun(cwd, branch) {
  const branchDir = keepDirFor(cwd, branch);
  const run = claimRunName(branchDir);
  const state = readRunState(cwd);
  writeRunState(cwd, { ...state, all: [...new Set([...state.all, run])] });
  return { run, dir: join(branchDir, run) };
}

/**
 * This workspace's open run directory, opened on first ask.
 *
 * One workspace holds one run at a time, and `writeVerdict` closes it — so a second
 * verification loop in the same checkout, which `--here` makes routine, lands in its own
 * directory rather than overwriting the first loop's images and verdict.
 * @param {string} cwd @param {string} branch @returns {string}
 */
export function runDir(cwd, branch) {
  const state = readRunState(cwd);
  if (state.current) {
    const dir = join(keepDirFor(cwd, branch), state.current);
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  const { run, dir } = claimRun(cwd, branch);
  writeRunState(cwd, { ...readRunState(cwd), current: run });
  return dir;
}

/**
 * This workspace's open run directory if it has one, without opening one.
 * @param {string} cwd @param {string} branch @returns {string | null}
 */
export function openRunDir(cwd, branch) {
  const { current } = readRunState(cwd);
  if (!current) return null;
  const dir = join(keepDirFor(cwd, branch), current);
  return existsSync(dir) ? dir : null;
}

/** Every run directory this workspace opened, open or closed. @param {string} cwd @param {string} branch */
export function openedRunDirs(cwd, branch) {
  const branchDir = keepDirFor(cwd, branch);
  return readRunState(cwd).all.map((run) => join(branchDir, run));
}

/**
 * Move whatever is still in the checkout's `.my-command/shots/` into `dir`.
 *
 * Nothing this toolkit reports writes there any more, so this is the fallback and only the
 * fallback: a run that began before the keep held run directories, or a capture tool pointed
 * at the checkout by something other than `shotsDir`. Without it those images go with the
 * worktree. An entry whose name is already taken in `dir` is left where it is rather than
 * written over — two files under one name are two captures, and `worktree end` sweeps what
 * stays behind into a directory where it has the name to itself.
 * @param {string} cwd @param {string} dir @returns {string[]} what moved
 */
export function sweepInTree(cwd, dir) {
  const from = shotsIn(cwd);
  if (!existsSync(from)) return [];
  mkdirSync(dir, { recursive: true });
  /** @type {string[]} */
  const moved = [];
  for (const name of readdirSync(from)) {
    const target = join(dir, name);
    if (existsSync(target)) continue;
    try {
      renameSync(join(from, name), target);
    } catch {
      // A rename across filesystems fails outright with EXDEV, and the keep and the checkout
      // can sit on different volumes. Copy-then-delete is the same move by a slower route.
      cpSync(join(from, name), target, { recursive: true });
      rmSync(join(from, name), { recursive: true, force: true });
    }
    moved.push(name);
  }
  if (readdirSync(from).length === 0) rmSync(from, { recursive: true, force: true });
  return moved;
}

/** How long a branch's screenshots stay in the keep, in days, when nothing says otherwise. */
export const KEEP_MAX_AGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The newest mtime and the total bytes under `dir`, nested.
 *
 * A directory's own mtime is not the age of what it holds: removing a child rewrites it,
 * and a copy across volumes stamps it with the copy's time. The files are what the keep is
 * keeping, so they are what it is aged by. A directory holding no file at all reports
 * `newest: null`, which reads as ageless rather than as infinitely old.
 * @param {string} dir @returns {{newest: number | null, bytes: number}}
 */
export function keepContents(dir) {
  /** @type {number | null} */
  let newest = null;
  let bytes = 0;
  /** @param {string} at */
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const { mtimeMs, size } = statSync(full);
      if (newest === null || mtimeMs > newest) newest = mtimeMs;
      bytes += size;
    }
  };
  if (existsSync(dir)) walk(dir);
  return { newest, bytes };
}

/**
 * Every run directory in the keep — the ones holding a run's files rather than routing to
 * them.
 *
 * The layout is `<root>/<repo>/<branch segments…>/run-N/`, and a branch name carries however
 * many segments it carries, so depth is not the test. A directory holding a file directly
 * is: the levels above hold only directories, and the round directories a verifier nests sit
 * *inside* a run directory, so descending stops before it reaches them. A keep written before
 * runs had directories has its files under the branch directly, and that answers here too,
 * which is what lets the prune age an old keep out rather than walking past it. The root
 * itself is never one, whatever strays sit in it.
 * @param {string} root @returns {string[]}
 */
export function keepRunDirs(root) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} dir @param {boolean} isRoot */
  const walk = (dir, isRoot) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    if (!isRoot && entries.some((entry) => entry.isFile())) {
      found.push(dir);
      return;
    }
    for (const entry of entries) if (entry.isDirectory()) walk(join(dir, entry.name), false);
  };
  if (existsSync(root)) walk(root, true);
  return found.sort();
}

/**
 * Remove every parent `dir` leaves empty, stopping short of `root`. Nothing else revisits
 * an emptied `<repo>/fix`, so it would stand for good.
 * @param {string} dir @param {string} root @returns {string[]} the parents removed
 */
export function pruneEmptyUp(dir, root) {
  /** @type {string[]} */
  const removed = [];
  let current = dirname(dir);
  while (current.length > root.length && current.startsWith(root)) {
    if (existsSync(current) && readdirSync(current).length > 0) break;
    if (existsSync(current)) {
      rmSync(current, { recursive: true, force: true });
      removed.push(current);
    }
    const up = dirname(current);
    // A path that cannot go further up would spin here rather than ending.
    if (up === current) break;
    current = up;
  }
  return removed;
}

/**
 * @typedef {object} PruneOptions
 * @property {string} [root]         The keep to prune. Defaults to the device-wide one.
 * @property {number} [maxAgeDays]   How old a branch's newest file may be. Defaults to 7.
 * @property {number} [now]          The clock, for tests.
 * @property {boolean} [dryRun]      Report what would go without removing it.
 */

/**
 * @typedef {object} PruneReport
 * @property {string} root
 * @property {number} maxAgeDays
 * @property {string} cutoff             The instant a run's newest file must beat.
 * @property {boolean} dryRun
 * @property {{path: string, newest: string, bytes: number}[]} removed
 * @property {number} removedCount
 * @property {string[]} emptied          Parents dropped for having nothing left in them.
 * @property {number} kept               Run directories left standing.
 * @property {number} bytes              Reclaimed, or reclaimable under `dryRun`.
 */

/**
 * Drop the run directories whose newest file is older than `maxAgeDays`.
 *
 * **The run ages out, not the branch.** A branch verified over a fortnight holds a stale run
 * and a fresh one; aging the branch would either keep the stale run for the fresh one's sake
 * or take the fresh one with the stale one, and neither is what the cutoff was asked for.
 *
 * A stale directory goes **whole**, images and verdict file together — a verdict describing
 * images that are gone publishes nothing, and images with no verdict beside them cannot be
 * published at all, so splitting the two only ever leaves something useless behind. The run
 * directory is exactly that pairing, which is why it is also the unit here.
 * @param {PruneOptions} [options] @returns {PruneReport}
 */
export function pruneKeep(options = {}) {
  const { root = keepRoot(), maxAgeDays = KEEP_MAX_AGE_DAYS, now = Date.now(), dryRun = false } = options;
  const cutoff = now - maxAgeDays * DAY_MS;

  /** @type {{path: string, newest: string, bytes: number}[]} */
  const removed = [];
  /** @type {string[]} */
  const emptied = [];
  let kept = 0;
  let bytes = 0;

  for (const dir of keepRunDirs(root)) {
    const { newest, bytes: size } = keepContents(dir);
    // A directory holding no file has no age to judge, so it is left for its parent sweep.
    if (newest === null || newest >= cutoff) {
      kept += 1;
      continue;
    }
    removed.push({ path: dir, newest: new Date(newest).toISOString(), bytes: size });
    bytes += size;
    if (!dryRun) {
      rmSync(dir, { recursive: true, force: true });
      emptied.push(...pruneEmptyUp(dir, root));
    }
  }

  return {
    root,
    maxAgeDays,
    cutoff: new Date(cutoff).toISOString(),
    dryRun,
    removed,
    removedCount: removed.length,
    emptied,
    kept,
    bytes,
  };
}

/**
 * Every image under `dir`, nested, as paths relative to it.
 * @param {string} dir @returns {string[]}
 */
export function collectShots(dir) {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const found = [];
  /** @param {string} rel */
  const walk = (rel) => {
    const full = rel ? join(dir, rel) : dir;
    for (const name of readdirSync(full).sort()) {
      const next = rel ? `${rel}/${name}` : name;
      if (statSync(join(dir, next)).isDirectory()) walk(next);
      else if (IMAGE_EXT.has(extname(name).toLowerCase())) found.push(next);
    }
  };
  walk('');
  return found;
}

/**
 * The branch's screenshots, wherever this run can still see them.
 *
 * The keep is the real answer, and a name there carries the run directory it sits in —
 * `run-1/home.png` — so two runs that photographed the same view are two entries rather
 * than one. A live workspace's `.my-command/shots/` is read as well, for whatever still
 * writes in-tree, and wins a bare name collision as the newer of the two.
 * @param {string} cwd @param {string} branch
 * @returns {{name: string, path: string}[]}
 */
export function findShots(cwd, branch) {
  /** @type {Map<string, string>} */
  const byName = new Map();
  for (const dir of [keepDirFor(cwd, branch), shotsIn(cwd)]) {
    for (const name of collectShots(dir)) byName.set(name, join(dir, name));
  }
  return [...byName.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, path]) => ({ name, path }));
}

/**
 * What the verifier said it saw in one screenshot, in its own words.
 * @typedef {object} ShotNote
 * @property {string} name         The screenshot's filename, as the verifier named it.
 * @property {string} label        What the shot is, a few words. Never the filename.
 * @property {string} description  One sentence on what the shot proves, or that it proves nothing.
 */

/**
 * @typedef {object} Verdict
 * @property {string} tier          The driver tier that ran: playwright, http, or static.
 * @property {string} verdict       green, red, unverified, or skipped.
 * @property {number} [rounds]      How many rounds the loop took.
 * @property {ShotNote[]} [shots]   The verifier's read-back of each screenshot.
 * @property {string[]} [gaps]      What the round could not prove.
 * @property {string} [branch]
 * @property {string} [recordedAt]
 */

/** The separator a `saw:` line and a `--shot` value use between file, label, and description. */
export const SHOT_SEPARATOR = '|';

/**
 * A `--shot` value, `<file> | <label> | <description>`, split into its three parts. The
 * description keeps any later separator, since a sentence may carry one; a value short of
 * three parts is null, for the caller to refuse.
 * @param {string} value @returns {ShotNote | null}
 */
export function parseShotNote(value) {
  const [name, label, ...rest] = value.split(SHOT_SEPARATOR);
  const description = rest.join(SHOT_SEPARATOR).trim();
  if (!name?.trim() || !label?.trim() || !description) return null;
  return { name: basename(name.trim()), label: label.trim(), description };
}

/**
 * Record what a verification loop did, in the run directory holding the screenshots it took,
 * and close that run.
 *
 * The write is unconditional, and the run directory is what makes that safe: nothing else
 * has a claim on this `verdict.json`, so there is no earlier read-back here to destroy.
 * Closing the run afterwards is the other half — the next loop in this workspace opens its
 * own directory rather than writing over this one.
 * @param {string} cwd @param {string} branch @param {Verdict} record
 * @returns {{file: string, dir: string, run: string}}
 */
export function writeVerdict(cwd, branch, record) {
  const dir = runDir(cwd, branch);
  // Before the record, so a capture that landed in the checkout is described by the notes
  // being written here rather than swept into an unlabelled directory of its own later.
  sweepInTree(cwd, dir);
  const file = join(dir, VERDICT_FILE);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  const state = readRunState(cwd);
  writeRunState(cwd, { ...state, current: null });
  return { file, dir, run: basename(dir) };
}

/**
 * Fold every record found for one branch into the single verdict `pr` reads, `ordered`
 * newest first.
 *
 * The newest record alone decides what the run *was* — tier, verdict, rounds — because the
 * tier gates publishing and must never regress to an older run's. All of them together
 * decide what the screenshots *show*: a record describes only the shots its own round took,
 * so the notes are a union keyed by shot name, the newest winning a repeated one.
 * @param {Verdict[]} ordered @returns {Verdict | null}
 */
function mergeVerdicts(ordered) {
  /** @type {Verdict | null} */
  let merged = null;
  /** @type {Map<string, ShotNote>} */
  const notes = new Map();
  /** @type {Set<string>} */
  const gaps = new Set();
  for (const record of ordered) {
    merged ??= { ...record };
    for (const note of record.shots ?? []) if (!notes.has(note.name)) notes.set(note.name, note);
    for (const gap of record.gaps ?? []) gaps.add(gap);
  }
  if (!merged) return null;
  if (notes.size) merged.shots = [...notes.values()];
  if (gaps.size) merged.gaps = [...gaps];
  return merged;
}

/** A verdict file is `verdict.json`; a keep written before run directories also has `verdict-2.json`. */
const VERDICT_NAMED = /^verdict(-\d+)?\.json$/;

/**
 * The verdict files directly in `dir`, newest first, each tagged with the prefix its notes
 * name their screenshots under.
 * @param {string} dir @param {string} prefix
 * @returns {{path: string, prefix: string, at: number}[]}
 */
function verdictFilesIn(dir, prefix) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && VERDICT_NAMED.test(entry.name))
    .map((entry) => ({ path: join(dir, entry.name), prefix, at: statSync(join(dir, entry.name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
}

/**
 * A record's notes, renamed to the screenshots they describe as `findShots` reports them.
 *
 * The verifier names a shot by its bare filename, because that is what it wrote; the shot's
 * name in the keep carries the run directory it landed in. Qualifying the note here is what
 * binds it to its own run's image and to no other — two runs' `home.png` are two keys, so
 * neither the merge nor the lookup can confuse them.
 * @param {Verdict} record @param {string} prefix @returns {Verdict}
 */
function qualify(record, prefix) {
  if (!prefix || !Array.isArray(record.shots)) return record;
  return { ...record, shots: record.shots.map((note) => ({ ...note, name: `${prefix}${basename(note.name)}` })) };
}

/**
 * The verdict recorded for this branch, or null when nothing recorded one.
 *
 * Read from every place a record can be: the live workspace first, then the keep's run
 * directories newest first, then the branch directory itself for a keep written before runs
 * had directories.
 *
 * **Every record is merged, not just the newest.** A run records only the shots that run
 * took, so reading one file and stopping published every earlier run's screenshots as
 * unlabelled with their read-back sitting in the file beside it.
 * @param {string} cwd @param {string} branch
 * @returns {Verdict | null}
 */
export function readVerdict(cwd, branch) {
  const branchDir = keepDirFor(cwd, branch);
  const runs = existsSync(branchDir)
    ? readdirSync(branchDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && RUN_DIR.test(entry.name))
        .map((entry) => entry.name)
    : [];
  const found = [
    ...verdictFilesIn(shotsIn(cwd), ''),
    ...runs.flatMap((run) => verdictFilesIn(join(branchDir, run), `${run}/`)).sort((a, b) => b.at - a.at),
    ...verdictFilesIn(branchDir, ''),
  ];

  /** @type {Verdict[]} */
  const records = [];
  for (const { path, prefix } of found) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      // A tier this repo does not know names no driver, so it answers nothing.
      if (parsed && TIERS.includes(parsed.tier)) records.push(qualify(parsed, prefix));
    } catch {
      // A half-written or hand-mangled record is not a verdict; try the next one.
    }
  }
  return mergeVerdicts(records);
}

/** Whether a recorded tier means a browser took the screenshots. @param {string} tier */
export function isBrowserTier(tier) {
  return BROWSER_TIERS.has(tier);
}

/**
 * The view a before/after filename names, and which side of the comparison it is.
 * `home-before.png` and `after_home.png` both resolve; anything with no marker is not
 * half of a pair and returns null.
 * @param {string} name @returns {{view: string, side: 'before' | 'after'} | null}
 */
export function sideOf(name) {
  const ext = extname(name);
  // The stem is taken as the verifier wrote it. Nothing renames a screenshot on its way into
  // the keep any more, so a trailing `-2` is a name somebody chose rather than a collision
  // being worked around, and reading it as the same view as `-1` would be inventing a pair.
  const stem = name.slice(0, name.length - ext.length);
  const m = stem.match(SIDE);
  if (!m || m.index === undefined) return null;
  const before = stem.slice(0, m.index);
  const after = stem.slice(m.index + m[0].length);
  const view = (before && after ? `${before}-${after}` : before || after).replace(/^[-_. ]+|[-_. ]+$/g, '');
  const side = /** @type {'before' | 'after'} */ (m[2].toLowerCase());
  return { view: view || stem, side };
}

/**
 * @typedef {object} ShotGroups
 * @property {{view: string, before: string | null, after: string | null}[]} pairs
 * @property {string[]} grid
 */

/**
 * Split a branch's screenshots into the two things a reviewer reads differently: a
 * before/after comparison, one row per view, and everything else as a flat group.
 *
 * A view with only one side still gets a row, with the missing cell saying so.
 * @param {string[]} names @returns {ShotGroups}
 */
export function groupShots(names) {
  /** @type {Map<string, {view: string, before: string | null, after: string | null}>} */
  const views = new Map();
  /** @type {string[]} */
  const grid = [];
  for (const name of names) {
    const side = sideOf(name);
    if (!side) {
      grid.push(name);
      continue;
    }
    const row = views.get(side.view) ?? { view: side.view, before: null, after: null };
    // First one wins, so two spellings of one side — `home-before.png`, `home.before.png` —
    // fill the cell once rather than the later one displacing the earlier.
    if (!row[side.side]) row[side.side] = name;
    views.set(side.view, row);
  }
  return { pairs: [...views.values()], grid };
}

/**
 * A markdown image: `gh pr comment --attach` rewrites `![alt](<path>)` in place, and only
 * that shape.
 * @param {string} name @param {string} href @returns {string}
 */
const image = (name, href) => `![${name}](${href})`;

/** What a cell says about a screenshot the verifier never described. */
const UNLABELLED = {
  label: 'Unlabelled screenshot',
  description: 'The verifier left no read-back for this image, so it proves nothing on its own.',
};

/**
 * Verifier prose made safe for one table cell: one line, pipes escaped, and no dashes of the
 * kind the house style keeps out of generated markdown.
 * @param {string} text @returns {string}
 */
export function cellText(text) {
  return text
    .trim()
    .replace(/^[—–]\s*|\s*[—–]$/g, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

/** The run directory a screenshot or a note sits under, or '' for one that sits under none. */
const runOf = (/** @type {string} */ name) => (RUN_DIR.test(name.split('/')[0]) ? name.split('/')[0] : '');

/**
 * The verifier's note for a screenshot, by the name it used.
 *
 * Exact first, then by basename **within the same run** — which is what a verifier's nested
 * `round-2/home.png` needs, since it named the note `home.png`. Confining the fallback to one
 * run is the whole point: a note can no longer reach across into another run's identically
 * named image, so a screenshot is never captioned with a sentence written about a different
 * one. A name with no run directory under it is from the in-tree fallback or an old keep, and
 * matches the same way against notes that have none either.
 * @param {ShotNote[]} notes @param {string} name @returns {ShotNote | undefined}
 */
export function noteFor(notes, name) {
  const base = basename(name);
  const run = runOf(name);
  return (
    notes.find((note) => note.name === name) ??
    notes.find((note) => basename(note.name) === base && runOf(note.name) === run)
  );
}

/**
 * One screenshot cell, in the fixed order every cell keeps: bold label, image, one sentence.
 * `<br>` is the only line break a table cell renders.
 * @param {string} name @param {string} href @param {ShotNote | undefined} note @returns {string}
 */
export function shotCell(name, href, note) {
  const { label, description } = note ?? UNLABELLED;
  return `**${cellText(label)}**<br>${image(name, href)}<br>${cellText(description)}`;
}

/**
 * @typedef {object} ShotsSection
 * @property {ShotGroups} groups
 * @property {(name: string) => string} url  Where each image's reference points.
 * @property {ShotNote[]} notes              The verifier's read-back, by filename.
 * @property {string[]} gaps                 What the round could not prove.
 * @property {string} caption                The line under the heading.
 */

/**
 * The `## Screenshots` section for a comment, or an empty string when there is nothing to
 * show. Every image sits in a table cell, even a lone one, and the section closes with what
 * the shots do not prove.
 * @param {ShotsSection} section
 * @returns {string}
 */
export function renderShots({ groups, url, notes, gaps, caption }) {
  /** @type {string[]} */
  const lines = [];
  const cell = (/** @type {string} */ name) => shotCell(name, url(name), noteFor(notes, name));

  // A view is named for the run it came from only where a reader has runs to tell apart.
  // One verification loop is the ordinary case, and there `run-1/` in every row is noise.
  const runs = new Set([...groups.pairs.map((row) => runOf(row.view)), ...groups.grid.map(runOf)]);
  const view = (/** @type {string} */ name) => cellText(runs.size > 1 ? name : name.replace(/^run-\d+\//, ''));

  if (groups.pairs.length) {
    lines.push('| View | Before | After |', '| --- | --- | --- |');
    for (const row of groups.pairs) {
      const before = row.before ? cell(row.before) : 'not captured';
      const after = row.after ? cell(row.after) : 'not captured';
      lines.push(`| ${view(row.view)} | ${before} | ${after} |`);
    }
  }

  if (groups.grid.length) {
    if (lines.length) lines.push('');
    const columns = Math.min(GRID_COLUMNS, groups.grid.length);
    lines.push(`|${' |'.repeat(columns)}`, `|${' --- |'.repeat(columns)}`);
    for (let i = 0; i < groups.grid.length; i += columns) {
      const cells = groups.grid.slice(i, i + columns).map(cell);
      while (cells.length < columns) cells.push('');
      lines.push(`| ${cells.join(' | ')} |`);
    }
  }

  if (!lines.length) return '';

  const unproven = gaps.length
    ? gaps.map((gap) => `- ${cellText(gap)}`)
    : ['- The verifier recorded no gaps. That means none were written down, not that none exist.'];
  return [
    '## Screenshots',
    '',
    caption,
    '',
    ...lines,
    '',
    '### What these shots do not prove',
    '',
    ...unproven,
    '',
  ].join('\n');
}

/**
 * @typedef {object} ShotsComment
 * @property {{name: string, path: string}[]} files  What `--attach` uploads, in body order.
 * @property {number} count                          How many images it publishes.
 * @property {string} caption                        The line under the heading.
 * @property {ShotNote[]} notes                      The verifier's read-back of each image.
 * @property {string[]} gaps                         What the round could not prove.
 * @property {string} digest                         Names and bytes of `files`, hashed.
 * @property {string} [warning]                      Images the cap left behind, or nobody described.
 */

/**
 * @typedef {object} Attached
 * @property {number} count             How many images it publishes.
 * @property {string} [tier]            The driver tier that took them.
 * @property {string} [verdict]         The verdict the loop ended on.
 * @property {ShotsComment} [comment]   The comment to post once the PR number is known.
 * @property {string} [warning]         Why screenshots that exist got attached to nothing.
 */

/**
 * The attachment comment a branch's screenshots reach the reviewer through.
 * @param {{name: string, path: string}[]} shots @param {Verdict} record
 * @returns {ShotsComment}
 */
function commentPlan(shots, record) {
  const files = shots.slice(0, ATTACH_LIMIT);
  const notes = record.shots ?? [];
  const gaps = record.gaps ?? [];
  const rounds = record.rounds ? ` after ${record.rounds} round${record.rounds === 1 ? '' : 's'}` : '';
  const caption = `Captured and inspected by the \`${record.tier}\` tier; verification ended \`${record.verdict}\`${rounds}.`;
  // The digest covers the words as well as the images, so a re-recorded read-back over the
  // same shots replaces the comment instead of reusing it.
  const hash = createHash('sha256');
  for (const shot of files) hash.update(`${shot.name}\0`).update(readFileSync(shot.path)).update('\0');
  hash.update(JSON.stringify({ caption, notes, gaps }));
  /** @type {ShotsComment} */
  const plan = { files, count: files.length, caption, notes, gaps, digest: hash.digest('hex') };
  /** @type {string[]} */
  const warnings = [];
  const over = shots.length - files.length;
  if (over > 0) warnings.push(`${over} screenshot(s) past the ${ATTACH_LIMIT}-file limit of one comment`);
  const undescribed = files.filter((shot) => !noteFor(notes, shot.name)).length;
  if (undescribed > 0) {
    warnings.push(
      `${undescribed} screenshot(s) with no label or description from the verifier, published as unlabelled`,
    );
  }
  if (warnings.length) plan.warning = warnings.join('; ');
  return plan;
}

/** The hidden line that marks a comment as this tool's. @param {string} digest */
export const commentMarker = (digest) => `<!-- ${COMMENT_MARKER} ${digest} -->`;

/**
 * Post the attachment comment, once the PR it belongs to has a number.
 *
 * One comment per run, whatever the image count: `gh` takes every file in a single call and
 * prints the comment's URL.
 *
 * Both sides carry the same path, and it is a staged temp copy under a markdown-safe name.
 * `gh` rewrites a body reference only where it is byte-for-byte the `--attach` string;
 * otherwise it silently appends the images and leaves the reference broken. Paths go over
 * bare: the `#alt` suffix's effect on that matching is unverified.
 * @param {string} cwd @param {number} number @param {ShotsComment} plan
 * @returns {{url?: string, warning?: string}}
 */
export function postShotsComment(cwd, number, plan) {
  const dir = mkdtempSync(join(tmpdir(), 'mct-shots-comment-'));
  try {
    /** @type {Map<string, string>} */
    const staged = new Map();
    const taken = new Set();
    for (const shot of plan.files) {
      const ext = extname(shot.name);
      const stem = segment(basename(shot.name, ext));
      let safe = `${stem}${ext}`;
      for (let n = 2; taken.has(safe); n += 1) safe = `${stem}-${n}${ext}`;
      taken.add(safe);
      const copy = join(dir, safe);
      copyFileSync(shot.path, copy);
      staged.set(shot.name, copy);
    }

    const section = renderShots({
      groups: groupShots(plan.files.map((shot) => shot.name)),
      url: (name) => staged.get(name) ?? name,
      notes: plan.notes,
      gaps: plan.gaps,
      caption: plan.caption,
    });
    const file = join(dir, 'comment.md');
    writeFileSync(file, `${section}\n${commentMarker(plan.digest)}\n`);
    const args = ['pr', 'comment', String(number), '--body-file', file];
    for (const path of staged.values()) args.push('--attach', path);

    const posted = exec('gh', args, { cwd });
    if (!posted.ok) {
      const why = posted.stderr.split('\n').find(Boolean) ?? `exit ${posted.code}`;
      return { warning: `could not post the screenshot comment — ${why}` };
    }
    const url = posted.stdout.split('\n').filter(Boolean).pop() ?? '';
    if (!url) return { warning: 'posted the screenshot comment, but gh printed no URL for it' };
    return { url };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Where `gh --attach` re-hosts an uploaded image. A reference `gh` rewrote points here; one
 * it left alone still points at the staged copy on this machine.
 */
const ATTACHMENT_HOST =
  /^https:\/\/(?:github\.com\/user-attachments\/|(?:private-)?user-images\.githubusercontent\.com\/)/;

/**
 * Every markdown image in a body, alt text to href. The alt text is the screenshot's own
 * name, so a reference traces back to the file it was written for.
 * @param {string} body @returns {Map<string, string>}
 */
function imageRefs(body) {
  /** @type {Map<string, string>} */
  const found = new Map();
  for (const m of body.matchAll(/!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?[^)]*\)/g)) found.set(m[1], m[2]);
  return found;
}

/** The comment id a `#issuecomment-<id>` URL names, or null. @param {string} url */
export function commentId(url) {
  const m = url.match(/#issuecomment-(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * @typedef {object} ImageCheck
 * @property {string} name           The screenshot the reference was written for.
 * @property {string | null} url     Where the posted body points, or null for no reference.
 * @property {boolean} rendered      Whether a reviewer sees an image here.
 * @property {number} [status]       The status the attachment URL answered with.
 * @property {number} [bytes]        How many bytes it served.
 * @property {string} [why]          Why it does not render.
 */

/**
 * @typedef {object} RenderReport
 * @property {number} count
 * @property {number} rendered
 * @property {number} failed
 * @property {ImageCheck[]} images
 * @property {string} [warning]
 */

/**
 * @typedef {object} ProbeResult
 * @property {boolean} ok
 * @property {number} [status]
 * @property {number} [bytes]
 * @property {string} [why]
 */

/**
 * Whether a posted comment actually shows the images it uploaded.
 *
 * Two failures to tell apart. `gh` rewrites `![alt](<path>)` into the uploaded URL only
 * where the path is byte-for-byte the `--attach` string; where it is not, it appends the
 * images and leaves the reference pointing at a path on this machine, which a reviewer
 * reads as a dead link. And a reference it did rewrite still says nothing about whether the
 * CDN serves bytes back. So the reference is checked first, then the URL is requested.
 *
 * A null `probe` runs the reference half alone, for a machine that cannot reach the CDN at
 * all — see `verifyShotsComment`.
 * @param {string} body @param {string[]} names
 * @param {((url: string) => ProbeResult) | null} probe
 * @returns {RenderReport}
 */
export function verifyRendered(body, names, probe) {
  const refs = imageRefs(body);
  /** @type {ImageCheck[]} */
  const images = names.map((name) => {
    const url = refs.get(name) ?? null;
    if (!url) return { name, url: null, rendered: false, why: 'no image reference in the posted comment' };
    if (!ATTACHMENT_HOST.test(url)) {
      return {
        name,
        url,
        rendered: false,
        why: `reference still points at \`${url}\`, so gh matched no --attach path`,
      };
    }
    if (!probe) return { name, url, rendered: true };
    const got = probe(url);
    if (!got.ok) {
      return { name, url, rendered: false, status: got.status, why: got.why ?? `answered HTTP ${got.status}` };
    }
    if (!got.bytes) return { name, url, rendered: false, status: got.status, bytes: 0, why: 'served no image bytes' };
    return { name, url, rendered: true, status: got.status, bytes: got.bytes };
  });

  const rendered = images.filter((image) => image.rendered).length;
  const failed = images.length - rendered;
  /** @type {RenderReport} */
  const report = { count: images.length, rendered, failed, images };

  const notes = images.filter((image) => !image.rendered).map((image) => `${image.name}: ${image.why}`);
  // A local path under a name nobody attached is the same broken link, counted once.
  const claimed = new Set(images.map((image) => image.url));
  const orphaned = [...refs.values()].filter((href) => !ATTACHMENT_HOST.test(href) && !claimed.has(href)).length;
  if (orphaned) notes.push(`${orphaned} local path(s) still in the comment body`);

  if (notes.length) {
    const lead = failed
      ? `${failed} of ${images.length} screenshot(s) do not render`
      : 'the screenshot comment carries a broken reference';
    report.warning = `${lead} — ${notes.join('; ')}`;
  }
  return report;
}

/** The status and content length a `curl -I` header dump reports. @param {string} out */
function readHeaders(out) {
  const lines = out.split('\n');
  // `-w '\n%{http_code}\n'` puts the final status last, past every header block a redirect
  // chain printed; the last `content-length` belongs to the same final response.
  const status = Number(lines.filter((line) => line.trim()).pop()) || 0;
  let bytes = 0;
  for (const line of lines) {
    const m = line.match(/^content-length:\s*(\d+)/i);
    if (m) bytes = Number(m[1]);
  }
  return { status, bytes };
}

/**
 * Request an attachment URL, and answer whether it serves an image.
 *
 * HEAD first, since it needs no body; a host that answers it without a length falls back to
 * GET, which counts the bytes it actually received. The credential goes over `curl`'s stdin
 * config rather than argv, where a token is readable by every process on the machine.
 * @param {string} url @param {string | null} token @returns {ProbeResult}
 */
export function probeAttachment(url, token) {
  const config = token ? `header = "Authorization: Bearer ${token}"\n` : '';
  const common = ['-sS', '-L', '--max-time', '20', '-o', '/dev/null', '-K', '-'];

  const head = exec('curl', [...common, '-I', '-D', '-', '-w', '\n%{http_code}\n', url], { input: config, raw: true });
  if (head.missing) return { ok: false, why: 'curl is not on PATH, so nothing could request the attachment' };
  const seen = readHeaders(head.stdout);
  if (seen.status >= 200 && seen.status < 300 && seen.bytes > 0) {
    return { ok: true, status: seen.status, bytes: seen.bytes };
  }

  const get = exec('curl', [...common, '-w', '%{http_code} %{size_download}', url], { input: config });
  const [code, size] = get.stdout.split(/\s+/);
  const status = Number(code) || seen.status;
  if (status < 200 || status >= 300) return { ok: false, status, why: `answered HTTP ${status || 'nothing'}` };
  const bytes = Number(size) || 0;
  return { ok: bytes > 0, status, bytes };
}

/**
 * Read the comment back off GitHub and check that it renders.
 *
 * Runs on both publish paths, the fresh post and the digest reuse: a comment carried over
 * from a previous run is as capable of having a dead link in it as one just written.
 *
 * `MY_COMMAND_SHOTS_PROBE=0` keeps the reference half and drops the request half, for a
 * machine that cannot reach the CDN — where every URL would read as dead and the warning
 * would say something about the network rather than about the comment.
 * @param {string} cwd @param {{owner: string, repo: string}} slug @param {number} id
 * @param {string[]} names @returns {RenderReport}
 */
export function verifyShotsComment(cwd, slug, id, names) {
  const read = exec('gh', ['api', `repos/${slug.owner}/${slug.repo}/issues/comments/${id}`, '--jq', '.body'], {
    cwd,
    raw: true,
  });
  if (!read.ok) {
    const why = read.stderr.split('\n').find(Boolean) ?? `exit ${read.code}`;
    // Nothing was checked, so neither count claims anything; the warning says why.
    return {
      count: names.length,
      rendered: 0,
      failed: 0,
      images: [],
      warning: `could not re-read the screenshot comment to check it rendered — ${why}`,
    };
  }
  if (process.env.MY_COMMAND_SHOTS_PROBE === '0') return verifyRendered(read.stdout, names, null);
  const token = ownerToken(slug.owner);
  return verifyRendered(read.stdout, names, (url) => probeAttachment(url, token));
}

/**
 * The attachment comment this tool already posted on the PR, if any — the newest one
 * carrying the marker. An unanswerable lookup reads as none.
 * @param {string} cwd @param {{owner: string, repo: string}} slug @param {number} number
 * @returns {{id: number, url: string, digest: string} | null}
 */
export function findShotsComment(cwd, slug, number) {
  const r = exec(
    'gh',
    [
      'api',
      '--paginate',
      `repos/${slug.owner}/${slug.repo}/issues/${number}/comments`,
      '--jq',
      `.[] | select(.body | test("<!-- ${COMMENT_MARKER} ")) | [.id, .html_url, .body] | @json`,
    ],
    { cwd },
  );
  if (!r.ok) return null;
  /** @type {{id: number, url: string, digest: string} | null} */
  let found = null;
  for (const line of r.stdout.split('\n').filter(Boolean)) {
    try {
      const [id, url, body] = JSON.parse(line);
      const digest = String(body).match(MARKER_RE)?.[1];
      if (Number.isInteger(id) && url && digest) found = { id, url: String(url), digest };
    } catch {
      // Not one of ours.
    }
  }
  return found;
}

/**
 * Remove an attachment comment this tool posted and has since replaced.
 * @param {string} cwd @param {{owner: string, repo: string}} slug @param {number} id
 * @returns {boolean}
 */
export function deleteShotsComment(cwd, slug, id) {
  return exec('gh', ['api', '--method', 'DELETE', `repos/${slug.owner}/${slug.repo}/issues/comments/${id}`], { cwd })
    .ok;
}

/**
 * How this branch's screenshots reach its pull request.
 *
 * The gate is the recorded tier, never the verdict: a `red` loop's screenshots are the
 * ones a reviewer most needs. A non-browser tier photographed nothing and a branch nobody
 * verified has nothing to show, so both are silent. Screenshots with no record beside them
 * are the one case that warns.
 *
 * What comes back is a `comment` plan, which the caller posts once the PR has a number.
 * @param {string} cwd @param {string} branch
 * @returns {Attached}
 */
export function attachShots(cwd, branch) {
  const none = { count: 0 };

  const shots = findShots(cwd, branch);
  if (!shots.length) return none;

  const record = readVerdict(cwd, branch);
  if (!record) {
    return { ...none, warning: `${shots.length} screenshot(s) with no recorded verdict — run \`shots record\`` };
  }
  if (!isBrowserTier(record.tier)) return none;

  return { ...none, tier: record.tier, verdict: record.verdict, comment: commentPlan(shots, record) };
}
