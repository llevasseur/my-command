---
name: wayfinder
description: Run a named campaign of related work tracked as markdown plans in the repository rather than on an issue tracker — one base branch, a map of active tasks, one task run per ticket, and a summary appended as each lands.
---

# Wayfinder

A wayfinder is a named campaign of related work — several tasks that ship
together — tracked entirely in markdown inside the repository. It plans and
executes a multi-task effort with no issue tracker and no project board: fewer
layers to keep in sync, and everything reviewable in a diff.

Parse `--unattended`, `--integration <branch>`, `--here`, `--base <branch>`,
`--draft`, and `--add <command prompt,...>`; the remaining text names the
operation and its subject. Every flag but `--unattended` and `--integration`
belongs to the ticket runner and applies only when this run executes a ticket,
because that operation is one invocation of that runner and forwards them
verbatim. The charting operations ignore them.

`--integration <branch>` belongs to this workflow and names the campaign's
**integration branch**: the branch `wayfinder/<slug>` is cut from, and the branch
the campaign's own pull requests target. It is read on the **start** operation
only — that is where the base branch is cut and the map is written — and every
later operation reads the resolved branch **out of the map** rather than
re-deriving it. Absent the flag, the integration branch is the repository default
branch reported by the repository helper's state verb, which is what every
campaign started before this flag existed already used. Neither branch name is
hardcoded: not `main`, and not whatever branch one campaign happens to name.

It governs exactly three things and nothing else — the cut point for
`wayfinder/<slug>`, the target of the planning pull request at start, and the
target of the campaign pull request at close. Ticket pull requests are untouched
by it and still target `wayfinder/<slug>`.

**`--integration` is not `--base`, and `--base` is not it.** `--base` is
forwarded to the ticket runner and names *a ticket's* cut point inside the
campaign; `--integration` names what the *campaign itself* is cut from and merged
into. Naming one never sets the other. A campaign integrating with `release/2.0`
still cuts its tickets from `wayfinder/<slug>`, and a ticket cut from somewhere
unusual with `--base` changes nothing about where the campaign lands. Do not read
either as shorthand for the other, and do not collapse them into one flag.

`--unattended` belongs to this workflow. It authorises the run to merge the pull
requests it opens, and routes ticket execution to `$god` rather than the
stop-at-a-pull-request `$task`. **It must be typed on the invocation
that acts, and it is never inherited** — not from the map, not from the kickoff
prompt the map carries, not from a workflow that invoked this one, and not from
an earlier operation in the same campaign. The reason is what a campaign is: it
multiplies whatever it authorises, and N unattended merges out of one invocation
is a different risk from one, which is why `$manage` likewise requires its
merge-through delegate to be typed rather than inherited. Absent the flag, this
workflow opens pull requests and merges nothing.

`--draft` is refused alongside `--unattended`: `$god` rejects a draft outright,
because a draft cannot merge. Say to run the campaign without
`--unattended` if the tickets are meant to stay in draft.

Announce which of the five operations you picked before acting: start, add task,
execute, complete task, or close — and, when `--unattended` is typed, announce in
the same breath that this run will merge.

Before the first tool call, record this run as a task list whose **last item is
the closing turn**, kept as its own item and left open until nothing else
remains. A compaction carries that list forward; it does not carry these
instructions, so the item is the only surviving record that the run owes an
outcome. Resolve it in the same tool-call turn as the run's last piece of real
work, never as a bookkeeping call after it — a run whose last scheduled action
is that mark ends on it, and the message meant to follow never arrives.

Open each numbered step by naming it in prose as you enter it, so the record of
the run anchors the step it entered instead of inferring it from surrounding
words. Where the workflow declares explicitly numbered steps, state the number
from the heading rather than from a count of steps already finished.

## Mental model

