// `scope` — the review scope of a branch, in one read-only call.
//
// Replaces the four-call volley every command that reads a branch's own changes opened
// with: `git branch --show-current`, a default-branch probe, `git merge-base`, then
// `git diff --name-only`. The merge-base step is the one recorded as
// `BASE=$(git merge-base origin/main HEAD)` — a probe captured into a command
// substitution, a shape the harness refuses. Named here, there is nothing to compose.
import { bool, str } from '../lib/flags.mjs';
import { run as exec, lines, ToolkitError } from '../lib/proc.mjs';
import { currentBranch, defaultBranch, diffStat, parseDiff, porcelain, repoRoot, resolveBase } from '../lib/repo.mjs';

/** Characters of hunk text carried by default. Roughly a large branch, well short of a
 * context window. */
const DIFF_LIMIT = 200_000;

export const usage = `scope [--branch <name>] [--base <ref>] [--diff] [--diff-limit <chars>]

Report what a branch changed: the refs to diff, and the files in scope.

  --branch <name>      Scope this branch instead of the current one.
  --base <ref>         Compare against <ref> instead of the branch's upstream or
                       origin/<default-branch>.
  --diff               Include the diff's own content, hunk by hunk.
  --diff-limit <chars> Cap that content (default ${DIFF_LIMIT}). Whole files past the cap
                       are named in \`diff.omitted\`, never cut in half.

Read-only throughout — it never checks out or switches a branch. \`diffRef\` is the
argument to pass to a single \`git diff\`; \`workingTree\` is true when uncommitted
changes are in scope as well, which is only ever the case for the current branch.

With \`--diff\`, \`diff.committed\` carries the branch's own commits and
\`diff.workingTree\` the uncommitted changes on top, each as files of hunks. Every hunk
line is \`<sign><line number>\\t<text>\`, the number being that line's own file: the new
one for \`+\` and context, the old one for \`-\`. That is the whole diff in one call —
there is nothing left to fetch per path.`;

/**
 * The branch's upstream, when it has one. Preferred over origin/<default> as a base: a
 * branch tracking something else was based on that instead.
 * @param {string} cwd @param {string} branch
 * @returns {string | null}
 */
function upstreamOf(cwd, branch) {
  const r = exec('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{upstream}`], { cwd });
  return r.ok && r.stdout ? r.stdout : null;
}

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const cwd = repoRoot(ctx.cwd);
  const current = currentBranch(cwd);
  const branch = str(ctx.flags.branch) ?? current;
  const def = defaultBranch(cwd);

  if (!exec('git', ['rev-parse', '--verify', `${branch}^{commit}`], { cwd }).ok) {
    throw new ToolkitError(`no such branch: ${branch}`, { branch });
  }

  // An explicit base wins, then the branch's own upstream, then origin/<default>. The
  // upstream step keeps a stacked branch from reporting its parent's commits as its own.
  const explicit = str(ctx.flags.base);
  const upstream = explicit ? null : upstreamOf(cwd, branch);
  const base = resolveBase(cwd, explicit ?? upstream ?? `origin/${def}`);

  const mergeBaseResult = exec('git', ['merge-base', base.sha, branch], { cwd });
  if (!mergeBaseResult.ok) {
    throw new ToolkitError(`no common ancestor between ${base.ref} and ${branch}`, { base: base.ref, branch });
  }
  const mergeBase = mergeBaseResult.stdout;

  // Only the current branch has a working tree to inspect; another branch's uncommitted
  // changes do not exist in this checkout.
  const workingTree = branch === current;
  const tracked = workingTree ? porcelain(cwd).filter((e) => !e.untracked) : [];

  // Another branch's changes are `mergeBase..that branch`; only the current one reaches the
  // working tree.
  const head = workingTree ? undefined : branch;
  const committed = diffStat(cwd, mergeBase, head).filter((f) => f.path);
  const commits = lines(exec('git', ['log', '--format=%H%x1f%s', `${mergeBase}..${branch}`], { cwd }).stdout).map(
    (l) => {
      const [sha, subject] = l.split('\x1f');
      return { sha, subject };
    },
  );

  const answer = {
    root: cwd,
    branch,
    isCurrentBranch: workingTree,
    defaultBranch: def,
    base: { ...base, viaUpstream: upstream !== null },
    mergeBase,
    // The single argument a caller hands `git diff`. Three dots: the branch's own work,
    // not everything the base moved on by since.
    diffRef: `${mergeBase}...${branch}`,
    commits,
    files: committed,
    workingTree,
    uncommitted: tracked.map((e) => ({ status: e.status, path: e.path })),
    /** @type {ReturnType<typeof content> | undefined} */
    diff: undefined,
  };
  // Opt-in: `JSON.stringify` drops the key entirely for an answer that was not asked for
  // a diff.
  if (bool(ctx.flags.diff)) answer.diff = content(cwd, mergeBase, branch, workingTree, limitOf(ctx));
  return answer;
}

/** @param {import('../cli.mjs').Ctx} ctx @returns {number} */
function limitOf(ctx) {
  const given = Number(str(ctx.flags['diff-limit']));
  return Number.isFinite(given) && given > 0 ? given : DIFF_LIMIT;
}

/**
 * The diff's own content, in the one call that already resolved the refs. Split the way the
 * scope is: the branch's commits, then the uncommitted changes sitting on top of them.
 * @param {string} cwd @param {string} mergeBase @param {string} branch
 * @param {boolean} workingTree @param {number} limit
 */
function content(cwd, mergeBase, branch, workingTree, limit) {
  const read = (/** @type {string[]} */ args, /** @type {number} */ budget) => {
    const out = exec('git', ['diff', '--no-color', '--no-ext-diff', '--unified=3', ...args], { cwd, raw: true });
    return parseDiff(out.ok ? out.stdout : '', budget);
  };

  const commits = read([mergeBase, branch], limit);
  // The working tree spends what the commits left, so the cap covers the pair, not each half.
  const pending = workingTree ? read(['HEAD'], Math.max(limit - commits.chars, 0)) : null;

  return {
    limit,
    committed: commits.files,
    workingTree: pending?.files ?? [],
    truncated: commits.truncated || Boolean(pending?.truncated),
    omitted: [...commits.omitted, ...(pending?.omitted ?? [])],
  };
}
