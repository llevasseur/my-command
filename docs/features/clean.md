---
type: feature
title: clean
description: Clean up comments across a branch's changes — lean and to the point, comments only, never code.
tags: [command, comments]
timestamp: 2026-07-15
updated: 2026-07-28
---

# clean

## Summary

Trims and deletes comments on the lines a branch changed, making them lean and to
the point. Only touches comments — never code, logic, formatting, or behavior.

## Flags / Parameters

- `[branch]` (positional) — target branch to diff; defaults to the current branch.
  Diffs in place, never checks out.
- `[path / scope]` (positional) — limit the cleanup to a path or scope.
- No dash flags.

## Behavior

Computes the branch diff against its merge-base (plus uncommitted changes when
targeting the current branch) and only considers comments on added/modified lines.
Deletes restating/narration/ceremony comments, tightens verbose ones, keeps
load-bearing and structural ones. Never adds comments; does not commit.

Prose in Markdown docs is out of scope even when the branch diff touches it —
that is [truncate](truncate.md)'s pass, which has claim-preservation rules this
one doesn't. Comments inside a doc's fenced code blocks are still in scope here.

## Related

- Command source: `src/commands/clean.md`
- Invoked by: [task](task.md) before [pr](pr.md)
- Sibling: [truncate](truncate.md) — the same lean-up for **doc prose**
- Spec: [Adding a command](../specs/adding-a-command.md)