- One wayfinder is one integration branch — the branch the campaign is cut from
  and merged back into. `--integration <branch>` names it at start; absent the
  flag it is the repository default branch from the repository helper's state
  verb. Never hardcode `main`. Whichever it resolves to, start writes it into the
  map and every later operation reads it from there, so an agent resuming from
  the map never re-derives it.
- One wayfinder is one base branch `wayfinder/<slug>`, cut from that integration
  branch.
- One wayfinder is one map file `<plans>/wayfinder-<slug>.md` listing active
  tasks and logging completed ones.
- Each task is one plan file `<plans>/<slug>-NN-<task-slug>.md` and one branch
  `task/<slug>-NN-<task-slug>` cut from the base branch. Every ticket pull
  request targets the base branch, never the default branch.
- `<plans>` is the repository's own plans directory — `docs/plans/` where it has
  one, otherwise whatever its docs convention names. Resolve it once at start
  and record it in the map.
- Everything under `<plans>` is ephemeral scaffolding. The durable record is the
  merged code plus the repository's feature, spec, and decision docs; the map
  and its plans are deleted when the campaign closes.

Exactly two pull requests legitimately target the integration branch: the
planning pull request at start, and the campaign pull request at close. On a
campaign that never named an integration branch, that branch is the default
branch and this reads exactly as it always did.

## Discovery

Whenever an operation looks at more than one file — the complete and close
operations read the map and every plan beside it — enumerate the paths from one
listing first, then read the whole enumeration in one turn. Never loop one read
per plan, and never re-read a file already in this session's context; locate the
symbol you now want with a single search and pull only the range you still need.
After any compaction boundary or hand-off, re-read the files the next edit pass
will write before editing, because a continuation summary does not satisfy a
file-editing tool's read-before-write precondition.

## Task status vocabulary

A task's status in the map is one of exactly six values and no others. The
vocabulary is deliberately flat — no sub-states and no transitions to memorise —
because its whole job is to tell an agent resuming from the map **why** a task is
not running, and each answer calls for a different action.

- `todo` — never started: no branch, no worktree, no pull request, no history to
  read. Pick it up and execute it.
- `in-progress` — a ticket run is executing it right now. Leave it alone; only if
  that run is known dead, read the branch before touching anything.
- `paused` — deliberately stopped and resumable exactly as it stands. Nothing is
  wrong with it. Pick it back up and carry on from where it stopped.
- `blocked-limit` — stopped mid-run because the usage window or rate limit ran
  out. Nothing is wrong with the work; the clock ran out, not the plan. Resume it
  once the window resets, and until then execute a different task rather than
  waiting on it.
- `rejected` — the user reviewed it and turned it down. Do **not** retry it. It
  needs a new decision from the user, or a rewritten plan. Report it and move on
  to another task.
- `redo` — the work landed but has to be done again differently. Restart it from
  the plan: read the note for what must differ, then execute it as a fresh run.

**Three of those mean the task is stopped, and they are not interchangeable.**
State the difference outright rather than leaving a reader to infer it from the
status names:

- `todo` means **never started**. Nobody attempted it, so there is nothing to
  resume and executing it is the ordinary thing to do.
- `rejected` means **stopped because the user turned it down**. It was attempted,
  reviewed, and refused. Silently retrying it re-does work a human already said
  no to, which is why it is the one status a resuming agent must never act on by
  itself.
- `blocked-limit` means **stopped because the usage window ran out**. It was
  attempted, nothing about it was judged, and it resumes untouched once the
  window resets. No human decision is owed, and treating it like `rejected`
  strands work that is only waiting on a clock.

`paused` sits with `blocked-limit` on that split — attempted, unjudged,
resumable as-is — and differs only in what stopped it: a deliberate choice rather
than a limit.

