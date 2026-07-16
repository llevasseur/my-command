---
type: feature
title: task-bootstrap
description: One-time per repo — interview the stack and generate that repo's own scripts/bootstrap-worktree.sh for task to use.
tags: [command, workflow, setup]
timestamp: 2026-07-15
---

# task-bootstrap

## Summary

A one-time-per-repo setup command: it interviews the repo's stack and generates a
`scripts/bootstrap-worktree.sh` so [task](task.md) can bootstrap fresh worktrees
(env symlinks, install, lazy codegen) reliably.

## Flags / Parameters

- None. Run once per repository.

## Behavior

Inspects the project (package manager, env files, generated code) and writes a
repo-specific bootstrap script that `task` prefers over its generic fallback.

## Related

- Command source: `src/commands/task-bootstrap.md`
- Consumed by: [task](task.md) during worktree bootstrap
- Spec: [Adding a command](../specs/adding-a-command.md)
