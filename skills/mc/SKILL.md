---
name: mc
description: Merge the latest default branch into one or more pull-request branches, resolve conflicts, verify, and push.
---

# Merge Default Branch

Parse `--here` / `-h`, `--target <branch>` / `-t <branch>`, or default to all same-repository open PRs based on the default branch. Announce the mode. Target mode does its merge in an isolated worktree; the other two modes work in the current checkout.

1. Use `my-command-tools doctor` and `state` when available to confirm the
   repository and record the starting branch. For the current-branch and all-PRs
   modes, require a clean working tree after first checking for an in-progress
   merge; finish only a pending merge that exactly matches this invocation.
   Target mode skips that requirement — it never touches this checkout, so
   uncommitted work here stays exactly as it is.
2. Discover the remote default branch and fetch all remotes. Fast-forward the local default branch for the current-branch and all-PRs modes only, and stop if local history diverged; target mode merges the remote-tracking default branch directly and leaves the local one alone.
3. Resolve the branch list. Exclude forks. In target mode, confirm the branch exists locally or on the remote and stop if it does not — do not create a tracking branch by hand, since step 3a checks it out for you.
   - 3a. **Target mode only.** Check the branch out into its own worktree —
     `my-command-tools worktree begin --branch <branch> --existing --bootstrap`
     when the toolkit is available, otherwise `git worktree add`. Checking out an
     **existing** branch is the safe part: creating a new one would abandon the
     work you are merging into. Do not move the session into the worktree; run
     every git call against it (`git -C <path>`) and read and edit conflicted
     files under that path, because this workflow is often a step inside another
     one and relocating would move the ground under its caller. If the branch is
     already held by another worktree, inspect the registered list and use that
     checkout rather than forcing or removing it. If a previous run left a merge
     in progress there, finish it rather than aborting.
4. For each branch, pull it with `--ff-only` (target mode is already checked out, so skip the pull), merge the default branch with a merge commit, and resolve conflicts one file at a time. Preserve both sides' intent; regenerate lockfiles, generated indexes, and snapshots instead of hand-merging them.
5. If a conflict is genuinely ambiguous, abort that branch's merge and report it for a human. Never leave a branch mid-merge.
6. Run `my-command-tools verify --fast` when available — in target mode with the
   worktree as the working directory, or it grades the wrong checkout, and treat
   a failure caused by an uninstalled dependency there as environment rather than
   as your resolution. Then push without force.
7. Finish. The current-branch and all-PRs modes return to the starting branch.
   Target mode has nothing to return to and instead removes its worktree from
   outside it (`my-command-tools worktree end --branch <branch>`), on every exit
   path including the aborted one. That removal is refused while the branch has
   commits the remote lacks: push them, or if they predate this run leave the
   worktree in place and report its path — never force it away. Report clean
   merges, resolved conflicts with file names, and human-blocked branches.

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

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.
