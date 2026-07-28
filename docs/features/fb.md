---
type: feature
title: fb
description: Implement a feedback request — a thin wrapper around task, current branch by default or a worktree of an existing branch.
tags: [command, workflow, git]
timestamp: 2026-07-15
---

# fb

## Summary

Applies a plain-language feedback request. Thin wrapper around [task](task.md):
by default it works on the current branch (via `/task --here`), or targets an
existing branch in a fresh worktree.

## Flags / Parameters

- `--target` / `-t <branch>` — apply the feedback onto **existing** `<branch>` in a
  fresh worktree, instead of the current branch.
- Everything after the flags is the **feedback text**.

## Behavior

No flag: feedback is applied on the current branch through `/task --here`. With
`--target`, `worktree begin --existing` checks that branch out in a worktree — the
`--existing` flag is what keeps it from creating a new branch over work that already
exists — and the feedback is applied there, then cleaned and PR'd like a normal task run.
That worktree is `/fb`'s to remove once `/task` reports the PR: [pr](pr.md) skips teardown
for any worktree its session didn't create, so `/fb` steps out with `ExitWorktree`
(`action: "keep"`, the only action allowed for a worktree entered by path) and finishes
with `worktree end --branch <branch>`, which re-verifies the branch reached origin first.

## Related

- Command source: `src/commands/fb.md`
- Wraps: [task](task.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
