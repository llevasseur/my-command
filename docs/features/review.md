---
type: feature
title: review
description: Spawn a fresh agent to review an open PR against the codebase, then apply its findings via fb.
tags: [command, workflow, git]
timestamp: 2026-07-22
---

# review

## Summary

Reviews an open PR with a fresh, independent agent — no prior investment in the
PR's approach. The reviewer verifies the PR does what it claims, compares the
diff against the surrounding codebase for discrepancies, and hands back a
single ready-to-run `/fb` line folding every finding into one feedback request.
`/review` shows that output (copy-pasteable into any CLI agent) and then applies
it itself by invoking [fb](fb.md), which chains into [task](task.md), `/clean`,
and `/pr` — updating the same PR.

## Flags / Parameters

- `--target` / `-t <PR-number-or-branch>` — review this PR/branch instead of the
  one associated with the current branch. Accepts anything `gh pr view` does
  (PR number, branch name, PR URL).
- `--here` / `-h` — review in the current checkout, no worktree. Only valid for
  the current branch's own PR; ignored (with a note) if `--target` is also given.
- Anything left after flags is extra review context/focus passed to the reviewer.

## Behavior

Resolves the target PR via `gh pr view`, checks it out in a fresh worktree (or
the current checkout with `--here`), and dispatches a **fresh** (non-fork) agent
to review it: reads the diff, checks it against the PR's own description, runs
the repo's verification for touched areas, and compares against existing
conventions. The agent's report ends with findings plus a fenced `/fb` line (or
a statement that none is needed). `/review` shows that block, then — if there
were findings — runs it via the `fb` skill in the same worktree/checkout, so
`fb`'s default (current branch, no `--target`) applies the fix directly onto
the PR's branch. Never merges or approves the PR, and never posts a GitHub PR
review/comment — its only output is the `/fb`-ready feedback, shown and applied.

## Related

- Command source: `src/commands/review.md`
- Applies findings via: [fb](fb.md), which wraps [task](task.md) and chains into
  [pr](pr.md) for the actual PR update
- Spec: [Adding a command](../specs/adding-a-command.md)
