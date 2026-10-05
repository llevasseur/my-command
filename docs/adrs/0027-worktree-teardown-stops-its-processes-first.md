---
type: adr
title: Worktree teardown stops the processes rooted in the worktree first
description: A dev server or watcher started in a worktree outlives the directory and can write shared state through a dangling symlink, so worktree end reaps those processes before removing, and a run that removes with ExitWorktree runs worktree reap itself.
tags: [process, commands, toolkit, worktrees, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# Worktree teardown stops the processes rooted in the worktree first

## Status

Accepted. Reaping shipped in PR #53. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md); it holds the history
`src/shared/worktree-ownership.md` carried until
[ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

Some repos symlink shared state, such as a log directory or a database, into each worktree.
A dev server or watcher started inside a worktree survives the worktree's removal and keeps
writing through a path that no longer resolves. A survivor whose reads fail can reconcile the
shared store down to empty, which makes the main checkout look like it has no data.

`my-command-tools worktree end` did not stop those processes at first. PR #53 added reaping to
it. `ExitWorktree` still does not reap.

## Decision

- `worktree end` reaps the processes rooted in the worktree before removing it. `--no-reap`
  is for a deliberate survivor only.
- A run that removes a worktree with `ExitWorktree({action: "remove"})` runs
  `my-command-tools worktree reap --path <worktree path>` immediately before it.
