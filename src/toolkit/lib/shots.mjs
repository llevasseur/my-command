// Where a run's screenshots live, and how they reach a pull request.
//
// Three verbs share these paths. `worktree begin` opens `.my-command/shots/` inside a
// checkout, `worktree end` moves what landed there into a device-wide keep, and `pr`
// publishes what it finds. The keep's layout is stated once, here, so the three cannot
// disagree about it.
//
// What makes a branch's screenshots publishable is the verdict `/verify` records beside
// them: a browser tier ran, or it did not. `docs/features/pr.md` covers why the shape of
// the diff cannot answer that.
//
// There are two ways in, and which one a repository takes is decided by whether
// `raw.githubusercontent.com` would render for a reviewer. A **public** repository gets the
// images committed to a side branch of itself and linked from that host, at a
// content-addressed path, so the same screenshot published twice is one blob at one URL. A
// **private** one gets an attachment comment instead: `gh pr comment --attach` uploads each
// file to GitHub's own `user-attachments` CDN, which renders under the reader's own
// credential. `docs/features/pr.md` carries the rest of the reasoning.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { run as exec } from './proc.mjs';

/** Where a worktree's screenshots accumulate, relative to its root. */
const SHOTS = ['.my-command', 'shots'];

/** The side branch the published bytes live on. One per repository, never checked out. */
export const SHOTS_REF = 'my-command-shots';

/** Where `/verify` records what it did, inside the shots directory. */
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

/** How wide an embedded screenshot renders inside a table cell. */
const IMAGE_WIDTH = 420;

/** How many files one `gh pr comment` call accepts. */
const ATTACH_LIMIT = 50;

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
 * Two places, one populated at a time: the live workspace before `worktree end` has run,
 * the keep afterwards. The workspace wins a name collision, being the newer of the two.
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
 * @typedef {object} Verdict
 * @property {string} tier      The driver tier that ran: playwright, http, or static.
 * @property {string} verdict   green, red, unverified, or skipped.
 * @property {number} [rounds]  How many rounds the loop took.
 * @property {string} [branch]
 * @property {string} [recordedAt]
 */

/**
 * Record what a verification loop did, beside the screenshots it took.
 * @param {string} cwd @param {Verdict} record @returns {string} the file written
 */
export function writeVerdict(cwd, record) {
  const dir = shotsIn(cwd);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, VERDICT_FILE);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

/**
 * The verdict recorded for this branch, or null when nothing recorded one.
 *
 * Read from the same two places the screenshots are, newest first, the live workspace
 * beating the keep. A branch verified twice leaves `verdict-2.json` beside
 * `verdict.json`, since `worktree end` suffixes a colliding name into the keep.
 * @param {string} cwd @param {string} branch
 * @returns {Verdict | null}
 */
export function readVerdict(cwd, branch) {
  const named = /^verdict(-\d+)?\.json$/;
  for (const dir of [shotsIn(cwd), keepDirFor(cwd, branch)]) {
    if (!existsSync(dir)) continue;
    const found = readdirSync(dir)
      .filter((name) => named.test(name))
      .map((name) => ({ path: join(dir, name), at: statSync(join(dir, name)).mtimeMs }))
      .sort((a, b) => b.at - a.at);
    for (const { path } of found) {
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        // A tier this repo does not know names no driver, so it answers nothing.
        if (parsed && TIERS.includes(parsed.tier)) return parsed;
      } catch {
        // A half-written or hand-mangled record is not a verdict; try the next one.
      }
    }
  }
  return null;
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
  // `worktree end` suffixes a colliding filename `-2`, `-3` on its way into the keep, and
  // it lands past the marker: `home-before-2.png` is the same view as `home-before.png`.
  const stem = name.slice(0, name.length - ext.length).replace(/-\d+$/, '');
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
    // First one wins, so a re-captured `home-before-2.png` cannot displace `home-before.png`.
    if (!row[side.side]) row[side.side] = name;
    views.set(side.view, row);
  }
  return { pairs: [...views.values()], grid };
}

/**
 * An `<img>` element, which is what a body embed wants: a table cell needs the width
 * attribute, and `pr`'s asset preservation carries an `<img>` forward by `src`.
 * @param {string} name @param {string} href @returns {string}
 */
const htmlCell = (name, href) => `<img src="${href}" width="${IMAGE_WIDTH}" alt="${name}">`;

/**
 * A markdown image, which is what the attachment comment wants: `gh pr comment --attach`
 * rewrites `![alt](<path>)` in place, and only that shape.
 * @param {string} name @param {string} href @returns {string}
 */
const attachCell = (name, href) => `![${name}](${href})`;

/**
 * The `## Screenshots` section for a body, or an empty string when there is nothing to
 * show. `cell` decides how one image is written; the layout is the same either way.
 * @param {ShotGroups} groups @param {(name: string) => string} url
 * @param {(name: string, href: string) => string} [cell]
 * @returns {string}
 */
