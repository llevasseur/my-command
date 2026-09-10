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
// There is one way in, whatever the repository's visibility: an attachment comment.
// `gh pr comment --body-file <path> --attach <file>` uploads each file to GitHub's own
// `user-attachments` CDN, which serves under the reader's own credential, so a private
// repository renders it too. `docs/features/pr.md` carries the reasoning.
import { createHash } from 'node:crypto';
import {
  copyFileSync,
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
 * A markdown image: `gh pr comment --attach` rewrites `![alt](<path>)` in place, and only
 * that shape.
 * @param {string} name @param {string} href @returns {string}
 */
const cell = (name, href) => `![${name}](${href})`;

/**
 * The `## Screenshots` section for a comment, or an empty string when there is nothing to
 * show.
 * @param {ShotGroups} groups @param {(name: string) => string} url
 * @returns {string}
 */
export function renderShots(groups, url) {
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
 * @typedef {object} ShotsComment
 * @property {{name: string, path: string}[]} files  What `--attach` uploads, in body order.
 * @property {number} count                          How many images it publishes.
 * @property {string} caption                        The line under the table.
 * @property {string} digest                         Names and bytes of `files`, hashed.
 * @property {string} [warning]                      Images the per-comment cap left behind.
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
  const hash = createHash('sha256');
  for (const shot of files) hash.update(`${shot.name}\0`).update(readFileSync(shot.path)).update('\0');
  /** @type {ShotsComment} */
  const plan = {
    files,
    count: files.length,
    caption: `Captured by the \`${record.tier}\` tier; verification ended \`${record.verdict}\`.`,
    digest: hash.digest('hex'),
  };
  const over = shots.length - files.length;
  if (over > 0) plan.warning = `${over} screenshot(s) past the ${ATTACH_LIMIT}-file limit of one comment`;
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

    const section = renderShots(groupShots(plan.files.map((shot) => shot.name)), (name) => staged.get(name) ?? name);
    const file = join(dir, 'comment.md');
    writeFileSync(file, `${section}\n${plan.caption}\n\n${commentMarker(plan.digest)}\n`);
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
