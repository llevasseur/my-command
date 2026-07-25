// `commit` — stage an explicit path list and commit, with the guards that keep a
// workflow run from shipping someone else's files or landing on the default branch.
import { readFileSync } from 'node:fs';
import { str } from '../lib/flags.mjs';
import { run as exec, must, ToolkitError } from '../lib/proc.mjs';
import { currentBranch, defaultBranch, porcelain, repoRoot } from '../lib/repo.mjs';

export const usage = `commit --message <text|-> <path> [<path>...]

Stage the given paths and commit them.

  --message <text>  Commit message. Use \`-\` to read the full message from stdin.

Refuses to commit on the default branch, and refuses \`.\`/\`-A\`-style whole-tree
staging — paths are always explicit so unrelated carryover files stay put.`;

const WHOLE_TREE = new Set(['.', '-A', '--all', '-a', '*', './']);

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const cwd = repoRoot(ctx.cwd);
  const branch = currentBranch(cwd);
  const def = defaultBranch(cwd);

  if (branch === def) {
    throw new ToolkitError(`refusing to commit on the default branch (${def}) — switch to a feature branch first`, {
      branch,
    });
  }

  const paths = ctx.positionals;
  if (paths.length === 0) throw new ToolkitError('no paths given — staging is always explicit', { usage });

  const offending = paths.filter((p) => WHOLE_TREE.has(p));
  if (offending.length > 0) {
    throw new ToolkitError('refusing whole-tree staging — list the paths this run actually changed', { offending });
  }

  const message = readMessage(str(ctx.flags.message));
  if (!message.trim()) throw new ToolkitError('empty commit message', {});

  must('git', ['add', '--', ...paths], { cwd });

  // Nothing staged means the paths were already committed or unchanged; that is a
  // no-op worth reporting plainly rather than a failed commit.
  const diffCached = exec('git', ['diff', '--cached', '--name-only'], { cwd });
  const stagedFiles = diffCached.stdout ? diffCached.stdout.split('\n') : [];
  if (stagedFiles.length === 0) {
    return { committed: false, reason: 'nothing staged from the given paths', branch, paths };
  }

  const r = exec('git', ['commit', '-F', '-'], { cwd, input: message });
  if (!r.ok) throw new ToolkitError('git commit failed', { code: r.code, stderr: r.stderr, stdout: r.stdout });

  return {
    committed: true,
    branch,
    sha: must('git', ['rev-parse', 'HEAD'], { cwd }),
    subject: message.split('\n')[0],
    files: stagedFiles,
    remaining: porcelain(cwd)
      .filter((e) => e.untracked)
      .map((e) => e.path),
  };
}

/** @param {string | undefined} flag @returns {string} */
function readMessage(flag) {
  if (!flag) throw new ToolkitError('--message is required', { usage });
  if (flag !== '-') return flag;
  try {
    return readFileSync(0, 'utf8');
  } catch {
    throw new ToolkitError('--message - was given but stdin was empty', {});
  }
}
