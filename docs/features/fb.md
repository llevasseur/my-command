---
type: feature
title: fb
description: Implement a feedback request — a thin wrapper around task, current branch by default or a worktree of an existing branch.
tags: [command, workflow, git]
timestamp: 2026-07-15
updated: 2026-08-08
---

# fb

## Summary

Applies a plain-language feedback request. Thin wrapper around [task](task.md):
by default it works on the current branch (via `/task --here`), or targets an
existing branch in a fresh worktree.

## Flags / Parameters

- `--target` / `-t <branch>` — apply the feedback onto **existing** `<branch>` in a
  fresh worktree, instead of the current branch.
- `--worktree <path>` — the workspace was already made by the dispatcher; make none,
  work through absolute paths beneath it, forward it to `/task`, and leave it standing.
- Everything after the flags is the **feedback text**.

## Behavior

No flag: feedback is applied on the current branch through `/task --here`; if that
branch is the default branch, `/task` creates a feature branch in place. With
`--target`, `worktree begin --branch <branch> --existing --bootstrap` checks that
branch out in a worktree — the `--existing` flag is what keeps it from creating a new
branch over work that already exists, and a `branch does not exist locally or on
origin` error is a stop, never a reason to create one — and the feedback is applied
there, then cleaned and PR'd like a normal task run.
If Git reports that the branch is already owned by a worktree, `fb` does not retry the same
creation or force-remove the owner: it resolves the existing worktree list, validates that
checkout when it is the target, and stops when another live session owns it.
That worktree is `/fb`'s to remove once `/task` reports the PR: [pr](pr.md) skips teardown
for any worktree its session didn't create. Same-repo runs step out with `ExitWorktree`
(`action: "keep"`, the only action allowed for a worktree entered by path) and finish
with `worktree end --branch <branch>`. Cross-repo runs never enter it — a new session in
the target repo is preferred, and otherwise all work goes through absolute paths under
the reported `path` and teardown runs from outside. Either way `worktree end` re-verifies
the branch reached origin first.

## Related

- Command source: `src/commands/fb.md`
- Wraps: [task](task.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