The active-tasks table carries a short free-text **note** beside the status,
because three of the six are useless to a resuming agent without a reason:
`rejected` without the user's objection cannot become a rewritten plan, `redo`
without "differently how" is a re-run of the same thing, and `blocked-limit`
without a reset time makes the next agent guess whether to wait. The note is
required for `rejected`, `blocked-limit`, and `redo` — one clause, not a
paragraph — and empty for `todo`, `in-progress`, and `paused`. A paused task that
needs explaining is really a rejected or a limit-blocked one. That note is the
only column the vocabulary adds: do not add a second, and do not split a status
into sub-states, because a distinction needing more than one word belongs in the
note or in the plan.

## Operations

### 1. Start

1. Pick a short kebab-case slug and confirm it if the request is ambiguous.
2. Resolve the integration branch, once, here: `--integration <branch>` if it was
   typed on this invocation, otherwise the default branch the repository helper
   reports. Do not assume it is `main`, and do not assume it is not. Confirm the
   resolved branch exists on the remote before cutting anything from it — a
   mistyped integration branch is a campaign built on nothing. Announce which
   branch it resolved to and whether that came from the flag or the repository
   default.
3. Cut `wayfinder/<slug>` from the up-to-date integration branch resolved in
   step 2.
4. Write the map from the template below, recording that resolved integration
   branch in the header beside the base branch, and including the agent kickoff
   prompt. The map is the record from here on: no later operation re-reads the
   flag or re-derives the branch from the state verb.
5. Create the plans you can specify now with the add-task operation, so the
   tickets land alongside the map.
6. Regenerate the docs index where the repository generates one, then commit the
   map and plans on the base branch.
7. Open the planning pull request with `$pr` while the branch holds only that
   planning commit, so it carries scaffolding and no task code. Its target is the
   integration branch the map now records: the pull-request workflow targets the
   repository default branch by design, so where the map names something else,
   retarget the pull request to that branch as soon as it exists and confirm the
   retarget landed — the same move a ticket pull request gets onto the campaign
   base. By default do not mark it draft and do not merge it — the user reviews
   every pull request, and that default holds for every run without
   `--unattended`. With `--unattended` typed on this invocation, merging the
   planning pull request is authorised once it is green. Either way it must land
   before any ticket branch is cut, so the integration branch carries the plans
   agents read.
8. Report the integration branch, base branch, map path, planning pull request,
   and kickoff prompt.

Create no issues, labels, or project-board items — that is the layer this
workflow replaces.

### 2. Add a task

1. Read the map for the next task number.
2. Write the plan to `<plans>/<slug>-NN-<task-slug>.md`, passing that exact path
   so it lands beside the map. State criteria plainly enough that `$task` can be
   handed them unedited.
3. Add a row to the map's active-tasks table: number, task slug, plan link,
   branch, status `todo`, note empty. `todo` is the only status this operation
   ever writes, because a freshly added task is by definition one that was never
   started.
4. Regenerate the docs index and report the plan path.

### 3. Execute a task

Ticket execution is an existing workflow, which owns the worktree, bootstrap,
verification, commits, cleanup, and pull request. Do not reimplement any of that
here. Which workflow is the flag's doing and nothing else's: by default `$task`,
which stops at an open, reviewed pull request; under `--unattended` `$god`, which
runs that same pipeline and adds the last mile — conflicts resolved, checks
waited on, the ticket pull request retargeted onto its merge target and merged
there.

Which tasks this operation may pick up is read straight off the status column.
Eligible: `todo` (start it), `paused` (resume it as it stands), `blocked-limit`
(resume it once the window has reset, and otherwise execute a different task
rather than waiting on the clock), and `redo` (restart it from the plan, doing
differently whatever the note names). **`rejected` is never executed here** — the
user turned that ticket down, so it needs a new decision or a rewritten plan
before it is a ticket again; report it and pick another. `in-progress` belongs to
a live run.

1. Read the plan in full.
2. Mark the task `in-progress` in the map — the only status this operation writes
   on the way in, whichever of the four eligible statuses the row carried before
   — and clear any note that status left behind.
