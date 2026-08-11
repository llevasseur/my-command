// `commit` — stage an explicit path list and commit, with the guards that keep a
// workflow run from shipping someone else's files or landing on the default branch.
import { run as exec, must, ToolkitError, UsageError } from '../lib/proc.mjs';
import { currentBranch, defaultBranch, porcelain, repoRoot } from '../lib/repo.mjs';
import { textArg } from '../lib/text-arg.mjs';

export const usage = `commit (--message-file <path> | --message <text>) <path> [<path>...]

Stage the given paths and commit them.

  --message-file <path>  Read the commit message from this file. The form to reach for
                         whenever the message runs past one line: write the file with the
                         \`Write\` tool and pass its path, with no shell in between.
                         Composing a multi-line message on the command line means a
                         heredoc, which the workflow gates refuse inside an isolated
                         worktree.
  --message <text>       A one-line message given inline.

\`--message -\` still reads the whole message from stdin, for a real pipeline.

Refuses to commit on the default branch, and refuses \`.\`/\`-A\`-style whole-tree
staging — paths are always explicit so unrelated carryover files stay put.

An unapproved commit-signing prompt is retried once, here, rather than returned as an
error to interpret. The signing configuration is never touched.`;

const WHOLE_TREE = new Set(['.', '-A', '--all', '-a', '*', './']);

// An unapproved signing prompt: the credential helper timed out waiting for approval, so
// git never wrote the commit object and the tree is untouched — which is why the same
// commit succeeds verbatim once approval lands. Matched on the helper's message plus git's,
// so a different helper failing the same way is still recognized.
const SIGNING_PROMPT =
  /1Password: failed to fill whole buffer|failed to write commit object|gpg failed to sign the data|error: cannot run gpg|secret key not available/i;

// Bounded to one retry: a second failure means the prompt was never approved, and a third
// attempt would only stack another.
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

  const message = textArg(ctx.flags, 'message', 'message-file', { usage });
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
    // So a caller sees the retry happened rather than inferring it from a delay.
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
 * unapproved signing prompt. The failed attempt wrote nothing, so re-issuing the *same*
 * commit is the whole fix — never a rewrite, `--no-gpg-sign`, or a signing-config change,
 * each of which trades a paused prompt for an unsigned or rewritten commit.
 * @param {string} cwd @param {string} message @param {string[]} paths
 * @returns {{result: import('../lib/proc.mjs').RunResult, signingRetried: boolean}}
 */
function commitOnce(cwd, message, paths) {
  // The pathspec after `--` is what keeps the commit to these paths. Without it git
  // commits the entire index, sweeping in anything staged before this run.
  const args = ['commit', '-F', '-', '--', ...paths];
  const first = exec('git', args, { cwd, input: message });
  if (first.ok || !SIGNING_PROMPT.test(first.stderr)) return { result: first, signingRetried: false };

  // Let a pending approval land before spending the one retry on it.
  sleep(SIGNING_RETRY_WAIT_MS);
  return { result: exec('git', args, { cwd, input: message }), signingRetried: true };
}
