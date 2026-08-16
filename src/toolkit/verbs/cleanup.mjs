// `cleanup` — delete a merged branch, locally and on the remote, from the merge method.
//
// Both halves of post-merge cleanup fail in a way that is fully predictable from how the PR
// was merged, and both were being composed as raw git and read as errors:
//
//   git branch -d <b>              → "the branch '<b>' is not fully merged", after a squash
//                                    merge, because the squash commit shares no history with
//                                    the branch's own commits. The work landed; git cannot
//                                    see that it did.
//   git push origin --delete <b>   → "remote ref does not exist", because GitHub's
//                                    auto-delete-branch setting already removed it the moment
//                                    the PR merged.
//
// Neither is a problem to diagnose. So neither is reported: this verb asks the PR how it was
// merged, and answers each half from that. A squash-merged branch is deleted with the force
// flag *because the PR says it merged*, never because a delete was refused; a remote ref that
// is already gone is reported as `already-absent`, which is a success. What a caller cannot do
// through this verb is delete a branch whose work never landed — that still refuses, with the
// PR state attached, since that is the one case where the refusal means something.
import { list, str } from '../lib/flags.mjs';
import { ghJson } from '../lib/gh.mjs';
import { run as exec, lines, must, UsageError } from '../lib/proc.mjs';
import { currentBranch, repoRoot } from '../lib/repo.mjs';

export const usage = `cleanup --branch <name> [--remote <name>] [--keep-local] [--keep-remote]

Delete a merged branch locally and on its remote, deciding each half from how the PR
was merged rather than from a git error.

  --branch <name>   The branch to clean up. Repeatable.
  --remote <name>   Remote holding the branch (default: origin).
  --keep-local      Leave the local branch alone.
  --keep-remote     Leave the remote ref alone.

A squash-merged branch git calls "not fully merged" is deleted anyway, because the PR
says it merged. A remote ref GitHub's auto-delete already removed reports
already-absent, not a failure. A branch with no merged PR is refused, PR state attached.`;

/**
 * The merged PR for `branch`, or null. `state: MERGED` is the whole question — how it merged
 * only decides the wording, since a squash, a rebase, and a plain merge all leave the same
 * two cleanup problems and only the squash makes git say so.
 * @param {string} cwd @param {string} branch
 * @returns {{number: number, state: string, mergedAt: string|null, mergeCommit: string|null} | null}
 */
function mergedPr(cwd, branch) {
  try {
    const rows = ghJson(cwd, [
      'pr',
      'list',
      '--head',
      branch,
      '--state',
      'merged',
      '--limit',
      '1',
      '--json',
      'number,state,mergedAt,mergeCommit',
    ]);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    return {
      number: row.number,
      state: row.state,
      mergedAt: row.mergedAt ?? null,
      mergeCommit: row.mergeCommit?.oid ?? null,
    };
  } catch {
    // No `gh`, no network, no PR: an unanswerable question is not a merged PR.
    return null;
  }
}

/**
 * Whether the branch's tip is already an ancestor of a local ref — a plain or rebase merge
 * that git can see for itself, so no PR lookup is needed to justify the delete.
 * @param {string} cwd @param {string} branch @returns {boolean}
 */
function containedLocally(cwd, branch) {
  const merged = exec('git', ['branch', '--merged'], { cwd });
  if (!merged.ok) return false;
  return lines(merged.stdout).some((l) => l.replace(/^[*+]?\s*/, '').trim() === branch);
}

/**
 * Where the branch is checked out, or null. A branch checked out anywhere cannot be deleted,
 * and git's message for that names a path the caller then has to go and find.
 * @param {string} cwd @param {string} branch @returns {string | null}
 */
function checkedOutAt(cwd, branch) {
  const out = must('git', ['worktree', 'list', '--porcelain'], { cwd });
  let path = '';
  for (const line of lines(out)) {
    if (line.startsWith('worktree ')) path = line.slice(9);
    else if (line === `branch refs/heads/${branch}`) return path;
  }
  return null;
}