3. Run the chosen workflow with the campaign base branch as its base and any
   forwarded flags, handing it the plan's criteria. Under `--unattended`, name
   the campaign base branch **twice** — once as `$god`'s cut point and once as
   its merge target (`--base wayfinder/<slug> --into wayfinder/<slug>`). The two
   are independent and neither implies the other; absent the merge target,
   `$god` merges into the default branch. A ticket that cannot be given that
   merge target is a stop, not a merge.
4. The pull-request step targets the default branch by design, so retarget the
   ticket pull request to `wayfinder/<slug>` as soon as it exists, and confirm
   the retarget landed. A ticket left pointing at the default branch is the one
   failure this workflow cannot absorb. Under `--unattended` that retarget
   belongs to `$god` rather than to this workflow: the merge target given in step
   3 is what `$god` retargets the pull request onto before it merges, and a
   retarget attempted from out here would arrive after the merge in any case.
   Confirm from `$god`'s own report that the ticket landed on `wayfinder/<slug>`.
5. By default never merge it — the user reviews every pull request, and that is
   the documented default rather than a limit of the operation. Under
   `--unattended` the ticket merge is authorised and the runner performs it
   against the retargeted base as part of its own run, so nothing is left to
   merge here.
6. If the ticket stops before it lands, write the status that says why. This is
   the operation that records it, and a row left on `in-progress` by a run that
   stopped is what makes dead work read as live to the next agent. The usage
   window or rate limit running out mid-run writes `blocked-limit` with a note
   naming when it resets — nothing is wrong with the work. A deliberate stop that
   is resumable as it stands writes `paused` with an empty note; that is the
   status a pause writes, and a normal event in a long campaign rather than a
   failure. A ticket the user reviewed and turned down writes `rejected` with the
   objection in one clause, and is not re-executed afterwards. Otherwise the
   ticket landed, and the complete operation records it.

### 4. Complete a task

Run after a ticket's pull request merges into the base branch.

1. Confirm the base branch actually carries the merged work.
2. Delete the plan file from version control.
3. Append a summary to the map's Completed section describing what was actually
   built rather than what the plan proposed; the deviations are the part worth
   keeping.
4. Remove the task's row from the active-tasks table. A completed task carries no
   status at all — the Completed entry replaces the row rather than joining the
   vocabulary, which is why there is no `done` among the six.
5. Regenerate the docs index and commit the map edit and the deletion together.

Re-opening a completed task is the one path that writes `redo`. When work that
already landed has to be done again differently, restore its row to the
active-tasks table with status `redo` and a note naming what must differ, and
leave its Completed entry in place as the record of what shipped the first time.
Its plan was deleted at completion, so rewrite the plan before executing: `redo`
means restart from the plan, and there has to be one to restart from.

### 5. Close

1. Confirm each completed task produced its durable docs in the repository's own
   bundle. The Completed log is scaffolding, not the deliverable.
2. Open one pull request from the base branch to the integration branch the map
   records, with `$pr`, summarizing the campaign and linking the Completed log.
   Read that branch from the map's header — do not re-derive it from the state
   verb, and do not assume the campaign integrates with the default branch. The
   pull-request workflow targets the default branch by design, so where the two
   differ, retarget and confirm it landed before merging anything. By default do
   not merge it — the user reviews it. With `--unattended` typed on this
   invocation, merging the campaign pull request is authorised once it is green.
3. After it merges, delete the map and every plan for the slug, regenerate the
   index, commit as a scaffolding-retirement change, and delete the base branch
   locally and on the remote.

## Map template

Write to `<plans>/wayfinder-<slug>.md`, carrying whatever frontmatter the
repository's docs bundle requires:

