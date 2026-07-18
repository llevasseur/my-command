---
type: feature
title: merge-deps
description: Batch-merge open non-draft Dependabot PRs into main, resolving conflicts with /mc, verifying in a worktree, and cleaning up after each.
tags: [command, git, merge, dependabot]
timestamp: 2026-07-18
---

# merge-deps

## Summary

Merges every open, non-draft dependency PR (Dependabot) into `main`, one at a
time. Each PR is first brought up to date with `main` and conflict-resolved via
[`mc`](mc.md) (`/mc -t <branch>`), checked out in a throwaway worktree to verify
it is green, then merged into `main` through GitHub so branch protection is
honored. Worktrees are removed as each PR finishes, and local `main` is refreshed
between PRs so every merge lands on the latest tree.

## Flags / Parameters

- `--label <name>` — label a PR must carry to be in scope. Default: `dependencies`
  (Dependabot's default). Comma-separated values match any of the labels.
- `--squash` / `--merge` / `--rebase` — merge method passed to `gh pr merge`.
  Mutually exclusive. Default: `--squash`.
- `--auto` — enable GitHub auto-merge per PR (merge when required checks pass)
  instead of waiting on CI. Without it, each PR merges immediately, falling back to
  auto-merge only when GitHub blocks on still-pending checks.
- `--dry-run` / `-n` — list the PRs that would be processed, in order, then stop.
- Takes no free-text criteria — `$ARGUMENTS` holds only flags.

## Behavior

Selects open non-draft PRs based on `main` carrying the label (skipping
cross-repo/fork PRs, whose resolution can't be pushed), then processes them
sequentially in ascending PR number. Per PR: `git fetch origin <branch>` to refresh
the branch first (Dependabot force-pushes after the up-front fetch, so a stale ref
would make `/mc`'s push get rejected as non-fast-forward), `/mc -t <branch>` to merge
`main` in and resolve conflicts, verify the bump in an isolated worktree, `gh pr merge`
into `main`, remove the worktree, and refresh local `main`. Anything left unresolved,
failing verification, or on a fork is reported for a human rather than merged.

## Related

- Command source: `src/commands/merge-deps.md`
- Delegates conflict resolution to [`mc`](mc.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
