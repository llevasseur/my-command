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
one fresh subagent. The end goal is always an open PR.

## Flags / Parameters

- `--here` / `-h` — no worktree; work on the **current branch** as it is.
- `--base <branch>` — branch off `<branch>` instead of `main`. Ignored with `--here`.
- `--draft` / `-d` — open the resulting PR as a draft (passed through to `/pr`). Does
  not preserve the worktree; teardown still runs.
- `--add` / `-a <list>` — comma-separated `command + prompt` entries to weave extra
  commands into the run; the leading token names the command, the rest is its prompt.
- Everything after the flags is the **task criteria**.

## Behavior

Default: `worktree begin --bootstrap` (which fetches first, so the branch lands on the
freshest `origin/main` rather than a stale local ref) then `EnterWorktree` at the path it
reports, implement against the criteria, `verify` the repo's own gates, `commit` in
logical commits, then clean + PR + teardown. Teardown removes the worktree whether or not
the PR is a draft — the branch is on origin either way, so it confirms the push and passes
`discard_changes` up front rather than tripping `ExitWorktree`'s commit guard. Never
implements or commits on `main`; `commit` refuses the default branch outright.

The deterministic plumbing runs through the [command toolkit](../specs/command-toolkit.md)
rather than ad-hoc `git` calls, which is also where the guards live: staging is always an
explicit path list, so carryover files from a shared worktree or dirty checkout stay put
instead of riding along.

Step 3 is gated on the run having produced something: `state`'s `hasWork` answers it in
one call, counting this run's commits and tracked edits while deliberately excluding
untracked strays. When it comes back false the command skips `/clean` and `/pr` entirely,
tears the worktree down, and reports that the criteria were already satisfied — no push,
no empty PR. Conditional criteria ("do X if it isn't already the case") therefore
terminate without inventing edits.

## Related

- Command source: `src/commands/task.md`
- Chains: [clean](clean.md), [pr](pr.md); wraps into [fb](fb.md), [god](god.md)
- Resumed by: [revive](revive.md), when a run is interrupted before reaching its PR
- Spec: [Adding a command](../specs/adding-a-command.md)
