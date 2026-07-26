---
type: feature
title: review
description: Independently review an open PR against the codebase, then apply its findings via fb.
tags: [command, workflow, git]
timestamp: 2026-07-22
---

# review

## Summary

Reviews an open PR with an independent agent — no prior investment in the PR's
approach. By default the command spawns that fresh reviewer; `--here` means the
current agent is already fresh and performs the review itself. The reviewer
verifies the PR does what it claims, compares the diff against the surrounding
codebase for discrepancies, and hands back a
single ready-to-run `/fb` line folding every finding into one feedback request.
`/review` shows that output (copy-pasteable into any CLI agent) and then applies
it itself by invoking [fb](fb.md), which chains into [task](task.md), `/clean`,
and `/pr` — updating the same PR.

## Flags / Parameters

- `--target` / `-t <PR-number-or-branch>` — review this PR/branch instead of the
  one associated with the current branch. Accepts anything `gh pr view` does
  (PR number, branch name, PR URL).
- `--here` / `-h` — review the current branch's PR directly in the current
  checkout: no worktree and no new review agent. This expects the command to
  already be running inside a fresh, independent agent. Ignored (with a note)
  if `--target` is also given.
- Anything left after flags is extra review context/focus passed to the reviewer.

## Behavior

Resolves the target PR via `gh pr view`. By default it checks the branch out in a
fresh worktree with `worktree begin --existing` and dispatches a **fresh**
(non-fork) agent to review it. With `--here`, it stays in the current checkout and
the current agent runs the same review rubric directly, without spawning another
agent. The review reads the diff, checks it against the PR's own description, runs
the repo's verification with the toolkit's `verify` verb, and compares against
existing conventions. Its report ends with findings plus a fenced `/fb` line (or a
statement that none is needed). `/review` shows that block, then — if there were
findings — runs it via the `fb` skill in the same worktree/checkout, so `fb`'s
default (current branch, no `--target`) applies the fix directly onto the PR's
branch. It never merges or approves the PR, and never posts a GitHub PR
review/comment — its only output is the `/fb`-ready feedback, shown and applied.

## Related

- Command source: `src/commands/review.md`
- Applies findings via: [fb](fb.md), which wraps [task](task.md) and chains into
  [pr](pr.md) for the actual PR update
- Woven into: [god](god.md), which adds this as a `task --add` entry so the review
  runs after `pr` inside that same subagent
- Spec: [Adding a command](../specs/adding-a-command.md)
