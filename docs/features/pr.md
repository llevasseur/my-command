---
type: feature
title: pr
description: Create or update the PR for the current branch with a concise bulleted description, written straight to GitHub.
tags: [command, git, github]
timestamp: 2026-07-15
---

# pr

## Summary

Pushes the current branch and creates or updates its pull request with a concise,
bulleted description derived from the branch's commits and diff. Removes the local
worktree at the end when the session is running in one.

## Flags / Parameters

- `--draft` / `-d` — mark the PR as a draft (converts an existing non-draft PR to
  draft too). Default is **not** draft.
- Everything after the flags is an optional **title / extra context** for the
  description.

## Behavior

Refuses to run on `main`. Reuses an existing PR (`gh pr edit`) or opens a new one
(`gh pr create --base main`). Only pushes existing commits and writes PR metadata —
never creates commits. When run in a worktree it force-removes it at the end
(`ExitWorktree` with `discard_changes: true`), expecting the task's commits to live
on the worktree — they were pushed to origin, so only the redundant local copy is
discarded.

## Related

- Command source: `src/commands/pr.md`
- Invoked by: [task](task.md) as the final step
- Spec: [Adding a command](../specs/adding-a-command.md)
