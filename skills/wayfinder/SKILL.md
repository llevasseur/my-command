---
name: wayfinder
description: Run a named campaign of related work tracked as markdown plans in the repository rather than on an issue tracker — one base branch, a map of active tasks, one task run per ticket, and a summary appended as each lands.
---

# Wayfinder

A wayfinder is a named campaign of related work — several tasks that ship
together — tracked entirely in markdown inside the repository. It plans and
executes a multi-task effort with no issue tracker and no project board: fewer
layers to keep in sync, and everything reviewable in a diff.

Parse `--here`, `--base <branch>`, `--draft`, and `--add <command prompt,...>`;
the remaining text names the operation and its subject. Those flags apply only
when this run executes a ticket, because that operation is a `$task` invocation
and forwards them verbatim. The charting operations ignore them.

Announce which of the five operations you picked before acting: start, add task,
execute, complete task, or close.

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

- One wayfinder is one base branch `wayfinder/<slug>`, cut from the repository's
  default branch. Read that branch from the repository helper's state verb;
  never hardcode `main`.
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

Exactly two pull requests legitimately target the default branch: the planning
pull request at start, and the campaign pull request at close.

## Discovery

Whenever an operation looks at more than one file — the complete and close
operations read the map and every plan beside it — enumerate the paths from one
listing first, then read the whole enumeration in one turn. Never loop one read
per plan, and never re-read a file already in this session's context; locate the
symbol you now want with a single search and pull only the range you still need.
After any compaction boundary or hand-off, re-read the files the next edit pass
will write before editing, because a continuation summary does not satisfy a
file-editing tool's read-before-write precondition.

## Operations

### 1. Start

1. Pick a short kebab-case slug and confirm it if the request is ambiguous.
2. Cut `wayfinder/<slug>` from the up-to-date default branch reported by the
   repository helper.
3. Write the map from the template below, including the agent kickoff prompt.
4. Create the plans you can specify now with the add-task operation, so the
   tickets land alongside the map.
5. Regenerate the docs index where the repository generates one, then commit the
   map and plans on the base branch.
6. Open the planning pull request with `$pr` while the branch holds only that
   planning commit, so it carries scaffolding and no task code. Do not mark it
   draft and do not merge it. Let it merge before any ticket branch is cut.
7. Report the base branch, map path, planning pull request, and kickoff prompt.

Create no issues, labels, or project-board items — that is the layer this
workflow replaces.

### 2. Add a task

1. Read the map for the next task number.
2. Write the plan to `<plans>/<slug>-NN-<task-slug>.md`, passing that exact path
   so it lands beside the map. State criteria plainly enough that `$task` can be
   handed them unedited.
3. Add a row to the map's active-tasks table: number, task slug, plan link,
   branch, status `todo`.
4. Regenerate the docs index and report the plan path.

### 3. Execute a task

Ticket execution is `$task`, which owns the worktree, bootstrap, verification,
commits, cleanup, and pull request. Do not reimplement any of that here.

1. Read the plan in full.
2. Mark the task in progress in the map.
3. Run `$task` with the campaign base branch as its base and any forwarded
   flags, handing it the plan's criteria.
4. The pull-request step targets the default branch by design, so retarget the
   ticket pull request to `wayfinder/<slug>` as soon as it exists, and confirm
   the retarget landed. A ticket left pointing at the default branch is the one
   failure this workflow cannot absorb.
5. Never merge it — the user reviews every pull request.

### 4. Complete a task

Run after a ticket's pull request merges into the base branch.

1. Confirm the base branch actually carries the merged work.
2. Delete the plan file from version control.
3. Append a summary to the map's Completed section describing what was actually
   built rather than what the plan proposed; the deviations are the part worth
   keeping.
4. Remove the task's row from the active-tasks table.
5. Regenerate the docs index and commit the map edit and the deletion together.

### 5. Close

1. Confirm each completed task produced its durable docs in the repository's own
   bundle. The Completed log is scaffolding, not the deliverable.
2. Open one pull request from the base branch to the default branch with `$pr`,
   summarizing the campaign and linking the Completed log. Do not merge it.
3. After it merges, delete the map and every plan for the slug, regenerate the
   index, commit as a scaffolding-retirement change, and delete the base branch
   locally and on the remote.

## Map template

Write to `<plans>/wayfinder-<slug>.md`, carrying whatever frontmatter the
repository's docs bundle requires:

```markdown
# Wayfinder — <Human Name>

**Slug:** `<slug>`
**Base branch:** `wayfinder/<slug>` (cut from the default branch; every ticket targets it)
**Plans directory:** `<plans>`
**Started:** YYYY-MM-DD
**Goal:** <one sentence — what this campaign ships>

> Ephemeral scaffolding, deleted when the wayfinder closes. The durable output is
> the merged code and the repository's feature and spec docs.

## Active tasks

| # | Task | Plan | Branch | Status |
|---|------|------|--------|--------|
| 01 | <task slug> | [<slug>-01-...](<slug>-01-....md) | `task/<slug>-01-...` | todo |

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

## Guardrails

- Never leave a ticket pull request targeting the default branch.
- Create no issues and touch no project board.
- Delete a finished task's plan rather than archiving it; an archived plan is a
  second source of truth that immediately drifts.
- Base every decision on live Git state, never a stale snapshot.
- Never merge a pull request — the user reviews each one.
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
and what it changed — the base branch and planning pull request on a start, the
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