export function renderShots(groups, url, cell = htmlCell) {
  /** @type {string[]} */
  const lines = [];
  const img = (/** @type {string} */ name) => cell(name, url(name));

  if (groups.pairs.length) {
    lines.push('| View | Before | After |', '| --- | --- | --- |');
    for (const row of groups.pairs) {
      lines.push(
        `| ${row.view} | ${row.before ? img(row.before) : 'not captured'} | ${row.after ? img(row.after) : 'not captured'} |`,
      );
    }
  }

  if (groups.grid.length) {
    if (lines.length) lines.push('');
    lines.push(`|${' |'.repeat(GRID_COLUMNS)}`, `|${' --- |'.repeat(GRID_COLUMNS)}`);
    for (let i = 0; i < groups.grid.length; i += GRID_COLUMNS) {
      const row = groups.grid.slice(i, i + GRID_COLUMNS);
      const cells = row.map((name) => `${img(name)}`);
      while (cells.length < GRID_COLUMNS) cells.push('');
      lines.push(`| ${cells.join(' | ')} |`);
    }
  }

  return lines.length ? `## Screenshots\n\n${lines.join('\n')}\n` : '';
}

/**
 * The path a screenshot takes on the side branch. Content-addressed, so the same bytes
 * land on one path at one URL however often they are published.
 * @param {string} branch @param {string} name @param {string} blob
 * @returns {string}
 */
