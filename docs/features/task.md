---
type: feature
title: task
description: Carry a plain-language task from criteria to an open PR — isolated worktree, bootstrap, implement, verify, then clean + PR.
tags: [command, workflow, git]
timestamp: 2026-07-15
---

# task

## Summary

Takes free-text criteria and drives the whole pipeline: set up an isolated
branch/worktree, bootstrap it, implement, verify, then run `/clean` and `/pr` in
fresh subagents. The end goal is always an open PR.

## Flags / Parameters

- `--here` / `-h` — no worktree; work on the **current branch** as it is.
- `--base <branch>` — branch off `<branch>` instead of `main`. Ignored with `--here`.
- `--draft` / `-d` — open the resulting PR as a draft (passed through to `/pr`). Does
  not preserve the worktree; teardown still runs.
- `--add` / `-a <list>` — comma-separated `command + prompt` entries to weave extra
  commands into the run; the leading token names the command, the rest is its prompt.
- Everything after the flags is the **task criteria**.

## Behavior

Default: fetch `origin`, create a worktree off the latest `main`, bootstrap it,
implement against the criteria, verify (typecheck/tests/build for what changed),
commit in logical commits, then clean + PR + teardown. Teardown removes the worktree
whether or not the PR is a draft — the branch is on origin either way. Never implements
or commits on `main`.

## Related

- Command source: `src/commands/task.md`
- Chains: [clean](clean.md), [pr](pr.md); wraps into [fb](fb.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
