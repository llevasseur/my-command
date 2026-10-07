// `pr` — push the branch and create or update its pull request.
// The prose stays with the caller; this verb owns the mechanics that are identical
// every time: push, detect an existing PR, pick create-vs-edit, report number and URL.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bool, str } from '../lib/flags.mjs';
import { ghWrite, originSlug } from '../lib/gh.mjs';
import { run as exec, ToolkitError, UsageError } from '../lib/proc.mjs';
import { commitsSince, currentBranch, defaultBranch, repoRoot, resolveBase } from '../lib/repo.mjs';
import {
  attachShots,
  commentId,
  deleteShotsComment,
  findShotsComments,
  postShotsComment,
  verifyShotsComment,
} from '../lib/shots.mjs';
import { textArg } from '../lib/text-arg.mjs';

// Reported, never enforced: no count of the caller's prose is worth refusing a PR over.
// Bullets are counted alongside words because a four-paragraph body can come in under budget.
const WORD_BUDGET = 400;
const WORD_LIMIT = 600;

// `/ab` runs each command version on a throwaway branch under this prefix. Such a branch is
// always previewed, so a version that forgets `--dry-run` still publishes nothing.
export const AB_BRANCH_PREFIX = 'ab/';

export const usage = `pr [--title <text>] --body-file <path> [--draft] [--base <branch>] [--retitle] [--no-shots] [--dry-run]

Push the current branch and create or update its PR.

  --title <text>      PR title. Defaults to the branch's first commit subject.
                      Only applied to an existing PR when --retitle is given.
  --body-file <path>  Read the PR description from this file. A description is multi-line
                      by nature, so this is the form to reach for: write the file with the
                      \`Write\` tool and pass its path, with no shell in between.
                      Composing it on the command line means a heredoc, which the
                      workflow gates refuse inside a worktree.
  --body <text>       A short description given inline.
  --draft             Create as a draft, or convert an existing non-draft PR to draft.
                      An existing draft is never taken out of draft, flag or not.
  --base <branch>     Target branch (default: the repo's default branch).
  --retitle           Also update the title of an existing PR.
  --no-shots          Do not embed the branch's screenshots, whatever the diff touched.
  --dry-run           Push nothing and write nothing to GitHub. Print the title, the body
                      exactly as it would be published, and whether it would create or
                      update, and save that preview to \`pr-dry-run.json\` in the worktree's
                      own git directory. \`gh\` is consulted only to tell create from update,
                      and only when origin already has the branch: a branch never pushed
                      cannot have a PR, so it reads as \`create\` with no call at all. A branch
                      under \`${AB_BRANCH_PREFIX}\` is always previewed, flag or not.

\`--body -\` reads the description from stdin, and the \`PreToolUse\` gate refuses that
form on sight — the only way to put multi-line prose on stdin is a heredoc, and a
heredoc is refused wholesale inside an isolated worktree. Use \`--body-file\`.

Assets already in an existing PR's description — images, videos, GitHub attachment
links — are always carried over into the new body. They are never dropped.

A branch whose screenshots were taken by a **browser** tier gets them published under a
\`## Screenshots\` heading. Every image sits in a markdown table cell, even a lone one:
a bold label naming the shot, the image, then one sentence on what it proves, all three
taken from the verifier's own read-back as \`shots record --shot\` stored it. Before/after
pairs share a row per view; the rest fill a two-column grid. The comment closes with
"What these shots do not prove", listing the \`--gap\` entries. The gate is the tier
\`shots record\` wrote beside the images, not the shape of the diff — so a backend change
proven through a frontend that needed no edit still shows its screenshots, and the
verdict itself never withholds them. A shot the record never described is published as
unlabelled and reported in \`shotsWarning\`.

They land in one \`gh pr comment --attach\`, whatever the repository's visibility, which
uploads each file to GitHub's own \`user-attachments\` CDN and renders under the reader's
own credential. A re-run with the same images reuses the comment already posted. A branch
verified more than once publishes the latest run's shots only, and when an earlier run's
comment is already on the PR the new one links it as "Earlier captures: <url>" instead of
re-uploading those images; every run's shots are merged into one comment only when no
earlier comment exists. A comment covering the latest run with different images is
replaced. \`screenshots\` reports the count, tier, and verdict, plus \`via: comment\`, the
comment's URL, and \`earlier\` when it linked one.

Once it is up, the comment is read back and checked: every attached file must have a
\`user-attachments\` image URL in the body, no local path may be left behind, and each of
those URLs must answer 2xx with image bytes. \`screenshots\` reports it as \`rendered\` and
\`failed\` counts, and anything that does not render lands in \`shotsWarning\` — the PR is
already open, so a dead image link is reported rather than raised. The same check runs on a
comment reused from a previous run.

A branch with no screenshots, and one whose screenshots came from a non-browser tier, both
publish nothing and say nothing. \`shotsWarning\` is left for what genuinely could not be
published — images beside no recorded verdict, or a comment \`gh\` refused.

The description's shape is measured, never enforced: a body over ${WORD_BUDGET} words, or one
carrying no bullet at all, comes back as \`bodyWarnings\` alongside the PR that was still
created or updated.

A \`must be a collaborator\` rejection is resolved here — by retrying under a token
belonging to the repository owner, then over REST — and never returned as an error.`;