```markdown
# Wayfinder — <Human Name>

**Slug:** `<slug>`
**Integration branch:** `<resolved integration branch>` (cut from it, merged back into it; the planning and campaign pull requests target it)
**Base branch:** `wayfinder/<slug>` (cut from the integration branch above; every ticket targets it)
**Plans directory:** `<plans>`
**Started:** YYYY-MM-DD
**Goal:** <one sentence — what this campaign ships>

> Ephemeral scaffolding, deleted when the wayfinder closes. The durable output is
> the merged code and the repository's feature and spec docs.

## Active tasks

| # | Task | Plan | Branch | Status | Note |
|---|------|------|--------|--------|------|
| 01 | <task slug> | [<slug>-01-...](<slug>-01-....md) | `task/<slug>-01-...` | todo | |

<!--
Status is exactly one of these six:
  todo          — never started; nothing to resume. Pick it up.
  in-progress   — a ticket run is executing it now. Leave it alone.
  paused        — deliberately stopped, resumable as-is. Pick it back up.
  blocked-limit — the usage window ran out mid-run; nothing is wrong with the
                  work. Resume it once the window resets.
  rejected      — a human reviewed it and turned it down. Do NOT retry it; it
                  needs a new human decision or a rewritten plan.
  redo          — the work landed but must be done again differently. Restart
                  it from the plan.
Note is required for blocked-limit, rejected, and redo; empty for the rest.
-->

## Completed

<!-- newest first; one entry appended per task completion -->
```

Each completed entry names what shipped in one to three sentences, the key files,
the docs added or updated, and any follow-ups or deviations.

## Agent kickoff prompt

The map carries a plain-language, provider-neutral prompt that any agent CLI can
resume from: read the repository instructions, this workflow, and the map;
inspect live Git and worktree state; execute the next unblocked active task by
running the task workflow against its plan with the campaign base branch as the
base; retarget the resulting pull request to that base branch; and stop after
opening it. Name no model, vendor, or product-specific command in that prompt.

The prompt states which statuses are eligible in plain language rather than by
name, so any agent can act on it: a task is eligible when it was never started,
was deliberately paused, was stopped because a usage window ran out and that
window has since reset, or is marked for redoing differently. It says outright
never to re-execute a task a human rejected — report it and pick another — and
that a task already marked in progress belongs to a live run. It also tells the
agent that if it stops before the pull request is open, it must set the status to
say why, with a short note, rather than leaving the task marked in progress.

The kickoff prompt never carries `--unattended`, and its stop-after-opening line
is written as-is even for a campaign started with the flag. The prompt is pasted
into some later agent's session, which is exactly the inheritance path the flag
refuses: whoever runs it types the flag themselves or gets the reviewed default.

## Guardrails

- Never leave a ticket pull request targeting the default branch. Only the
  planning and campaign pull requests leave `wayfinder/<slug>`, and they target
  the campaign's integration branch rather than the default branch as such.
- The integration branch and `--base` are different things, and conflating them
  is the mistake this guardrail exists to stop. The integration branch is the
  campaign's: what `wayfinder/<slug>` is cut from and what the planning and
  campaign pull requests merge into. `--base` is a ticket's: forwarded verbatim
  to the ticket runner as that one ticket's cut point. Naming one never sets the
  other.
- After start, read the integration branch from the map and nowhere else — not
  from the state verb, not from the flag, not from whichever branch happens to be
  checked out. Re-deriving it is how a campaign resumed by a fresh agent quietly
  retargets itself at the default branch halfway through.
- The status column is the resuming agent's whole briefing, so keep it true. A
  task left on `in-progress` by a run that stopped reads as live work and freezes
  the next agent out of it; a stopped task never given a status reads as `todo`
  and gets silently re-executed. However a ticket run ends short, write the
  status before the run is over — `paused`, `blocked-limit`, or `rejected` — and
  never re-execute a `rejected` one without a new decision from the user. A long
  unattended campaign pausing and resuming is a normal event rather than an
  incident: `paused` and `blocked-limit` are how that is recorded, and neither
  implies anything is wrong with the work.
- Create no issues and touch no project board.
- Delete a finished task's plan rather than archiving it; an archived plan is a
  second source of truth that immediately drifts.
