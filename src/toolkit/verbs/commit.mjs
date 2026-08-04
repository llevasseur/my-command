// `commit` — stage an explicit path list and commit, with the guards that keep a
// workflow run from shipping someone else's files or landing on the default branch.
import { readFileSync } from 'node:fs';
import { str } from '../lib/flags.mjs';
import { run as exec, must, ToolkitError, UsageError } from '../lib/proc.mjs';
import { currentBranch, defaultBranch, porcelain, repoRoot } from '../lib/repo.mjs';

export const usage = `commit --message <text|-> <path> [<path>...]

Stage the given paths and commit them.

  --message <text>  Commit message. Use \`-\` to read the full message from stdin.

Refuses to commit on the default branch, and refuses \`.\`/\`-A\`-style whole-tree
staging — paths are always explicit so unrelated carryover files stay put.

An unapproved commit-signing prompt is retried once, here, rather than returned as an
error to interpret. The signing configuration is never touched.`;

const WHOLE_TREE = new Set(['.', '-A', '--all', '-a', '*', './']);

// An unapproved signing prompt: the agent's credential helper asked for approval and
// timed out, so git never wrote the commit object and the tree is untouched. It is a
// prompt to approve, not a repository problem — which is why the same commit succeeds
// verbatim once approval lands. Matched on the helper's own message plus git's, so a
// different helper that fails the same way is still recognized.
const SIGNING_PROMPT =
  /1Password: failed to fill whole buffer|failed to write commit object|gpg failed to sign the data|error: cannot run gpg|secret key not available/i;

// One retry, and the wait before it. Bounded on purpose: a second failure means the
// prompt was never approved, and a third attempt would only stack another prompt.
const SIGNING_RETRY_WAIT_MS = 3000;

/** Blocking sleep; the verb is synchronous throughout. @param {number} ms */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

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
  if (paths.length === 0) throw new UsageError('no paths given — staging is always explicit', { usage });

  const offending = paths.filter((p) => WHOLE_TREE.has(p));
  if (offending.length > 0) {
    throw new ToolkitError('refusing whole-tree staging — list the paths this run actually changed', { offending });
  }

  const message = readMessage(str(ctx.flags.message));
  if (!message.trim()) throw new ToolkitError('empty commit message', {});

  must('git', ['add', '--', ...paths], { cwd });

  // Scoped to `paths`: the index may already hold someone else's staged carryover, and
  // the whole point of this verb is that such files stay put.
  const diffCached = exec('git', ['diff', '--cached', '--name-only', '--', ...paths], { cwd });
  if (!diffCached.ok) {
    throw new ToolkitError('could not read the staged file list', {
      code: diffCached.code,
      stderr: diffCached.stderr,
    });
  }
  // Nothing staged means the paths were already committed or unchanged; that is a
  // no-op worth reporting plainly rather than a failed commit.
  const stagedFiles = diffCached.stdout ? diffCached.stdout.split('\n') : [];
  if (stagedFiles.length === 0) {
    return { committed: false, reason: 'nothing staged from the given paths', branch, paths };
  }

  const { result: r, signingRetried } = commitOnce(cwd, message, paths);
  if (!r.ok) {
    throw new ToolkitError(
      signingRetried
        ? 'git commit failed twice on an unapproved signing prompt — approve the credential prompt on this device, then run the same commit again'
        : 'git commit failed',
      { code: r.code, stderr: r.stderr, stdout: r.stdout, signingRetried },
    );
  }

  return {
    committed: true,
    // Reported so a caller can see the retry happened rather than inferring it from a
    // delay. False on the ordinary path, where nothing needed recovering.
    signingRetried,
    branch,
    sha: must('git', ['rev-parse', 'HEAD'], { cwd }),
    subject: message.split('\n')[0],
    files: stagedFiles,
    remaining: porcelain(cwd)
      .filter((e) => e.untracked)
      .map((e) => e.path),
  };
}

/**
 * Commit the staged pathspec, retrying once when the only thing that failed was an
 * unapproved signing prompt.
 *
 * The retry lives here rather than in the calling prompt because the recovery is
 * mechanical and identical every time: the failed attempt wrote nothing, so re-issuing
 * the *same* commit is the whole fix. It is deliberately not a rewrite, not
 * `--no-gpg-sign`, and not a change to the repo's signing configuration — those would
 * trade a paused prompt for an unsigned or rewritten commit.
 *
 * @param {string} cwd @param {string} message @param {string[]} paths
 * @returns {{result: import('../lib/proc.mjs').RunResult, signingRetried: boolean}}
 */
function commitOnce(cwd, message, paths) {
  // The pathspec after `--` is what keeps the commit to these paths. Without it git
  // commits the entire index, sweeping in anything staged before this run.
  const args = ['commit', '-F', '-', '--', ...paths];
  const first = exec('git', args, { cwd, input: message });
  if (first.ok || !SIGNING_PROMPT.test(first.stderr)) return { result: first, signingRetried: false };

  // Give the pending approval a moment to land before spending the one retry on it.
  sleep(SIGNING_RETRY_WAIT_MS);
  return { result: exec('git', args, { cwd, input: message }), signingRetried: true };
}

/** @param {string | undefined} flag @returns {string} */
function readMessage(flag) {
  if (!flag) throw new UsageError('--message is required', { usage });
  if (flag !== '-') return flag;
  try {
    return readFileSync(0, 'utf8');
  } catch {
    throw new ToolkitError('--message - was given but stdin was empty', {});
  }
}
