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
//
// `gh`'s exit code proves the comment was created, not that it shows anything: the
// body-to-attachment rewrite matches on the reference string, and a mismatch appends the
// images silently and leaves a dead link. So a posted comment is read back and its images
// requested — `verifyShotsComment` below.
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
import { ownerToken } from './gh.mjs';
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

/**
 * The verifier's note for a screenshot, by the name it used. The keep suffixes a colliding
 * filename `-2`, and a nested shot carries its directory, so the match is tried by the full
 * relative name, then by basename, then with the suffix stripped.
 * @param {ShotNote[]} notes @param {string} name @returns {ShotNote | undefined}
 */
export function noteFor(notes, name) {
  const base = basename(name);
  const ext = extname(base);
  const unsuffixed = `${base.slice(0, base.length - ext.length).replace(/-\d+$/, '')}${ext}`;
  return (
    notes.find((note) => note.name === name) ??
    notes.find((note) => note.name === base) ??
    notes.find((note) => note.name === unsuffixed)
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

  if (groups.pairs.length) {
    lines.push('| View | Before | After |', '| --- | --- | --- |');
    for (const row of groups.pairs) {
      const before = row.before ? cell(row.before) : 'not captured';
      const after = row.after ? cell(row.after) : 'not captured';
      lines.push(`| ${cellText(row.view)} | ${before} | ${after} |`);
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