- Base every decision on live Git state, never a stale snapshot.
- By default merge nothing — the user reviews and merges each pull request. That
  is the documented default, not a limit of the workflow: `--unattended`, typed
  on the invocation that acts, is the one thing that authorises the planning,
  ticket, and campaign merges. Absent it, every pull request this run opens is
  left open for the user, and a run that merges without the flag typed on it has
  exceeded what it was asked to do.
- Under `--unattended`, exactly three merges are authorised and no more: the
  planning pull request at start, each ticket pull request (performed by `$god`
  into the campaign base branch it was given as its merge target), and the
  campaign pull request at close. The planning and campaign merges land on the
  integration branch the map records, which is the default branch only when the
  campaign named no other — so confirm each of those two pull requests is based
  on that branch before merging it, rather than trusting the base the
  pull-request workflow opened it with. Never merge a pull request this run did not open, never merge one whose
  checks are red, never force-push, and never reach for an administrator
  override — a campaign is exactly where one bad merge is multiplied. Issue a
  merge once and read the resulting state rather than re-issuing it: a merge
  already in progress is a state to inspect, pending required checks are a wait
  to re-issue as an auto-merge, and a stale base is a merge-in of the base branch
  followed by a single retry.
- If the request does not clearly name one of the five operations, ask one
  focused question rather than guessing.
- Issue branch-lifecycle operations — checkout, pull, remote-branch inspection,
  branch deletion — as individual shell calls, with status output and follow-up
  verification in separate read-only calls.
- A refusal of a pull-request merge or a remote-ref deletion is final: surface it
  and carry on with the rest of the work rather than re-expressing the same
  operation, which is refused for the same reason.
- Where more than one account is logged in, a GraphQL-backed write answers with a
  collaborator error when the active account does not own the remote. That is the
  wrong identity, not a permission to request: ask the repository helper which
  account the remote's owner is and select it.

## Closing turn

Every run states its outcome on the way out, and how it states it depends on how
the run was invoked. One mechanic decides all three cases: a message carrying
text and zero tool calls ends the assistant's turn and hands control back to the
user. That is what records an outcome, and it is also what strands a parent
pipeline when a nested run spends one.

Invoked directly by the user, this is the outermost run and it closes in a
text-only turn: one final message carrying text and zero tool calls, sent after
the last tool call returns rather than alongside it. Dispatched as a subagent, it
closes the same way, because its final message is a report to the parent session
rather than a turn in the parent's conversation. Invoked inline by another
workflow as a step of that invoker's own pipeline, it hands back without spending
a text-only turn: the report and the return marker go out as text in the same
message that carries the invoker's next tool call, so the turn continues into the
invoker's next step. A text-only turn there ends the whole assistant turn and
strands every step the invoker still owes.

Write the return marker exactly once, alone on the last line of the message that
hands control back, in all three cases — never weakened, deferred to a later
message, or dropped because the turn continues.

This step is never skipped and never delegated, and every exit routes through it:
the operation completed, nothing to do, a step blocked or refused, or the run
awaiting an answer. Lead with one self-contained line naming which operation ran
and what it changed — the integration branch, the base branch, and the planning
pull request on a start (saying whether the integration branch came from the flag
or the repository default), the
plan path on an add, the ticket pull request on an execute, the map entry on a
complete, the campaign pull request on a close — or what stopped the run.

A compaction boundary is a checkpoint, not an ending — a recap prompt, a
background-task notification, or a session-continuation preamble each mean the
run is still owed its turn, so answer in text alone, say where the run stands,
and restore the closing item if it did not survive. Each side of a boundary
records its own standing, because a run split across two transcripts is two runs
to the record. Every message from the user opens a task, and only a reply
carrying text and no tool call closes it, so answer a mid-run question,
correction, or recap in text before returning to tool calls. A reply to another
session is not that turn either: a message-sending call is still a tool call, so
send the reply, let it return, then close in text alone.
