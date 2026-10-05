# Apply Feedback reference — edge cases with a target branch

Read this only when a target-branch run hits one of the cases below. A run that
goes cleanly never needs it.

## The branch does not exist

The helper reports that the branch exists neither locally nor on origin. Stop
and tell the user. Never create the branch: a target applies feedback onto
existing work, and a fresh branch under that name would silently abandon it.

## The branch is already checked out in another worktree

Do not retry the helper. List the repository's worktrees, validate the reported
owner path and branch, and work in that existing checkout when it is this run's
target. A live owner belonging to another session is a stop, not a reason to
force or remove the worktree.

## Entering the worktree is refused

A refusal there describes how the worktree was created, so do not retry it and
do not reinvent a workaround. Work through absolute paths under the reported
path, and tear down with the repository helper from outside it.

## The target repository is not this session's repository

Prefer starting a new session in the target repository. Otherwise work through
absolute paths under the reported path, run the task workflow there, and tear
down with the repository helper from outside that path.

## Teardown is refused

The helper re-verifies that the branch reached origin before removing the
worktree, and refuses if it has not. Push first, then run it again. Never force
it.