/**
 * What is wrong with a description's shape. Empty when it is within budget and has a bullet.
 * @param {string} body
 * @returns {string[]}
 */
export function bodyWarnings(body) {
  const words = body.split(/\s+/).filter(Boolean).length;

  // A pasted diff is full of `- ` lines; counting them lets a prose body claim a bullet.
  let fenced = false;
  let bullets = 0;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && /^\s*[-*] /.test(line)) bullets += 1;
  }

  /** @type {string[]} */
  const warnings = [];
  if (words > WORD_LIMIT) {
    warnings.push(
      `body is ${words} words, past the ${WORD_LIMIT}-word limit — it is being written for the author rather than the reviewer`,
    );
  } else if (words > WORD_BUDGET) {
    warnings.push(`body is ${words} words, over the ${WORD_BUDGET}-word target`);
  }
  if (bullets === 0 && words > 0) {
    warnings.push('body has no bullets — a PR description is bullets and short headers, not prose');
  }
  return warnings;
}

/**
 * The subject of the branch's first commit, used when `--title` is absent.
 * @param {string} cwd @param {string} [base]
 * @returns {string}
 */
function firstCommitSubject(cwd, base) {
  const commits = commitsSince(cwd, resolveBase(cwd, base).sha);
  const first = commits[commits.length - 1]?.subject?.trim();
  if (!first) {
    throw new UsageError('--title is required: the branch has no commit to take a subject from', { usage });
  }
  return first;
}

/**
 * The REST equivalent of a `gh pr` write, as a JSON body on stdin. REST accepts the
 * credential GraphQL rejects for a repo owned by another of the user's accounts, so it is
 * the fallback that needs no second login present.
 * @param {string} cwd @param {string} method @param {string} path @param {unknown} body
 * @returns {() => import('../lib/proc.mjs').RunResult}
 */
function restCall(cwd, method, path, body) {
  return () => exec('gh', ['api', '--method', method, path, '--input', '-'], { cwd, input: JSON.stringify(body) });
}

/**
 * What the verb reports back — one shape for both paths. `assetsPreserved` is an update's
 * count; `bodyWarnings` appears only when the description's shape is worth flagging.
 * @typedef {object} PrResult
 * @property {'created' | 'updated'} action
 * @property {number | null} number
 * @property {string | null} url
 * @property {string} branch
 * @property {boolean} draft
 * @property {string} identity
 * @property {string} [base]
 * @property {number} [assetsPreserved]
 * @property {string[]} [bodyWarnings]
 * @property {Screenshots} [screenshots]
 * @property {string} [shotsWarning]
 */