/**
 * @param {string} cwd @param {string} remote @param {string} branch @param {boolean} keep
 * @returns {Record<string, unknown>}
 */
function removeRemote(cwd, remote, branch, keep) {
  if (keep) return { deleted: false, reason: 'kept' };
  const present = exec('git', ['ls-remote', '--heads', remote, branch], { cwd });
  // An empty answer from a successful query is the auto-delete case, stated as such.
  if (present.ok && present.stdout === '') {
    return { deleted: false, reason: 'already-absent', detail: `${remote}/${branch} was already gone` };
  }
  const push = exec('git', ['push', remote, '--delete', branch], { cwd });
  if (push.ok) return { deleted: true, reason: 'pushed' };
  if (/remote ref does not exist|unable to delete/i.test(push.stderr)) {
    return { deleted: false, reason: 'already-absent', detail: push.stderr };
  }
  return { deleted: false, reason: 'failed', detail: push.stderr || push.stdout };
}

/**
 * @param {string} cwd @param {string} branch @param {boolean} keep
 * @param {{number: number} | null} pr @param {string | null} held
 * @returns {Record<string, unknown>}
 */
function removeLocal(cwd, branch, keep, pr, held) {
  if (keep) return { deleted: false, reason: 'kept' };
  if (!exec('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd }).ok) {
    return { deleted: false, reason: 'already-absent' };
  }
  if (held) return { deleted: false, reason: 'checked-out', detail: held };
  if (branch === currentBranch(cwd)) return { deleted: false, reason: 'checked-out', detail: cwd };

  const safe = exec('git', ['branch', '-d', branch], { cwd });
  if (safe.ok) return { deleted: true, reason: 'merged' };
  if (!/not fully merged/i.test(safe.stderr)) {
    return { deleted: false, reason: 'failed', detail: safe.stderr || safe.stdout };
  }
  // The only refusal this verb resolves, and only on the evidence that resolves it: git
  // cannot see a squash merge, the PR can. Without a merged PR the refusal stands.
  if (!pr) {
    return {
      deleted: false,
      reason: 'not-merged',
      detail:
        `git reports ${branch} as not fully merged and no merged PR was found for it, so its ` +
        `commits exist nowhere else. Deleting it would discard them.`,
    };
  }
  const forced = exec('git', ['branch', '-D', branch], { cwd });
  if (!forced.ok) return { deleted: false, reason: 'failed', detail: forced.stderr || forced.stdout };
  return { deleted: true, reason: 'squash-merged', pr: pr.number };
}

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const root = repoRoot(ctx.cwd);
  const branches = list(ctx.flags.branch)
    .flatMap((v) => v.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  if (branches.length === 0) throw new UsageError('--branch is required', { usage });
  const remote = str(ctx.flags.remote) ?? 'origin';
  const keepLocal = ctx.flags['keep-local'] === true;
  const keepRemote = ctx.flags['keep-remote'] === true;

  /** @type {Record<string, unknown>[]} */
  const cleaned = [];
  for (const branch of branches) {
    const held = checkedOutAt(root, branch);
    const pr = containedLocally(root, branch) ? null : mergedPr(root, branch);
    cleaned.push({
      branch,
      pr: pr ? { number: pr.number, mergedAt: pr.mergedAt, mergeCommit: pr.mergeCommit } : null,
      local: removeLocal(root, branch, keepLocal, pr, held),
      remote: removeRemote(root, remote, branch, keepRemote),
    });
  }

  const failed = cleaned.filter(
    (c) =>
      /** @type {any} */ (c.local).reason === 'failed' ||
      /** @type {any} */ (c.local).reason === 'not-merged' ||
      /** @type {any} */ (c.remote).reason === 'failed',
  );
  return { root, remote, cleaned, pass: failed.length === 0 };
}

/** @param {{cleaned: any[]}} result @returns {string} */
export function line(result) {
  return result.cleaned
    .map((/** @type {any} */ c) => `${c.branch}: local ${c.local.reason}, remote ${c.remote.reason}`)
    .join('\n');
}
