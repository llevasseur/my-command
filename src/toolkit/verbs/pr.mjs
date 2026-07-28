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
  --retitle        Also update the title of an existing PR.`;

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
    const args = ['pr', 'edit', String(existing.number), '--body', body];
    if (bool(ctx.flags.retitle)) args.push('--title', title);
    const edited = exec('gh', args, { cwd });
    if (!edited.ok) throw new ToolkitError('gh pr edit failed', { code: edited.code, stderr: edited.stderr });
    // Only ever move a PR toward draft on request; never silently flip an existing
    // draft to ready, which would put it in front of reviewers early.
    if (draft && !existing.isDraft) exec('gh', ['pr', 'ready', String(existing.number), '--undo'], { cwd });
    return { action: 'updated', number: existing.number, url: existing.url, branch, draft: draft || existing.isDraft };
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
 * @returns {{number: number, url: string, isDraft: boolean, title: string} | null}
 */
function findExisting(cwd) {
  const r = exec('gh', ['pr', 'view', '--json', 'number,url,isDraft,title,state'], { cwd });
  if (!r.ok) return null;
  try {
    const pr = JSON.parse(r.stdout);
    return pr && pr.state === 'OPEN' ? pr : null;
  } catch {
    return null;
  }
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
