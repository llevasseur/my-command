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
  the invocation that acts.** No operation infers it — not from a command that
  invoked this one, not from an earlier operation in the same campaign, and not
  from the map, which records the campaign's mode but authorises nothing by
  itself. A wayfinder multiplies whatever it authorises, and N unattended merges
  out of one invocation is a different risk from one, which is why
  [`/manage`](manage.md) likewise requires `--delegate god` to be typed. Absent
  the flag on this invocation the command opens PRs and merges nothing, whatever
  the map says. **One path deliberately puts the flag in front of the next agent
  to type** — the map's own kickoff prompt, for a campaign the map records as
  unattended; see [Resuming an unattended campaign](#resuming-an-unattended-campaign).

## Behavior

Five operations, one per invocation:

1. **Start** — pick a slug, resolve the **integration branch** (`--integration`
   if typed, else the repo default), cut `wayfinder/<slug>` from it, write the
   map at `<plans>/wayfinder-<slug>.md` — recording that branch in the header
   beside the base branch, along with `**Unattended:**`, the campaign's mode,
   fixed here by whether `--unattended` was typed on this `start` — with an
   agent kickoff prompt generated against that mode, create
   the plans that can be specified now — including the campaign's **final
   ticket**, `<slug>-zz-retire-done-plans` — and open a **planning PR** with
   [`/pr`](pr.md) while the branch holds only that commit — so the map and its
   tickets land on the integration branch before any ticket branch is cut.
2. **Add a task** — write a plan to `<plans>/<slug>-NN-<task-slug>.md`, opening
   it with the plan header's `**Status:** active` marker, and add its row to the
   map's Active tasks table with status `todo`.
3. **Execute a task** — mark it `in-progress`, then run the ticket runner with
   `--base wayfinder/<slug>` against the plan's criteria — `/task` by default,
   `/god --base wayfinder/<slug> --into wayfinder/<slug>` under `--unattended` —
   and **retarget the resulting PR** to the base branch, since `/pr` targets the
   default branch by design. Under `--unattended` that retarget is `/god`'s, done
   from the `--into` merge target before it merges.
4. **Complete a task** — after its PR merges into the base branch, mark the plan
   **done in place** (`**Status:** done · YYYY-MM-DD`), append a Completed entry
   describing what was *actually built*, and remove the Active tasks row. The
   plan file is not deleted and not moved.
5. **Close** — confirm the final `zz` ticket has landed, open one **campaign PR**
   from `wayfinder/<slug>` to the integration branch the map records, then retire
   the map once it merges and delete the base branch. The plans are already gone,
   deleted by that ticket rather than by this operation.

Exactly two PRs legitimately target the integration branch — the planning PR and
the campaign PR. Every ticket PR targets `wayfinder/<slug>`; a ticket left
pointing at the default branch is the failure the command guards hardest against.

The default branch is read from the toolkit's `state` verb rather than assumed to
be `main`, and `<plans>` is the repo's own plans directory, resolved once at
start and recorded in the map.

### Task status

A task's **Status** in the map is one of exactly six values. The vocabulary is
flat by design — no sub-states, no state machine — because its job is to tell an
agent resuming from the map **why** a task is not running, and each answer calls
for a different action.

| Status | Means | What a resuming agent does |
|--------|-------|----------------------------|
| `todo` | Never started — no branch, no PR, no history. | Pick it up and execute it. |
| `in-progress` | A ticket run is executing it now. | Leave it alone **while that run is live**; where nothing is behind it, read the branch and repair the row (below). |
| `paused` | Deliberately stopped, resumable as it stands. Nothing wrong with it. | Pick it back up and carry on. |
| `blocked-limit` | Stopped mid-run because the usage window or rate limit ran out. **Nothing is wrong with the work.** | Resume once the window resets; execute something else in the meantime. |
| `rejected` | A human reviewed it and turned it down. | **Never retry it.** It needs a new human decision or a rewritten plan. |
| `redo` | The work landed but must be done again differently. | Restart it from the plan. |

**Three of those mean "stopped", and the command says the difference outright**
rather than leaving it to be read off the names. `todo` is **never started** —
nothing was attempted, so there is nothing to resume. `rejected` is **stopped
because a human turned it down** — it was attempted, reviewed, and refused, which
is why it is the one status a resuming agent must never act on by itself.
`blocked-limit` is **stopped because the usage window ran out** — it was
attempted, nothing about it was judged, and it resumes untouched when the window
resets, so treating it like `rejected` strands work that is only waiting on a
clock. `paused` sits with `blocked-limit` on that split and differs only in what
stopped it: a deliberate choice rather than a limit.

A long unattended campaign pausing and resuming is a normal event rather than an
incident, and `paused` / `blocked-limit` are how the map records it.

**Repairing a stale `in-progress` row.** `blocked-limit` is the one status the
run that needs it often cannot write — a run whose usage window ran out mid-ticket
rarely gets another turn to edit the map, so the status meant to survive a hard
stop is the one most likely to be missing, and the row is left on `in-progress`.
Unrepaired that compounds: each agent skips the stale row, starts another ticket,
and hits the same wall, until every row reads `in-progress` and the campaign
reports no eligible task while nothing is running. So repairing those rows is a
resuming agent's job, and it comes **before** picking a task. Where a live
worktree, a recently pushed branch, or an open PR is behind the row, it stays.
Where none is, the branch is read and the row rewritten — `blocked-limit` with a
Note where work is in hand, `todo` where there is nothing worth resuming. The map
template's kickoff prompt carries the same rule in provider-neutral wording, so a
campaign is repairable from the map alone.

A task on `rejected` counts as blocked on a human and one on `blocked-limit` as
blocked on the clock: with only those left, the campaign is reported as blocked
on that dependency rather than as ready to close, which is true only when no
active tasks remain at all.

The table carries one short free-text **Note** beside the Status — the only
column the vocabulary adds. Three of the six are useless without a reason:
`rejected` without the objection cannot become a rewritten plan, `redo` without
"differently how" is a re-run of the same thing, and `blocked-limit` without a
reset time makes the next agent guess whether to wait. The Note is **required**
for those three and **empty** for `todo`, `in-progress`, and `paused`.

Every operation that writes a status names which one it writes:

- **Add a task** writes `todo`, and only `todo` — a freshly added task is by
  definition one that was never started.
- **Execute a task** writes `in-progress` on the way in, from any of the four
  eligible statuses (`todo`, `paused`, `blocked-limit`, `redo`). `rejected` is
  never picked up here. If the ticket stops before it lands, the same operation
  writes why: `blocked-limit` (window ran out, Note names the reset),
  `paused` (deliberate stop, Note empty), or `rejected` (turned down, Note
  carries the objection). This is also what a pause writes.
- **Complete a task** writes no status — it removes the row, which is why there
  is no `done` among the six. Re-opening completed work is the one path that
  writes `redo`: the row is restored with `redo` and a Note naming what must
  differ, and the plan is rewritten, since `redo` means restart from the plan.

The map template's Active tasks table ships with a legend listing all six and the
Note rule, so every campaign map carries the vocabulary rather than depending on
whoever reads it having read this doc.

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

The command creates no issues or project-board items.

### Plan lifecycle

Everything under `<plans>` is ephemeral scaffolding: the durable record is the
merged code plus the repo's own feature, spec, and decision docs. But it is
scaffolding on a schedule, not scaffolding that vanishes a piece at a time.

A finished task's plan is **marked done where it already lives** — its header's
`**Status:**` line flips from `active` to `done · YYYY-MM-DD` — and distilled
into the map's Completed log. It is not deleted, not moved, and above all not
archived: a copy of a plan under `archive/` or `done/` is a second source of
truth that starts drifting from the first immediately, which is exactly why the
marker goes into the file rather than the file going somewhere else. One file,
one path, one state.

**It stays for the rest of the campaign**, and the reason is concrete. The
Completed entry records what was *built* — prose written after the fact about the
outcome. The plan records what was *asked*: the criteria, the constraints, the
conditions the work had to meet. Only the second can be handed to a runner again,
so `redo` — re-opening a landed task to do it differently — is a real operation
rather than a rewrite. A campaign that deleted its plans at completion could
re-open a task only from a summary of the thing it was trying to replace.

**The campaign's final ticket deletes them, as scheduled work.** `zz` is a
reserved task number that always sorts last; `<slug>-zz-retire-done-plans` is
created at start with the rest of the tickets, executed after every other task,
and removes every `<plans>/<slug>-*.md` plan including its own. `close` expects
it to exist and will not sweep the plans by hand in its place. **That ticket is
critical, not optional bookkeeping**: it is the only thing that ever removes a
plan, so skipping it leaves the campaign's scaffolding in the repository
permanently — a directory of done plans for a campaign that ended, owned by
nobody. `close` retires the map; the ticket retires the plans.

The plan file's `done` marker is not the map's Status column and does not join
that six-value vocabulary. The column describes a **row**, which a completed task
no longer has; the marker describes a **file**, which a completed task keeps.
That is why completion writes `done` on the plan and still writes no `done`
status on any task.

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

### Resuming an unattended campaign

The flag is not inherited. No operation reads it from the map, from a command
that invoked this one, or from an earlier operation in the same campaign — a
`start` given the flag authorises nothing for the `execute` that follows it, and
a run without the flag typed on it merges nothing whatever the map says.

**One path is a deliberate exception, and only one: the map's own agent kickoff
prompt.** That prompt is not documentation about the campaign — it *is* the
resume path, the literal text a fresh agent is handed to pick the campaign back
up. It used to be written with its "stop after opening the pull request" line
fixed, including for a campaign started with `--unattended`, so every resume
silently downgraded an unattended campaign to the reviewed default. Nothing
errored: each ticket produced a correct, reviewed, open PR, and the campaign
accumulated open PRs instead of a merged base branch. Since a multi-week campaign
resumes as a matter of course — `paused` and `blocked-limit` exist because it
does — a campaign whose whole premise was no human in the loop could not finish
without one.

So `start` records the campaign's mode in the map header as `**Unattended:**`,
`yes` or `no`, from whether the flag was typed on that `start`. The kickoff
prompt's closing paragraph is **generated** against it: on `no` it is today's
stop-and-let-a-human-review wording, unchanged, which is also what every map
written before this change reads as; on `yes` it tells the resuming agent to type
`--unattended` and to carry the ticket through to merged into the campaign base
rather than stopping at the PR. Naming the flag there keeps the prompt
provider-neutral — it is this workflow's own flag, spelled the same wherever the
workflow is installed — and the prompt still names no runner command, saying
"the merge-through runner" instead.

**The flag is still read only from the invocation that acts.** The map
authorises nothing; it decides which sentence gets written, so that the agent who
resumes the campaign types the flag rather than having to know it was owed.

[ADR 0006](../adrs/0006-unattended-campaigns-resume-unattended.md) records the
decision and states the risk it accepts outright: a map is a file in the
repository, so anyone who can edit it can flip the line and put a merge in a
later resume's hands, and `--unattended` is no longer a per-invocation *human*
act for a campaign started unattended. It stays per-invocation, and the
escalation still needs either a `start` a human gave the flag to or a commit to
the map — both of which land in a diff.

## Related

- Command source: `src/commands/wayfinder.md`
- Command: [task](task.md) — executes every ticket by default
- Command: [god](god.md) — executes and merges every ticket under `--unattended`
- Command: [manage](manage.md) — the same typed-not-inherited rule for
  `--delegate god`
- Command: [pr](pr.md) — opens the planning and campaign PRs
- ADR: [0006 — A campaign recorded as unattended resumes
  unattended](../adrs/0006-unattended-campaigns-resume-unattended.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
