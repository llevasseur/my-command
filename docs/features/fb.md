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
`--target`, an existing branch is checked out in a worktree and the feedback is
applied there, then cleaned and PR'd like a normal task run.

## Related

- Command source: `src/commands/fb.md`
- Wraps: [task](task.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
