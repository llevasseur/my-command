---
type: feature
title: wayfinder
description: Run a named campaign of related work as markdown plans in the repo — one base branch, a map of active tasks, one /task per ticket — with no issue tracker involved.
tags: [command, planning, worktrees]
timestamp: 2026-08-15
dirty: true
---

# wayfinder

## Summary

A **wayfinder** is a named campaign of related work — several tasks that ship
together — planned and executed entirely in markdown inside the repo, with no
issue tracker and no project board. It cuts one base branch, keeps one map of
active tasks, hands each ticket to [`/task`](task.md), and appends a summary to
the map as each ticket lands.

It exists for the multi-task effort that is too large for one session but too
small to be worth an issue-tracker layer that agents then have to keep in sync.
Everything the campaign knows lives in files, so it is reviewable in a diff.

## Flags / Parameters

The flags are `/task`'s, and they apply **only to the execute operation** — that
operation is a `/task` invocation and forwards them verbatim. The charting
operations (start, add task, complete, close) ignore them.

- `--here` / `-h` — execute the ticket on the current branch, no worktree.
- `--base <branch>` — cut the ticket worktree from `<branch>` rather than the
  campaign base branch `wayfinder/<slug>`.
- `--draft` / `-d` — open the ticket PR as a draft.
- `--add` / `-a <command + prompt>[, …]` — weave extra commands into the `/task`
  run.
- The remaining text names the **operation** and its subject.

## Behavior

Five operations, one per invocation:

1. **Start** — pick a slug, cut `wayfinder/<slug>` from the repo's default
   branch, write the map at `<plans>/wayfinder-<slug>.md` with an instantiated
   agent kickoff prompt, create the plans that can be specified now, and open a
   **planning PR** with [`/pr`](pr.md) while the branch holds only that commit —
   so the map and its tickets land on the default branch before any ticket
   branch is cut.
2. **Add a task** — write a plan to `<plans>/<slug>-NN-<task-slug>.md` and add
   its row to the map's Active tasks table.
3. **Execute a task** — mark it in progress, then run
   `/task --base wayfinder/<slug> <criteria>`, and **retarget the resulting PR**
   to the base branch, since `/pr` targets the default branch by design.
4. **Complete a task** — after its PR merges into the base branch, delete the
   plan file, append a Completed entry describing what was *actually built*, and
   remove the Active tasks row.
5. **Close** — open one **campaign PR** from `wayfinder/<slug>` to the default
   branch, then retire every plan and the map once it merges and delete the base
   branch.

Exactly two PRs legitimately target the default branch — the planning PR and the
campaign PR. Every ticket PR targets `wayfinder/<slug>`; a ticket left pointing
at the default branch is the failure the command guards hardest against.

The default branch is read from the toolkit's `state` verb rather than assumed to
be `main`, and `<plans>` is the repo's own plans directory, resolved once at
start and recorded in the map. Where the repo generates a docs index, it is
regenerated and re-checked after any plan or map change; where it does not, the
step is reported as not applicable rather than invented.

Everything under `<plans>` is ephemeral scaffolding: the durable record is the
merged code plus the repo's own feature, spec, and decision docs. A finished
plan is deleted and distilled into the map, never archived. The command creates
no issues or project-board items and merges nothing.

## Related

- Command source: `src/commands/wayfinder.md`
- Command: [task](task.md) — executes every ticket
- Command: [pr](pr.md) — opens the planning and campaign PRs
- Spec: [Adding a command](../specs/adding-a-command.md)
