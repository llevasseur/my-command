# /fb reference — edge cases under `--target`

Read this only when a `--target` run hits one of the cases below: `worktree begin` refuses the
branch, the target repo is not the one this session started in, or `worktree end` refuses the
teardown. A `--target` run that goes cleanly never needs it.

## The branch does not exist

`worktree begin` errors with `branch does not exist locally or on origin`. Stop and tell the
user. Do **not** create a new branch: `--target` applies feedback onto existing work, and a fresh
branch under that name would silently abandon it.

## The branch is already checked out in another worktree

`worktree begin` says the branch is already used by a worktree. Do **not** retry `worktree
begin`. Inspect `my-command-tools worktree list`, validate the reported owner path and branch,
and work in that existing checkout when it is this run's target. A live owner belonging to
another session is a stop, not a reason to force or remove the worktree.

## The target repo is not the session's repo

Prefer starting a new session in the target repo. Otherwise do not call `EnterWorktree`: do all
work through absolute paths under the `path` `worktree begin` reported, run `/task --here`
through those paths, and tear down with `my-command-tools worktree end --branch <branch>` from
outside `path`.

## `worktree end` refuses

The verb re-verifies that the branch reached origin before removing it, and refuses if it has
not. Push first, then re-run it. Never force it, and never route around it with
`ExitWorktree({action: "remove"})`: a worktree `my-command-tools worktree begin` created is not
the session tool's to remove.