/**
 * @typedef {object} Screenshots
 * @property {number} count
 * @property {'comment'} via   Where they were published. Only ever the attachment comment.
 * @property {string} tier     The driver tier that took them.
 * @property {string} verdict  The verdict the verification loop ended on.
 * @property {string} comment  The attachment comment's URL.
 * @property {number} rendered How many of them a reviewer actually sees.
 * @property {number} failed   How many resolved to nothing, or to a path on this machine.
 * @property {string} [earlier] The earlier run's screenshot comment, linked rather than re-posted.
 */

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const cwd = repoRoot(ctx.cwd);
  const branch = currentBranch(cwd);
  const def = defaultBranch(cwd);

  if (branch === def) throw new ToolkitError(`refusing to open a PR from the default branch (${def})`, { branch });

  const authored = textArg(ctx.flags, 'body', 'body-file', { usage });
  const draft = bool(ctx.flags.draft);
  const base = str(ctx.flags.base) ?? def;
  const title = str(ctx.flags.title)?.trim() || firstCommitSubject(cwd, str(ctx.flags.base));
  // Measured on the prose the caller wrote, before the screenshot table is appended.
  const warnings = bodyWarnings(authored);

  if (bool(ctx.flags['dry-run']) || branch.startsWith(AB_BRANCH_PREFIX)) {
    return dryRun(ctx, cwd, { branch, base, title, authored, draft, warnings });
  }

  const push = exec('git', ['push', '-u', 'origin', 'HEAD'], { cwd });
  if (!push.ok) throw new ToolkitError('git push failed', { code: push.code, stderr: push.stderr });

  const slug = originSlug(cwd);
  const shots = screenshots(ctx, cwd, branch);
  const existing = findExisting(cwd);

  if (existing) {
    const merged = preserveAssets(authored, existing.body ?? '');
    const retitle = bool(ctx.flags.retitle);
    const args = ['pr', 'edit', String(existing.number), '--body', merged.body];
    if (retitle) args.push('--title', title);
    // The REST fallback carries what the `gh` call above carries: the body always, the
    // title only on a retitle.
    /** @type {{body: string, title?: string}} */
    const patch = { body: merged.body };
    if (retitle) patch.title = title;
    const attempt = ghWrite(cwd, args, {
      restFallback: slug
        ? restCall(cwd, 'PATCH', `repos/${slug.owner}/${slug.repo}/pulls/${existing.number}`, patch)
        : undefined,
    });
    const edited = attempt.result;
    if (!edited.ok) {
      throw new ToolkitError('gh pr edit failed', {
        code: edited.code,
        stderr: edited.stderr,
        identity: attempt.identity,
      });
    }
    // Only ever move a PR toward draft on request; never silently flip an existing
    // draft to ready, which would put it in front of reviewers early.
    if (draft && !existing.isDraft) exec('gh', ['pr', 'ready', String(existing.number), '--undo'], { cwd });
    /** @type {PrResult} */
    const result = {
      action: 'updated',
      number: existing.number,
      url: existing.url,
      branch,
      draft: draft || existing.isDraft,
      assetsPreserved: merged.preserved,
      identity: attempt.identity,
    };
    if (warnings.length) result.bodyWarnings = warnings;
    return { ...result, ...shotsReport(cwd, slug, shots, existing.number) };
  }

  const args = ['pr', 'create', '--base', base, '--title', title, '--body', authored];
  if (draft) args.push('--draft');
  const attempt = ghWrite(cwd, args, {
    restFallback: slug
      ? restCall(cwd, 'POST', `repos/${slug.owner}/${slug.repo}/pulls`, {
          title,
          body: authored,
          head: branch,
          base,
          draft,
        })
      : undefined,
  });
  const created = attempt.result;
  if (!created.ok) {
    throw new ToolkitError('gh pr create failed', {
      code: created.code,
      stderr: created.stderr,
      identity: attempt.identity,
    });
  }

  // `gh pr create` prints the new PR's URL last: the number fallback when the lookup misses.
  const printed = created.stdout.split('\n').filter(Boolean).pop() ?? null;
  const now = findExisting(cwd);
  /** @type {PrResult} */
  const result = {
    action: 'created',
    number: now?.number ?? numberIn(printed),
    url: now?.url ?? printed,
    branch,
    base,
    draft,
    identity: attempt.identity,
  };
  if (warnings.length) result.bodyWarnings = warnings;
  return { ...result, ...shotsReport(cwd, slug, shots, result.number) };
}

