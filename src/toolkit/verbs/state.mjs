// `state` — one structured answer to "where am I, what did this run produce".
// Replaces the rev-parse / status / log / diff volley every workflow command opens with,
// and settles /task's no-change gate with a single `hasWork` boolean.
import { str } from '../lib/flags.mjs';
import { must } from '../lib/proc.mjs';
import {
  commitsSince,
  currentBranch,
  defaultBranch,
  diffStat,
  inWorktree,
  porcelain,
  repoRoot,
  resolveBase,
} from '../lib/repo.mjs';

export const usage = `state [--base <ref>]

Report branch, base, commits, and working-tree changes as JSON.

  --base <ref>   Compare against <ref> instead of origin/<default-branch>.`;

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const cwd = repoRoot(ctx.cwd);
  const base = resolveBase(cwd, str(ctx.flags.base));
  const branch = currentBranch(cwd);
  const def = defaultBranch(cwd);
  const entries = porcelain(cwd);
  const tracked = entries.filter((e) => !e.untracked);
  const commits = commitsSince(cwd, base.sha);

  return {
    root: cwd,
    branch,
    defaultBranch: def,
    onDefaultBranch: branch === def,
    worktree: inWorktree(cwd),
    base,
    head: must('git', ['rev-parse', 'HEAD'], { cwd }),
    commits,
    changes: {
      tracked: tracked.map((e) => ({ status: e.status, path: e.path })),
      // Untracked files are reported separately: a worktree or dirty checkout carries
      // strays in from elsewhere, and they are never this run's work to ship.
      untracked: entries.filter((e) => e.untracked).map((e) => e.path),
    },
    diffStat: diffStat(cwd, base.sha),
    hasWork: commits.length > 0 || tracked.length > 0,
  };
}
