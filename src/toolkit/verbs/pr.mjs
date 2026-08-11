// `pr` — push the branch and create or update its pull request.
// The prose stays with the caller; this verb owns the mechanics that are identical
// every time: push, detect an existing PR, pick create-vs-edit, report number and URL.
import { bool, str } from '../lib/flags.mjs';
import { ghWrite, originSlug } from '../lib/gh.mjs';
import { run as exec, ToolkitError, UsageError } from '../lib/proc.mjs';
import { commitsSince, currentBranch, defaultBranch, repoRoot, resolveBase } from '../lib/repo.mjs';
import { textArg } from '../lib/text-arg.mjs';

export const usage = `pr [--title <text>] --body-file <path> [--draft] [--base <branch>] [--retitle]

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

\`--body -\` still reads the description from stdin, for a real pipeline.

Assets already in an existing PR's description — images, videos, GitHub attachment
links — are always carried over into the new body. They are never dropped.

A \`must be a collaborator\` rejection is resolved here — by retrying under a token
belonging to the repository owner, then over REST — and never returned as an error.`;

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

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const cwd = repoRoot(ctx.cwd);
  const branch = currentBranch(cwd);
  const def = defaultBranch(cwd);

  if (branch === def) throw new ToolkitError(`refusing to open a PR from the default branch (${def})`, { branch });

  const body = textArg(ctx.flags, 'body', 'body-file', { usage });
  const draft = bool(ctx.flags.draft);
  const base = str(ctx.flags.base) ?? def;
  const title = str(ctx.flags.title)?.trim() || firstCommitSubject(cwd, str(ctx.flags.base));

  const push = exec('git', ['push', '-u', 'origin', 'HEAD'], { cwd });
  if (!push.ok) throw new ToolkitError('git push failed', { code: push.code, stderr: push.stderr });

  const slug = originSlug(cwd);
  const existing = findExisting(cwd);

  if (existing) {
    const merged = preserveAssets(body, existing.body ?? '');
    const retitle = bool(ctx.flags.retitle);
    const args = ['pr', 'edit', String(existing.number), '--body', merged.body];
    if (retitle) args.push('--title', title);
    const attempt = ghWrite(cwd, args, {
      restFallback: slug
        ? restCall(cwd, 'PATCH', `repos/${slug.owner}/${slug.repo}/pulls/${existing.number}`, {
            body: merged.body,
            ...(retitle ? { title } : {}),
          })
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
    return {
      action: 'updated',
      number: existing.number,
      url: existing.url,
      branch,
      draft: draft || existing.isDraft,
      assetsPreserved: merged.preserved,
      identity: attempt.identity,
    };
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
  return {
    action: 'created',
    number: now?.number ?? null,
    url: now?.url ?? created.stdout.split('\n').pop() ?? null,
    branch,
    base,
    draft,
    identity: attempt.identity,
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
