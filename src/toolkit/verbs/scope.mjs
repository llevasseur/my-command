// `scope` — the review scope of a branch, in one read-only call.
//
// Replaces the four-call volley every command that reads a branch's own changes opened
// with: `git branch --show-current`, a default-branch probe, `git merge-base`, then
// `git diff --name-only`. The merge-base step is the one recorded as
// `BASE=$(git merge-base origin/main HEAD)` — a probe captured into a command
// substitution, a shape the harness refuses. Named here, there is nothing to compose.
import { str } from '../lib/flags.mjs';
import { run as exec, lines, ToolkitError } from '../lib/proc.mjs';
import { currentBranch, defaultBranch, diffStat, porcelain, repoRoot, resolveBase } from '../lib/repo.mjs';

export const usage = `scope [--branch <name>] [--base <ref>]

Report what a branch changed: the refs to diff, and the files in scope.

  --branch <name>  Scope this branch instead of the current one.
  --base <ref>     Compare against <ref> instead of the branch's upstream or
                   origin/<default-branch>.

Read-only throughout — it never checks out or switches a branch. \`diffRef\` is the
argument to pass to a single \`git diff\`; \`workingTree\` is true when uncommitted
changes are in scope as well, which is only ever the case for the current branch.`;

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

  const committed = diffStat(cwd, mergeBase).filter((f) => f.path);
  const commits = lines(exec('git', ['log', '--format=%H%x1f%s', `${mergeBase}..${branch}`], { cwd }).stdout).map(
    (l) => {
      const [sha, subject] = l.split('\x1f');
      return { sha, subject };
    },
  );

  return {
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
  };
}
