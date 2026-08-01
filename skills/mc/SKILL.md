---
name: mc
description: Merge the latest default branch into one or more pull-request branches, resolve conflicts, verify, and push.
---

# Merge Default Branch

Parse `--here` / `-h`, `--target <branch>` / `-t <branch>`, or default to all same-repository open PRs based on the default branch. Announce the mode.

1. Use `my-command-tools doctor` and `state` when available to confirm the
   repository and record the starting branch. Require a clean worktree after
   first checking for an in-progress merge; finish only a pending merge that
   exactly matches this invocation.
2. Discover the remote default branch, fetch all remotes, and fast-forward its local branch. Stop if local history diverged.
3. Resolve the branch list. Exclude forks and create a local tracking branch when only the target remote branch exists.
4. For each branch, pull it with `--ff-only`, merge the local default branch with a merge commit, and resolve conflicts one file at a time. Preserve both sides' intent; regenerate lockfiles, generated indexes, and snapshots instead of hand-merging them.
5. If a conflict is genuinely ambiguous, abort that branch's merge and report it for a human. Never leave a branch mid-merge.
6. Run `my-command-tools verify --fast` when available, push without force,
   return to the starting branch, and report clean merges, resolved conflicts
   with file names, and human-blocked branches.

Use `git merge-tree --write-tree` for conflict prechecks rather than GitHub's lazy mergeability state. Never rewrite history, stash user work, or discard a side merely to compile.

## Git call shape

- Issue a command that may need approval as its own shell call — fetch, config,
  and the branch-lifecycle operations steps 2-4 depend on: checkout/switch, pull,
  and remote-branch inspection. Folding one into a chain escalates approval to the
  whole compound command and costs a turn plus a retry. Put status output, pipes,
  and follow-up verification in separate read-only calls.
- A classifier refusal is not evidence that repository protections should be
  weakened. Inspect the refused command first; when the intended operation is
  safe and the refusal looks incidental to the command's shape — an over-broad
  chain, pipe, or extra flag — retry only the smallest exact command, never a
  permission-settings change.
