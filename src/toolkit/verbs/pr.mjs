// `pr` — push the branch and create or update its pull request.
// The prose stays with the caller; this verb owns the mechanics that are identical
// every time: push, detect an existing PR, pick create-vs-edit, report number and URL.
import { bool, str } from '../lib/flags.mjs';
import { ghWrite, originSlug } from '../lib/gh.mjs';
import { run as exec, ToolkitError, UsageError } from '../lib/proc.mjs';
import { commitsSince, currentBranch, defaultBranch, diffStat, repoRoot, resolveBase } from '../lib/repo.mjs';
import { attachShots } from '../lib/shots.mjs';
import { textArg } from '../lib/text-arg.mjs';

// Reported, never enforced: no count of the caller's prose is worth refusing a PR over.
// Bullets are counted alongside words because a four-paragraph body can come in under budget.
const WORD_BUDGET = 400;
const WORD_LIMIT = 600;

export const usage = `pr [--title <text>] --body-file <path> [--draft] [--base <branch>] [--retitle] [--no-shots]

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

\`--body -\` reads the description from stdin, and the \`PreToolUse\` gate refuses that
form on sight — the only way to put multi-line prose on stdin is a heredoc, and a
heredoc is refused wholesale inside an isolated worktree. Use \`--body-file\`.

Assets already in an existing PR's description — images, videos, GitHub attachment
links — are always carried over into the new body. They are never dropped.

A branch whose diff changes frontend code gets its screenshots embedded under a
\`## Screenshots\` heading: before/after pairs as a table, one row per view, and
everything else as a grid. The images are published to the \`my-command-shots\` branch of
the same repository and linked from \`raw.githubusercontent.com\`, at a content-addressed
path so the same screenshot keeps the same URL across runs. A diff that changes no
frontend code, and a frontend change with no screenshots, both attach nothing and say
nothing. Reported as \`screenshots\`, or as \`shotsWarning\` when there was something to
attach and it could not be.

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
 * @property {{count: number, ref: string, commit: string}} [screenshots]
 * @property {string} [shotsWarning]
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
  // Measured on the prose the caller wrote, before the screenshot table is appended: the
  // budget is a statement about the description, and a generated table is not prose.
  const warnings = bodyWarnings(authored);

  const push = exec('git', ['push', '-u', 'origin', 'HEAD'], { cwd });
  if (!push.ok) throw new ToolkitError('git push failed', { code: push.code, stderr: push.stderr });

  const slug = originSlug(cwd);
  const shots = screenshots(ctx, cwd, branch, str(ctx.flags.base), slug);
  const body = shots.markdown ? `${authored.replace(/\s+$/, '')}\n\n${shots.markdown}` : authored;
  const existing = findExisting(cwd);

  if (existing) {
    const merged = preserveAssets(body, existing.body ?? '');
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
    return { ...result, ...shotsReport(shots) };
  }

  const args = ['pr', 'create', '--base', base, '--title', title, '--body', body];
  if (draft) args.push('--draft');
  const attempt = ghWrite(cwd, args, {
    restFallback: slug
      ? restCall(cwd, 'POST', `repos/${slug.owner}/${slug.repo}/pulls`, {
          title,
          body,
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

  const now = findExisting(cwd);
  /** @type {PrResult} */
  const result = {
    action: 'created',
    number: now?.number ?? null,
    url: now?.url ?? created.stdout.split('\n').pop() ?? null,
    branch,
    base,
    draft,
    identity: attempt.identity,
  };
  if (warnings.length) result.bodyWarnings = warnings;
  return { ...result, ...shotsReport(shots) };
}

/**
 * The branch's screenshot section, unless the caller switched it off.
 * @param {import('../cli.mjs').Ctx} ctx @param {string} cwd @param {string} branch
 * @param {string | undefined} base @param {{owner: string, repo: string} | null} slug
 * @returns {import('../lib/shots.mjs').Attached}
 */
function screenshots(ctx, cwd, branch, base, slug) {
  if (bool(ctx.flags['no-shots'])) return { markdown: '', count: 0 };
  const changed = diffStat(cwd, resolveBase(cwd, base).sha).map((f) => f.path);
  return attachShots(cwd, branch, changed, slug);
}

/**
 * What a screenshot attempt adds to the result. Nothing at all on the silent paths: a
 * diff that touched no frontend code has nothing to report about screenshots.
 * @param {import('../lib/shots.mjs').Attached} shots
 * @returns {{screenshots?: {count: number, ref: string, commit: string}, shotsWarning?: string}}
 */
function shotsReport(shots) {
  if (shots.warning) return { shotsWarning: shots.warning };
  if (!shots.count || !shots.ref || !shots.commit) return {};
  return { screenshots: { count: shots.count, ref: shots.ref, commit: shots.commit } };
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

/** Each asset shape, and where its URL lives. */
const ASSET_PATTERNS = [
  // A markdown image, whatever it points at.
  { re: /!\[[^\]]*\]\(\s*<?([^\s)>]+)>?[^)]*\)/g, url: (/** @type {RegExpExecArray} */ m) => m[1] },
  // A media element, with its closing tag when it has one.
  {
    re: /<(img|video|audio|picture)\b[^>]*?(?:\/>|>(?:[\s\S]*?<\/\1>)?)/gi,
    url: (/** @type {RegExpExecArray} */ m) => m[0].match(/\bsrc\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? m[0],
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
      found.push({ start: m.index, end: m.index + m[0].length, snippet: m[0], url: url(m) });
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
