---
type: feature
title: clean
description: Clean up comments across a branch's changes — lean and to the point, comments only, never code.
tags: [command, comments]
timestamp: 2026-07-15
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

## Related

- Command source: `src/commands/clean.md`
- Invoked by: [task](task.md) before [pr](pr.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
