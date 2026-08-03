---
type: feature
title: task-bootstrap
description: One-time per repo — interview the stack and generate that repo's own scripts/bootstrap-worktree.sh and/or "Worktree Setup" doc section, which task's Step 1.5 discovers.
tags: [command, workflow, setup]
timestamp: 2026-07-15
updated: 2026-08-02
---

# task-bootstrap

## Summary

A one-time-per-repo setup command: it interviews the repo's stack and generates a
`scripts/bootstrap-worktree.sh` and/or a "Worktree Setup" doc section so
[task](task.md) can bootstrap fresh worktrees (env symlinks, install, lazy codegen)
reliably.

## Flags / Parameters

- `--here` / `-h` — work on the current branch; no worktree.
- `--base <branch>` — branch the worktree off `<branch>` instead of `main`.
- `--draft` / `-d` — open the PR as a draft (passed to [pr](pr.md)).
- Everything after the flags is free-text **notes about the stack**, parsed off the
  `<command-args>` block, that seed the interview.

## Behavior

Inspects the project (package manager and lockfile, monorepo layout, gitignored env
files, generators and the package directories they run in, shell conventions),
interviews only for what it can't infer, then writes a repo-specific
`scripts/bootstrap-worktree.sh` and/or a "Worktree Setup" section in
`AGENTS.md`/`CLAUDE.md`. [task](task.md) Step 1.5 reads `bootstrapScript` and
`bootstrapped.ok` off `worktree begin --bootstrap`'s JSON, falls back to the doc
section, and only then to its generic fallback — the script is the
same one the toolkit's `worktree begin --bootstrap` runs.

The generated bootstrap MUST auto-detect the main checkout via `git rev-parse
--git-common-dir` rather than a hardcoded path or an assumed branch, symlink
gitignored env from it without copying or overwriting, install at the worktree
root, regenerate derived code from the worktree's *own* schema rather than
symlinking artifacts in, and refuse to run from the main checkout. It is committed,
never gitignored — only tracked files reach fresh worktrees. It is verified with
`bash -n`, `shellcheck` where available, and a package-manager-shim dry run before
shipping. An existing bootstrap is updated, not re-scaffolded.

Step 7 adds a changelog entry, commits only the files this command authored, runs
`/clean` and commits whatever that leaves, then `/pr`. Its own workspace comes
from `worktree begin` *without* `--bootstrap`, since the script it is about to write
doesn't exist yet. It removes that workspace itself after `/clean` and `/pr` —
[pr](pr.md) only tears down worktrees its own session created — by stepping out with
`ExitWorktree` (`action: "keep"`) and running `worktree end --branch
chore/worktree-bootstrap`.

## Related

- Command source: `src/commands/task-bootstrap.md`
- Consumed by: [task](task.md) during worktree bootstrap
- Spec: [Adding a command](../specs/adding-a-command.md)
