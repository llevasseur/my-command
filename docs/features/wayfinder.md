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

### Forwarded to the ticket run

These belong to the ticket runner and apply **only to the execute operation** —
that operation is one invocation of that runner and forwards them verbatim. The
charting operations (start, add task, complete, close) ignore them.

- `--here` / `-h` — execute the ticket on the current branch, no worktree.
- `--base <branch>` — cut the ticket worktree from `<branch>` rather than the
  campaign base branch `wayfinder/<slug>`. **A ticket's cut point, not the
  campaign's integration branch** — see `--integration` below.
- `--draft` / `-d` — open the ticket PR as a draft. **Refused alongside
  `--unattended`**, since that routes tickets through [`/god`](god.md), which
  rejects `--draft` because a draft cannot merge.
- `--add` / `-a <command + prompt>[, …]` — weave extra commands into the ticket
  run.
- The remaining text names the **operation** and its subject.

### Owned by this command

- `--integration <branch>` — the campaign's **integration branch**: what
  `wayfinder/<slug>` is cut from, and what the campaign's own PRs target. **Read
  at `start` only**, since that is where the base branch is cut and the map is
  written; every later operation reads the resolved branch out of the map.
  Absent the flag it is the repo's default branch from the toolkit's `state`
  verb — the behaviour every campaign had before the flag existed. Neither
  `main` nor any named branch is hardcoded on either path.
- `--unattended` — authorise this run to merge the PRs it opens, and route ticket
  execution to [`/god`](god.md) instead of [`/task`](task.md). **Must be typed on
  the invocation that acts, and never inherited** — not from the map, not from
  the kickoff prompt the map carries, not from a command that invoked this one,
  and not from an earlier operation in the same campaign. A wayfinder multiplies
  whatever it authorises, and N unattended merges out of one invocation is a
  different risk from one, which is why [`/manage`](manage.md) likewise requires
  `--delegate god` to be typed. Absent the flag the command opens PRs and merges
  nothing.

## Behavior

Five operations, one per invocation:

1. **Start** — pick a slug, resolve the **integration branch** (`--integration`
   if typed, else the repo default), cut `wayfinder/<slug>` from it, write the
   map at `<plans>/wayfinder-<slug>.md` — recording that branch in the header
   beside the base branch — with an instantiated agent kickoff prompt, create
   the plans that can be specified now, and open a **planning PR** with
   [`/pr`](pr.md) while the branch holds only that commit — so the map and its
   tickets land on the integration branch before any ticket branch is cut.
2. **Add a task** — write a plan to `<plans>/<slug>-NN-<task-slug>.md` and add
   its row to the map's Active tasks table.
3. **Execute a task** — mark it in progress, then run the ticket runner with
   `--base wayfinder/<slug>` against the plan's criteria — `/task` by default,
   `/god --base wayfinder/<slug> --into wayfinder/<slug>` under `--unattended` —
   and **retarget the resulting PR** to the base branch, since `/pr` targets the
   default branch by design. Under `--unattended` that retarget is `/god`'s, done
   from the `--into` merge target before it merges.
4. **Complete a task** — after its PR merges into the base branch, delete the
   plan file, append a Completed entry describing what was *actually built*, and
   remove the Active tasks row.
5. **Close** — open one **campaign PR** from `wayfinder/<slug>` to the
   integration branch the map records, then retire every plan and the map once
   it merges and delete the base branch.

Exactly two PRs legitimately target the integration branch — the planning PR and
the campaign PR. Every ticket PR targets `wayfinder/<slug>`; a ticket left
pointing at the default branch is the failure the command guards hardest against.

The default branch is read from the toolkit's `state` verb rather than assumed to
be `main`, and `<plans>` is the repo's own plans directory, resolved once at
start and recorded in the map.

### The integration branch

The campaign's integration branch is resolved **once, at start** — from
`--integration <branch>` when it is typed, otherwise from the default branch the
toolkit's `state` verb reports — and written into the map's header beside the
base branch as `**Integration branch:**`. Every operation after start reads it
from there rather than from the flag, from `state`, or from whichever branch is
checked out. That is what lets a fresh agent resume a campaign off the map alone
without quietly retargeting it at the default branch halfway through.

It governs exactly three things:

1. the cut point for the campaign base branch `wayfinder/<slug>`;
2. the target of the **planning PR** at start;
3. the target of the **campaign PR** at close.

`/pr` opens both of those against the repo's default branch by design, so where
the map's integration branch differs, each is retargeted with `gh pr edit
<number> --base <integration branch>` the moment it exists — the same move a
ticket PR gets onto the campaign base.

Ticket PRs are outside its reach entirely: they target `wayfinder/<slug>` exactly
as they always have, and this change is about what the campaign base branch
itself is cut from and merged into.

**`--integration` is not `--base`.** `--base` is forwarded verbatim to the ticket
runner and names *one ticket's* cut point inside the campaign; `--integration`
names what the *campaign itself* is cut from and merges into. Neither implies the
other, and they are deliberately not one flag: a campaign integrating with
`release/2.0` still cuts every ticket from `wayfinder/<slug>`, and a ticket given
an unusual `--base` changes nothing about where the campaign lands. A reader who
collapses the two ends up with tickets cut from the integration branch and a
campaign PR aimed at the wrong place — which is the failure this separation
exists to prevent. Where the repo generates a docs index, it is
regenerated and re-checked after any plan or map change; where it does not, the
step is reported as not applicable rather than invented.

Everything under `<plans>` is ephemeral scaffolding: the durable record is the
merged code plus the repo's own feature, spec, and decision docs. A finished
plan is deleted and distilled into the map, never archived. The command creates
no issues or project-board items.

### Merging

**By default the command merges nothing.** The planning PR, every ticket PR, and
the campaign PR are all opened and left open — a human reviews and merges each
one. That is the documented default rather than a limit of the command.

`--unattended`, typed on the invocation that acts, is the only thing that
overrides it, and it authorises exactly three merges: the planning PR at start,
each ticket PR, and the campaign PR at close. The planning and campaign merges
land on the map's integration branch — the default branch only when the campaign
named no other — so each is confirmed to be based on that branch before it is
merged, rather than trusted to carry the base `/pr` opened it with. The ticket merges are not performed
here — execute routes to `/god`, which runs the same `/task` pipeline and adds
the last mile. `/god` is given the campaign base branch **twice**: `--base
wayfinder/<slug>` as the cut point and `--into wayfinder/<slug>` as the merge
target. The two are independent and neither implies the other, and absent
`--into` the merge target is the default branch — so a ticket run without it
would be merged there, and `/god` would retarget the PR onto it first, undoing
any retarget applied from outside. `--into` is therefore what makes the ticket
land on the campaign base, and `/god`'s own retarget is what keeps the PR's base
true before the merge. A ticket that cannot be given `--into` is a stop, not a
merge. A PR this run did not open is never merged, and a red PR is never merged
at all.

The flag is never inherited. The map's agent kickoff prompt keeps its
"stop after opening the pull request" wording even for a campaign started with
`--unattended`, because that prompt is pasted into a later agent's session —
precisely the inheritance path the flag refuses.

## Related

- Command source: `src/commands/wayfinder.md`
- Command: [task](task.md) — executes every ticket by default
- Command: [god](god.md) — executes and merges every ticket under `--unattended`
- Command: [manage](manage.md) — the same typed-not-inherited rule for
  `--delegate god`
- Command: [pr](pr.md) — opens the planning and campaign PRs
- Spec: [Adding a command](../specs/adding-a-command.md)