function shotPath(branch, name, blob) {
  const flat = segment(name.replace(/\//g, '-'));
  return `${['shots', ...branch.split('/').map(segment)].join('/')}/${blob.slice(0, 12)}-${flat}`;
}

/**
 * True when the repository is private, so `raw.githubusercontent.com` would need a
 * credential the reviewer's browser — and GitHub's own image proxy — does not have, and
 * the attachment comment is the way in instead.
 * An unanswerable probe is not a private repository: it returns false and publishes.
 * @param {string} cwd @returns {boolean}
 */
function isPrivate(cwd) {
  const r = exec('gh', ['repo', 'view', '--json', 'isPrivate', '--jq', '.isPrivate'], { cwd });
  return r.ok && r.stdout.trim() === 'true';
}

/**
 * Commit the images onto the side branch and push it, without touching the working tree.
 *
 * Git plumbing throughout: `hash-object` writes the blobs, a throwaway index builds the
 * tree on top of whatever the branch already carries, and `commit-tree` makes the commit.
 * Nothing is checked out and nothing is staged in the caller's index.
 * @param {string} cwd @param {string} branch @param {{name: string, path: string}[]} shots
 * @returns {{paths: Map<string, string>, commit: string, pushed: boolean} | null}
 */
function publish(cwd, branch, shots) {
  /** @type {Map<string, string>} */
  const paths = new Map();
  /** @type {{path: string, blob: string}[]} */
  const entries = [];
  for (const shot of shots) {
    const hashed = exec('git', ['hash-object', '-w', '--', shot.path], { cwd });
    if (!hashed.ok) return null;
    const path = shotPath(branch, shot.name, hashed.stdout);
    paths.set(shot.name, path);
    entries.push({ path, blob: hashed.stdout });
  }

  exec('git', ['fetch', '--quiet', 'origin', `+refs/heads/${SHOTS_REF}:refs/remotes/origin/${SHOTS_REF}`], { cwd });
  const tip = exec('git', ['rev-parse', '--verify', `refs/remotes/origin/${SHOTS_REF}`], { cwd });

  const dir = mkdtempSync(join(tmpdir(), 'mct-shots-'));
  try {
    const env = { GIT_INDEX_FILE: join(dir, 'index') };
    if (tip.ok && !exec('git', ['read-tree', tip.stdout], { cwd, env }).ok) return null;
    for (const { path, blob } of entries) {
      if (!exec('git', ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], { cwd, env }).ok)
        return null;
    }
    const tree = exec('git', ['write-tree'], { cwd, env });
    if (!tree.ok) return null;

    // The branch already holds these exact bytes at these exact paths: the URLs are live
    // and there is nothing to push.
    const tipTree = tip.ok ? exec('git', ['rev-parse', `${tip.stdout}^{tree}`], { cwd }) : null;
    if (tipTree?.ok && tipTree.stdout === tree.stdout) return { paths, commit: tip.stdout, pushed: false };

    const args = ['commit-tree', tree.stdout, '-m', `shots: ${branch}`];
    if (tip.ok) args.push('-p', tip.stdout);
    const commit = exec('git', args, { cwd });
    if (!commit.ok) return null;
    const pushed = exec('git', ['push', 'origin', `${commit.stdout}:refs/heads/${SHOTS_REF}`], { cwd });
    if (!pushed.ok) return null;
    return { paths, commit: commit.stdout, pushed: true };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * @typedef {object} ShotsComment
 * @property {{name: string, path: string}[]} files  What `--attach` uploads, in body order.
 * @property {string} body                           The comment, referencing those same paths.
 * @property {number} count                          How many images it publishes.
 * @property {string} [warning]                      Images the per-comment cap left behind.
 */

/**
 * @typedef {object} Attached
 * @property {string} markdown          The section to append, or '' when there is none.
 * @property {number} count             How many images it embeds.
 * @property {string} [ref]             The branch the bytes were published to.
 * @property {string} [commit]          The commit that carries them.
 * @property {string} [tier]            The driver tier that took them.
 * @property {string} [verdict]         The verdict the loop ended on.
 * @property {ShotsComment} [comment]   The comment to post once the PR number is known.
 * @property {string} [warning]         Why screenshots that exist got attached to nothing.
 */

/**
 * The attachment comment a private repository takes in place of the in-body embed.
 *
 * **Both sides carry the same absolute path.** `gh` rewrites a body reference to its
 * uploaded `user-attachments` URL only where the reference string is byte-for-byte what
 * `--attach` was given; where they differ it appends every image to the end of the comment
 * and leaves the reference broken, which is a silent success rather than an error. The
 * paths go over bare, with the alt text written body-side: `--attach 'file#alt text'` sets
 * it from a suffix, but that suffix's effect on the matching is unverified.
 * @param {{name: string, path: string}[]} shots @param {Verdict} record
 * @returns {ShotsComment}
 */
function commentPlan(shots, record) {
  const files = shots.slice(0, ATTACH_LIMIT);
  const paths = new Map(files.map((shot) => [shot.name, shot.path]));
  const section = renderShots(
    groupShots(files.map((shot) => shot.name)),
    (name) => paths.get(name) ?? name,
    attachCell,
  );
  const caption = `Captured by the \`${record.tier}\` tier; verification ended \`${record.verdict}\`.`;
  /** @type {ShotsComment} */
  const plan = { files, body: `${section}\n${caption}\n`, count: files.length };
  const over = shots.length - files.length;
  if (over > 0) plan.warning = `${over} screenshot(s) past the ${ATTACH_LIMIT}-file limit of one comment`;
  return plan;
}

/**
 * Post the attachment comment, once the PR it belongs to has a number.
 *
 * One comment per run, whatever the image count: `gh` takes every file in a single call and
 * prints the comment's URL.
 * @param {string} cwd @param {number} number @param {ShotsComment} plan
 * @returns {{url?: string, warning?: string}}
 */
export function postShotsComment(cwd, number, plan) {
  const dir = mkdtempSync(join(tmpdir(), 'mct-shots-comment-'));
  try {
    const file = join(dir, 'comment.md');
    writeFileSync(file, plan.body);
    const args = ['pr', 'comment', String(number), '--body-file', file];
    for (const shot of plan.files) args.push('--attach', shot.path);

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
 * How this branch's screenshots reach its pull request.
 *
 * The gate is the recorded tier, never the verdict: a `red` loop's screenshots are the
 * ones a reviewer most needs. A non-browser tier photographed nothing and a branch nobody
 * verified has nothing to show, so both are silent. Screenshots with no record beside them
 * are the one case that warns.
 *
 * A public repository gets `markdown` to append to the body. A private one gets a
 * `comment` plan instead, which the caller posts once the PR has a number.
 * @param {string} cwd @param {string} branch
 * @param {{owner: string, repo: string} | null} slug
 * @returns {Attached}
 */
export function attachShots(cwd, branch, slug) {
  const none = { markdown: '', count: 0 };

  const shots = findShots(cwd, branch);
  if (!shots.length) return none;

  const record = readVerdict(cwd, branch);
  if (!record) {
    return { ...none, warning: `${shots.length} screenshot(s) with no recorded verdict — run \`shots record\`` };
  }
  if (!isBrowserTier(record.tier)) return none;

  if (!slug) return { ...none, warning: 'no GitHub remote to publish screenshots to' };
  if (isPrivate(cwd)) {
    return { ...none, tier: record.tier, verdict: record.verdict, comment: commentPlan(shots, record) };
  }

  const published = publish(cwd, branch, shots);
  if (!published) return { ...none, warning: `could not publish screenshots to ${SHOTS_REF}` };

  const base = `https://raw.githubusercontent.com/${slug.owner}/${slug.repo}/${SHOTS_REF}`;
  const url = (/** @type {string} */ name) => `${base}/${published.paths.get(name)}`;
  const markdown = renderShots(groupShots(shots.map((s) => s.name)), url);
  return {
    markdown,
    count: shots.length,
    ref: SHOTS_REF,
    commit: published.commit,
    tier: record.tier,
    verdict: record.verdict,
  };
}
