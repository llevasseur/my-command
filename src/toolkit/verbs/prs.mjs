// `prs view|list|checks` — the read-only GitHub lookups, named.
//
// Commands were composing these by hand as `gh pr view --json a,b,c`, as a
// `gh pr list … | jq …` pipe, and as `gh pr view N --json state,mergedAt` after a merge.
// Each is a probe, and each is a shape the harness refuses once it is piped or captured
// into a `$(...)`. Named here, the field list stops being the caller's problem, the pipe
// disappears, and the answer arrives as JSON on stdout like every other verb.
//
// Writes are deliberately absent: `pr` owns those, with the identity recovery a write
// needs. Nothing in this verb can change a PR.
import { list, str } from '../lib/flags.mjs';
import { ghJson } from '../lib/gh.mjs';
import { ToolkitError, UsageError } from '../lib/proc.mjs';
import { repoRoot } from '../lib/repo.mjs';

export const usage = `prs view [<target>]
prs list [--base <branch>] [--state <state>] [--label <name>] [--author <user>] [--draft <bool>] [--limit <n>]
prs checks [<target>]

Read-only pull-request lookups. JSON on stdout; never writes.

  view    The PR for the current branch, or for <target> — a number, branch, or URL.
  list    Open PRs by default. --state accepts open, closed, merged, or all.
          --draft true lists only drafts, --draft false excludes them.
  checks  Each check run for a PR, with its state. Reports the current answer and
          exits; it never watches, so it can never block a turn.

Exits 1 when the PR does not exist, so a caller can branch on that without parsing.`;

// Everything a workflow command has been observed asking for, so no caller has to name
// fields again — and so adding a field is a change here rather than in nine prompts.
const VIEW_FIELDS = [
  'number',
  'url',
  'state',
  'isDraft',
  'title',
  'body',
  'headRefName',
  'baseRefName',
  'author',
  'labels',
  'mergeable',
  'mergeStateStatus',
  'mergedAt',
  'createdAt',
  'updatedAt',
].join(',');

const LIST_FIELDS = [
  'number',
  'url',
  'title',
  'headRefName',
  'baseRefName',
  'isDraft',
  // A fork PR cannot be pushed to, so a caller that resolves conflicts has to skip it —
  // which it can only do if the field is here.
  'isCrossRepository',
  'state',
  'author',
  'labels',
].join(',');

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const cwd = repoRoot(ctx.cwd);
  const sub = ctx.positionals[0];
  if (sub === 'view') return view(ctx, cwd);
  if (sub === 'list') return listPrs(ctx, cwd);
  if (sub === 'checks') return checks(ctx, cwd);
  throw new UsageError(`unknown subcommand \`${sub ?? ''}\` — expected view, list, or checks`, { usage });
}

/** @param {import('../cli.mjs').Ctx} ctx @param {string} cwd */
function view(ctx, cwd) {
  const target = ctx.positionals[1];
  const args = ['pr', 'view', ...(target ? [target] : []), '--json', VIEW_FIELDS];
  const pr = ghJson(cwd, args);
  if (!pr) {
    throw new ToolkitError(target ? `no pull request found for ${target}` : 'no pull request for the current branch', {
      target: target ?? null,
    });
  }
  return { pr };
}

/** @param {import('../cli.mjs').Ctx} ctx @param {string} cwd */
function listPrs(ctx, cwd) {
  const args = ['pr', 'list', '--json', LIST_FIELDS, '--state', str(ctx.flags.state) ?? 'open'];

  const base = str(ctx.flags.base);
  if (base) args.push('--base', base);
  const author = str(ctx.flags.author);
  if (author) args.push('--author', author);
  // Repeatable: `--label a --label b` is gh's own AND semantics, preserved as given.
  for (const label of list(ctx.flags.label)) args.push('--label', label);
  const limit = str(ctx.flags.limit);
  if (limit) args.push('--limit', limit);

  // `--draft` is a tri-state here: absent means "either", which gh spells by omitting it.
  const draft = str(ctx.flags.draft);
  if (draft === 'true') args.push('--draft');
  else if (draft === 'false') args.push('--draft=false');

  const prs = ghJson(cwd, args);
  if (!Array.isArray(prs)) throw new ToolkitError('could not list pull requests', { args: args.join(' ') });
  return { count: prs.length, prs };
}

/** @param {import('../cli.mjs').Ctx} ctx @param {string} cwd */
function checks(ctx, cwd) {
  const target = ctx.positionals[1];
  // `gh pr checks` exits non-zero while checks are pending or failing, which would make
  // ghJson report "no answer" for a perfectly good answer — so read the same data through
  // `pr view`, whose exit code reflects only whether the PR exists.
  const pr = /** @type {{number: number, statusCheckRollup?: unknown[]} | null} */ (
    ghJson(cwd, ['pr', 'view', ...(target ? [target] : []), '--json', 'number,statusCheckRollup'])
  );
  if (!pr) {
    throw new ToolkitError(target ? `no pull request found for ${target}` : 'no pull request for the current branch', {
      target: target ?? null,
    });
  }

  const rollup = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
  const runs = rollup.map((c) => {
    const check = /** @type {Record<string, string>} */ (c);
    return {
      name: check.name ?? check.context ?? 'unnamed',
      // A GitHub Actions check reports `status` + `conclusion`; a commit status reports
      // `state`. Normalized so a caller reads one field either way.
      status: check.status ?? (check.state ? 'COMPLETED' : 'UNKNOWN'),
      conclusion: check.conclusion ?? check.state ?? null,
      url: check.detailsUrl ?? check.targetUrl ?? null,
    };
  });

  const pending = runs.filter((r) => r.status !== 'COMPLETED');
  const failed = runs.filter((r) => r.conclusion && !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(r.conclusion));

  return {
    number: pr.number,
    runs,
    // The three booleans a caller actually branches on, so it never re-derives them from
    // the list — and never sleep-polls to find out.
    settled: pending.length === 0,
    passing: pending.length === 0 && failed.length === 0,
    failing: failed.map((r) => r.name),
  };
}
