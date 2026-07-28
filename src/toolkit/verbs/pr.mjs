// `pr` — push the branch and create or update its pull request.
// The prose stays with the caller; this verb owns the mechanics that are identical
// every time: push, detect an existing PR, pick create-vs-edit, report number and URL.
import { readFileSync } from 'node:fs';
import { bool, str } from '../lib/flags.mjs';
import { run as exec, ToolkitError, UsageError } from '../lib/proc.mjs';
import { currentBranch, defaultBranch, repoRoot } from '../lib/repo.mjs';

export const usage = `pr --title <text> --body <text|-> [--draft] [--base <branch>] [--retitle]

Push the current branch and create or update its PR.

  --title <text>   PR title. Only applied to an existing PR when --retitle is given.
  --body <text>    PR description. Use \`-\` to read it from stdin.
  --draft          Create as a draft, or convert an existing non-draft PR to draft.
                   An existing draft is never taken out of draft, flag or not.
  --base <branch>  Target branch (default: the repo's default branch).
  --retitle        Also update the title of an existing PR.

Assets already in an existing PR's description — images, videos, GitHub attachment
links — are always carried over into the new body. They are never dropped.`;

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const cwd = repoRoot(ctx.cwd);
  const branch = currentBranch(cwd);
  const def = defaultBranch(cwd);

  if (branch === def) throw new ToolkitError(`refusing to open a PR from the default branch (${def})`, { branch });

  const title = str(ctx.flags.title);
  if (!title?.trim()) throw new UsageError('--title is required', { usage });
  const body = readBody(str(ctx.flags.body));
  const draft = bool(ctx.flags.draft);
  const base = str(ctx.flags.base) ?? def;

  const push = exec('git', ['push', '-u', 'origin', 'HEAD'], { cwd });
  if (!push.ok) throw new ToolkitError('git push failed', { code: push.code, stderr: push.stderr });

  const existing = findExisting(cwd);

  if (existing) {
    const merged = preserveAssets(body, existing.body ?? '');
    const args = ['pr', 'edit', String(existing.number), '--body', merged.body];
    if (bool(ctx.flags.retitle)) args.push('--title', title);
    const edited = exec('gh', args, { cwd });
    if (!edited.ok) throw new ToolkitError('gh pr edit failed', { code: edited.code, stderr: edited.stderr });
    // Only ever move a PR toward draft on request; never silently flip an existing
    // draft to ready, which would put it in front of reviewers early.
    if (draft && !existing.isDraft) exec('gh', ['pr', 'ready', String(existing.number), '--undo'], { cwd });
    return {
      action: 'updated',
      number: existing.number,
      url: existing.url,
      branch,
      draft: draft || existing.isDraft,
      assetsPreserved: merged.preserved,
    };
  }

  const args = ['pr', 'create', '--base', base, '--title', title, '--body', body];
  if (draft) args.push('--draft');
  const created = exec('gh', args, { cwd });
  if (!created.ok) throw new ToolkitError('gh pr create failed', { code: created.code, stderr: created.stderr });

  const now = findExisting(cwd);
  return {
    action: 'created',
    number: now?.number ?? null,
    url: now?.url ?? created.stdout.split('\n').pop() ?? null,
    branch,
    base,
    draft,
  };
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

// GitHub-hosted media. A bare link to one of these renders as an inline image or a
// video player, so it counts as an asset even with no image syntax wrapped around it.
const ATTACHMENT_URL =
  String.raw`https?://(?:github\.com/user-attachments/assets/[^\s)>"']+` +
  String.raw`|github\.com/[^\s/)>"']+/[^\s/)>"']+/assets/[^\s)>"']+` +
  String.raw`|(?:private-)?user-images\.githubusercontent\.com/[^\s)>"']+)`;

/** How each asset shape is spotted, and where its URL lives once it is. */
const ASSET_PATTERNS = [
  // ![alt](url "title") — an image, whatever it points at.
  { re: /!\[[^\]]*\]\(\s*<?([^\s)>]+)>?[^)]*\)/g, url: (/** @type {RegExpExecArray} */ m) => m[1] },
  // <img>, <video>, <audio>, <picture> — with their closing tag when they have one.
  {
    re: /<(img|video|audio|picture)\b[^>]*?(?:\/>|>(?:[\s\S]*?<\/\1>)?)/gi,
    url: (/** @type {RegExpExecArray} */ m) => m[0].match(/\bsrc\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? m[0],
  },
  // [name](https://github.com/user-attachments/…) — GitHub renders these as media.
  {
    re: new RegExp(String.raw`\[[^\]]*\]\(\s*(${ATTACHMENT_URL})[^)]*\)`, 'g'),
    url: (/** @type {RegExpExecArray} */ m) => m[1],
  },
  // A bare attachment URL, which GitHub embeds on its own line all by itself.
  { re: new RegExp(ATTACHMENT_URL, 'g'), url: (/** @type {RegExpExecArray} */ m) => m[0] },
];

const ASSETS_HEADING = '## Assets';

/**
 * Media embedded in a description, verbatim and in document order.
 * Snippets come back whole so alt text and sizing attributes survive the round trip.
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
  // Outermost match wins: a `<picture>` swallows its `<img>`, an image swallows the
  // bare URL inside it. Sorting longest-first at each offset makes that one pass.
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
 * Fold every asset of `oldBody` that `newBody` dropped back into it.
 * A regenerated description is written from the branch's commits and diff, so it has no
 * way to know about a screenshot or a screen recording someone pasted into the PR by
 * hand — editing the body wholesale would silently delete them.
 * @param {string} newBody @param {string} oldBody
 * @returns {{body: string, preserved: number}}
 */
function preserveAssets(newBody, oldBody) {
  const missing = extractAssets(oldBody).filter((a) => !newBody.includes(a.url));
  if (!missing.length) return { body: newBody, preserved: 0 };

  const kept = newBody.replace(/\s+$/, '');
  // Reuse a heading the new body already carries, so repeated updates collect into one
  // section instead of stacking a fresh heading on every pass.
  const heading = kept.includes(ASSETS_HEADING) ? '' : `${ASSETS_HEADING}\n\n`;
  const block = missing.map((a) => a.snippet).join('\n\n');
  return { body: `${kept ? `${kept}\n\n` : ''}${heading}${block}\n`, preserved: missing.length };
}

/** @param {string | undefined} flag @returns {string} */
function readBody(flag) {
  if (!flag) throw new UsageError('--body is required', { usage });
  if (flag !== '-') return flag;
  try {
    return readFileSync(0, 'utf8');
  } catch {
    throw new ToolkitError('--body - was given but stdin was empty', {});
  }
}