/** The PR number a `/pull/<n>` URL names, or null. @param {string | null} url */
function numberIn(url) {
  const m = url?.match(/\/pull\/(\d+)(?:[/?#]|$)/);
  return m ? Number(m[1]) : null;
}

/**
 * What `pr` would publish, published nowhere.
 *
 * The body is the one an update would actually write, assets carried over, so a preview
 * compared against another is compared on what a reviewer would have read. Screenshots are
 * left out: posting them is a write, and they belong to the branch rather than the prose.
 * @param {import('../cli.mjs').Ctx} ctx @param {string} cwd
 * @param {{branch: string, base: string, title: string, authored: string, draft: boolean,
 *   warnings: string[]}} plan
 */
function dryRun(ctx, cwd, { branch, base, title, authored, draft, warnings }) {
  const pushed = exec('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], { cwd }).ok;
  const existing = pushed ? findExisting(cwd) : null;
  const retitle = bool(ctx.flags.retitle);

  /** @type {Record<string, unknown>} */
  const preview = existing
    ? {
        dryRun: true,
        action: 'update',
        number: existing.number,
        url: existing.url,
        branch,
        title: retitle ? title : existing.title,
        body: preserveAssets(authored, existing.body ?? '').body,
        draft: draft || existing.isDraft,
      }
    : { dryRun: true, action: 'create', number: null, url: null, branch, base, title, body: authored, draft };
  if (warnings.length) preview.bodyWarnings = warnings;

  const gitDir = exec('git', ['rev-parse', '--absolute-git-dir'], { cwd }).stdout.trim();
  const dir = join(gitDir, 'my-command');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'pr-dry-run.json');
  writeFileSync(path, `${JSON.stringify(preview, null, 2)}\n`);
  return { ...preview, preview: path };
}

/**
 * The branch's screenshot plan, unless the caller switched it off.
 * @param {import('../cli.mjs').Ctx} ctx @param {string} cwd @param {string} branch
 * @returns {import('../lib/shots.mjs').Attached}
 */
function screenshots(ctx, cwd, branch) {
  if (bool(ctx.flags['no-shots'])) return { count: 0 };
  return attachShots(cwd, branch);
}

/**
 * What a screenshot attempt adds to the result — nothing at all on the silent paths.
 *
 * The attachment comment is posted from here rather than from `attachShots`, because it
 * needs the PR number, which does not exist until the create or edit above has run.
 * @param {string} cwd @param {{owner: string, repo: string} | null} slug
 * @param {import('../lib/shots.mjs').Attached} shots @param {number | null} number
 * @returns {{screenshots?: Screenshots, shotsWarning?: string}}
 */
function shotsReport(cwd, slug, shots, number) {
  if (shots.warning) return { shotsWarning: shots.warning };
  if (shots.comment) return commentReport(cwd, slug, shots, shots.comment, number);
  return {};
}

/**
 * Post the attachment comment and report what came of it.
 *
 * One comment per run. The same images reuse the comment already posted. An earlier run's
 * comment is linked and kept, and the new one carries the latest run's shots alone; every
 * run is merged only when no earlier comment exists. A comment covering the latest run with
 * different images is replaced once the new one is up.
 * @param {string} cwd @param {{owner: string, repo: string} | null} slug
 * @param {import('../lib/shots.mjs').Attached} shots
 * @param {import('../lib/shots.mjs').ShotsComment} latest @param {number | null} number
 * @returns {{screenshots?: Screenshots, shotsWarning?: string}}
 */
function commentReport(cwd, slug, shots, latest, number) {
  if (number === null) return { shotsWarning: 'no PR number to attach the screenshot comment to' };

  const ours = slug ? findShotsComments(cwd, slug, number) : [];
  const newest = (/** @type {typeof ours} */ list) => list[list.length - 1] ?? null;
  const plans = shots.merged ? [latest, shots.merged] : [latest];

  /** @type {import('../lib/shots.mjs').ShotsComment} */
  let plan = latest;
  /** @type {string | undefined} */
  let earlier;
  /** @type {{url?: string, warning?: string}} */
  let posted;
  const reused = newest(ours.filter((c) => plans.some((p) => p.digest === c.digest)));
  if (reused) {
    plan = plans.find((p) => p.digest === reused.digest) ?? latest;
    posted = { url: reused.url };
  } else {
    // A comment naming no runs predates the marker's `runs=`, so it is kept as an earlier one.
    const covers = (/** @type {(typeof ours)[number]} */ c) => c.runs?.some((run) => latest.runs.includes(run));
    const same = newest(ours.filter(covers));
    earlier = newest(ours.filter((c) => !covers(c)))?.url;
    plan = earlier || !shots.merged ? latest : shots.merged;
    posted = postShotsComment(cwd, number, plan, earlier);
    if (posted.url && same && same.url !== posted.url && slug) deleteShotsComment(cwd, slug, same.id);
  }

  const check = posted.url ? renderCheck(cwd, slug, posted.url, plan) : null;

  /** @type {{screenshots?: Screenshots, shotsWarning?: string}} */
  const report = {};
  if (posted.url) {
    report.screenshots = {
      count: plan.count,
      via: 'comment',
      tier: shots.tier ?? '',
      verdict: shots.verdict ?? '',
      comment: posted.url,
      rendered: check?.rendered ?? 0,
      failed: check?.failed ?? 0,
    };
    if (earlier) report.screenshots.earlier = earlier;
  }
  const warnings = [posted.warning, check?.warning, plan.warning].filter(Boolean);
  if (warnings.length) report.shotsWarning = warnings.join('; ');
  return report;
}

/**
 * Whether the comment now on the PR actually shows its images.
 *
 * Reported, never fatal: the PR is already open by the time this runs, so a dead image link
 * is a warning about the comment rather than a reason to fail the run that opened it. Both
 * publish paths come through here, the fresh post and the comment reused from a previous
 * run, which can have rotted since.
 * @param {string} cwd @param {{owner: string, repo: string} | null} slug @param {string} url
 * @param {import('../lib/shots.mjs').ShotsComment} plan
 * @returns {import('../lib/shots.mjs').RenderReport | null}
 */
function renderCheck(cwd, slug, url, plan) {
  if (!slug) return null;
  const id = commentId(url);
  const names = plan.files.map((shot) => shot.name);
  if (id === null) {
    return {
      count: names.length,
      rendered: 0,
      failed: 0,
      images: [],
      warning: 'no comment id in the screenshot comment URL, so nothing checked that it rendered',
    };
  }
  return verifyShotsComment(cwd, slug, id, names);
}

/**
 * The branch's *open* PR, if it has one.
 * `gh pr view` also resolves a closed or merged PR for the branch; editing one of those
 * fails, and the caller wanted a new PR anyway — so anything but OPEN reads as none.
 * @param {string} cwd
 * @returns {{number: number, url: string, isDraft: boolean, title: string, body?: string} | null}
 */
function findExisting(cwd) {
  const r = exec('gh', ['pr', 'view', '--json', 'number,url,isDraft,title,state,body'], { cwd });
  if (!r.ok) return null;
  try {
    const pr = JSON.parse(r.stdout);
    return pr && pr.state === 'OPEN' ? pr : null;
  } catch {
    return null;
  }
}

// GitHub-hosted media. A bare link to one of these renders inline, so it is an asset
// even with no image syntax wrapped around it.
const ATTACHMENT_URL =
  String.raw`https?://(?:github\.com/user-attachments/assets/[^\s)>"']+` +
  String.raw`|github\.com/[^\s/)>"']+/[^\s/)>"']+/assets/[^\s)>"']+` +
  String.raw`|(?:private-)?user-images\.githubusercontent\.com/[^\s)>"']+)`;

/** Each asset shape, and where its URL lives. No URL means it is not an asset. */
const ASSET_PATTERNS = [
  // A markdown image, whatever it points at.
  { re: /!\[[^\]]*\]\(\s*<?([^\s)>]+)>?[^)]*\)/g, url: (/** @type {RegExpExecArray} */ m) => m[1] },
  // A media element, with its closing tag when it has one. An element carrying no source
  // is not media: `<img>` inside a sentence about `<img>` tags is prose, and preserving it
  // put a bare `<img>` under this repo's own `## Assets` heading.
  {
    re: /<(img|video|audio|picture)\b[^>]*?(?:\/>|>(?:[\s\S]*?<\/\1>)?)/gi,
    url: (/** @type {RegExpExecArray} */ m) => m[0].match(/\b(?:src|srcset|poster)\s*=\s*["']?([^"'\s>]+)/i)?.[1],
  },
  // A markdown link to an attachment host, which GitHub renders as media.
  {
    re: new RegExp(String.raw`\[[^\]]*\]\(\s*(${ATTACHMENT_URL})[^)]*\)`, 'g'),
    url: (/** @type {RegExpExecArray} */ m) => m[1],
  },
  // A bare attachment URL, which GitHub embeds on its own.
  { re: new RegExp(ATTACHMENT_URL, 'g'), url: (/** @type {RegExpExecArray} */ m) => m[0] },
];

const ASSETS_HEADING = '## Assets';

/**
 * Media embedded in a description, verbatim and in document order.
 * @param {string} body
 * @returns {{snippet: string, url: string}[]}
 */
function extractAssets(body) {
  /** @type {{start: number, end: number, snippet: string, url: string}[]} */
  const found = [];
  for (const { re, url } of ASSET_PATTERNS) {
    for (const m of body.matchAll(re)) {
      const href = url(m);
      if (!href) continue;
      found.push({ start: m.index, end: m.index + m[0].length, snippet: m[0], url: href });
    }
  }
  // Outermost match wins, so nested markup is claimed once: sorting longest-first at
  // each offset settles it in a single pass.
  found.sort((a, b) => a.start - b.start || b.end - a.end);

  /** @type {{snippet: string, url: string}[]} */
  const assets = [];
  const seen = new Set();
  let covered = 0;
  for (const m of found) {
    if (m.start < covered) continue;
    covered = m.end;
    if (seen.has(m.url)) continue;
    seen.add(m.url);
    assets.push({ snippet: m.snippet, url: m.url });
  }
  return assets;
}

/**
 * Fold every asset of `oldBody` that `newBody` dropped back into it. A regenerated
 * description is written from the branch's commits, so it never knows about media
 * pasted into the PR by hand.
 * @param {string} newBody @param {string} oldBody
 * @returns {{body: string, preserved: number}}
 */
function preserveAssets(newBody, oldBody) {
  const missing = extractAssets(oldBody).filter((a) => !newBody.includes(a.url));
  if (!missing.length) return { body: newBody, preserved: 0 };

  const kept = newBody.replace(/\s+$/, '');
  // Reuse a heading the new body already carries, so repeated updates collect into one
  // section rather than stacking.
  const heading = kept.includes(ASSETS_HEADING) ? '' : `${ASSETS_HEADING}\n\n`;
  const block = missing.map((a) => a.snippet).join('\n\n');
  return { body: `${kept ? `${kept}\n\n` : ''}${heading}${block}\n`, preserved: missing.length };
}
