---
type: feature
title: task
description: Carry a plain-language task from criteria to an open PR — isolated worktree, bootstrap, implement, verify, then clean + PR.
tags: [command, workflow, git]
timestamp: 2026-07-15
updated: 2026-07-30
dirty: true
---

# task

## Summary

Takes free-text criteria and drives the whole pipeline: set up an isolated
branch/worktree, bootstrap it, implement, verify, then run `/clean` and `/pr` —
inline in the calling session by default, or in one fresh subagent with `--sub`.
The end goal is always an open PR.

## Flags / Parameters

- `--here` / `-h` — no worktree; work on the **current branch** as it is.
- `--base <branch>` — branch off `<branch>` instead of `main`. Ignored with `--here`.
- `--draft` / `-d` — open the resulting PR as a draft (passed through to `/pr`). Does
  not preserve the worktree; teardown still runs.
- `--sub` / `-s` — run the `/clean` + `/pr` stage in one fresh subagent. Off by
  default: `task` spawns no subagent of its own unless asked.
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

Reconnaissance is batched when no result depends on another, files are read once at the
targeted region and only re-read after something can have changed them, and pagination uses
numeric offsets and limits. Read-only probes that can legitimately miss handle that one
nonzero exit explicitly and quote program-owned globs for zsh. Relative commands are rooted
in the latest toolkit state/worktree result; missing paths trigger one cwd/worktree
re-resolution rather than a blind retry. Dev servers and watchers run in the background with
startup logs and a bounded harness wait — never a foreground two-minute timeout or a
resource-burning `until …; do :; done` loop.

Delegation is opt-in. Step 3 runs `/clean` then `/pr` inline in the calling session unless
`--sub` is given, in which case both go to **one** fresh subagent — never one each, so
`/pr`'s description picks up whatever `/clean` touched without a second handoff. The
commands, their order, and teardown are identical in both modes; only the execution locus
moves, and an added command scheduled at that point follows the pair. `--sub` buys a fresh
context (both commands re-derive their inputs from git, so nothing is lost by shedding the
implementation's file reads) at the cost of a handoff, which is why [god](god.md) always
sets it — it is where that command's woven-in review lands. Teardown never belongs to the
subagent: [pr](pr.md) skips it for a workspace it doesn't own, and Step 3 removes the
worktree itself once the pair returns.

Step 3 is gated on the run having produced something: `state`'s `hasWork` answers it in
one call, counting this run's commits and tracked edits while deliberately excluding
untracked strays. When it comes back false the command skips `/clean` and `/pr` entirely,
tears the worktree down, and reports that the criteria were already satisfied — no push,
no empty PR. Conditional criteria ("do X if it isn't already the case") therefore
terminate without inventing edits.

Step 4 is the terminal report, and it is a step rather than a note because the note form
failed: the proxy records `- done: <outcome>` only from an assistant message that carries
text and no tool call, so a run that ends on a tool call — or bundles its report into one —
records no outcome and reads as interrupted. Every exit routes through Step 4, not just the
shipped one: no-change, still-failing verification, blocked, refused, abandoned. `--sub`
does not move it, because the subagent's report is not the calling session's message.
Step 1 anchors it by putting the closing turn in the todo list as its own final item before
the first tool call — the todo list survives a compaction that drops this prompt, so the
obligation outlives the instructions that created it. "Complete" is still reserved for an
existing PR plus finished worktree teardown; a run that stops earlier reports the stop
accurately and points to `/revive <thread id>` when its proxy thread id is available.

## Related

- Command source: `src/commands/task.md`
- Chains: [clean](clean.md), [pr](pr.md); wraps into [fb](fb.md), [god](god.md)
- Resumed by: [revive](revive.md), when a run is interrupted before reaching its PR
- Spec: [Adding a command](../specs/adding-a-command.md)
