---
name: dev
description: Take one complex idea all the way to merged, unattended — grill it against the repository's specs and decision records, record every decision this workflow made as a real decision record, chart it as a campaign, build the tickets in waves, and land the campaign pull request.
---

# Dev

Take **one complex idea** and drive it to merged into the default branch with no
human in the loop. This workflow composes the existing ones — the campaign
workflow charts and tracks, the orchestrator schedules, the merge-through
workflow merges, the task workflow implements — and reimplements none of them. It
cuts no branch, writes no ticket code, opens no pull request itself, and issues no
merge of its own. Every one of those already has an owner, and a second owner for
any of them corrupts the run.

What it does own is the part nothing else covers: **the decisions it makes on the
human's behalf, and the record of them.** An unattended run of this size makes
calls a human would otherwise make, and a call made in passing and never written
down is the failure this workflow exists to prevent.

Parse leading flags off the front; the rest is the idea.

- `--slug <s>` — the campaign slug handed to the campaign workflow's start
  operation. Absent it, that workflow picks one.
- `--parallel <n>` / `-p <n>` — cap how many tickets are in flight at once,
  forwarded to the orchestrator, whose hard cap is **8**. A larger value is
  clamped there and the clamp is reported.
- `--sequential` — one ticket at a time regardless of independence.
- `--rounds <n>` — override the grill's 12-round cap.
- `--dry-run` / `-n` — grill, print the campaign this run would chart, and stop.
  No decision record is written, no branch is cut, no pull request is opened, and
  nothing is dispatched.
- `--no-grill` — skip the grill entirely.
- `--resume <slug>` — resume the surviving campaign named by that slug.

**Resume is always explicit.** Handing this workflow an idea **always** starts a
new campaign. It never scans the plans directory for a map whose goal resembles
the idea, and never infers that an idea is a continuation of something already in
flight. An inferred resume silently appends tickets to a campaign the human never
named, and there is no human in this run to catch it.

Before the first tool call, record this run as a task list whose **last item is
the closing turn**, kept as its own item and left open until nothing else remains.
A compaction carries that list forward; it does not carry these instructions, so
that item is the only surviving record that the run owes an outcome. Resolve it in
the same tool-call turn as the run's last piece of real work, never as a
bookkeeping call after it.

Open each numbered step by naming it in prose as you enter it, stating the number
written in the step's own heading rather than a count of steps already finished,
so the record of the run anchors the step it entered.

## 1. Settle the run

**Never ask the user a question — this workflow runs unattended end to end.**
Where a decision is missing, it is decided and recorded (step 3), not deferred.
Where a precondition is genuinely unmet, stop and say what is missing.

1. Read live repository state from the repository helper: current branch, default
   branch, root, and whether this is a worktree. **The default branch comes from
   that call**; never hardcode `main`.
2. Resolve every workflow this run composes — campaign, orchestrator,
   merge-through, pull request — from what is actually installed in this session,
   never from a name looking plausible. An unresolvable one is a stop.
3. Under `--resume`, read the surviving map for that slug **before deciding
   anything** and jump to step 6. The map, not memory, says which tickets are done.
4. Confirm the idea is genuinely complex. An idea charting into fewer than three
   tickets is not worth this pipeline — say so and name the single task or
   merge-through run that does the job.

## 2. Grill the idea

Skipped entirely under `--no-grill`.

Whenever a phase looks at more than one file, enumerate the paths first and read
the whole enumeration in one turn. Never loop one read per file, and never re-read
a file already in this session's context. That applies to the grill's own reading:
the specs index, the decision-record index, and every document an answer is
grounded in are enumerated from those two indexes and read together, not one file
per round.

**Spawn exactly one griller and keep it alive for the whole grill.**

- The first round spawns one **read-only adversarial griller** as a subagent,
  handed the idea, the repository's specs index, and its decision-record index.
- **Every round after that is a message to that same agent**, never a fresh spawn.
  A fresh griller re-derives the whole repository context every round, so the
  context is paid for once per round instead of once per grill, and the questions
  restart from a reading already answered.
- Sending a message to a live agent returns as soon as the send is accepted; the
  griller's reply arrives afterwards as a notification, not as the send's return
  value. A round is therefore: send, let the call return, wait for the reply, then
  answer. Do not read the acknowledgement as the answer.

**The griller asks one question at a time**, mirroring the grilling skill, which
is explicit that multiple questions at once are bewildering. The reason is sharper
than politeness: batching questions lets a weak answer hide among strong ones, and
the weak answer is exactly the one that becomes an unrecorded decision. Say so in
the griller's own prompt and hold it to one question per round.

**Answer every question, and ground every answer in this repository.** An answer
cites the spec or decision record it comes from **by path**, and quotes or
paraphrases what that document actually says. A fact the repository already holds
is looked up rather than guessed at or asked about.

**The grill is one pass, on the idea only** — not on the decomposition the idea
later charts into, not on a ticket's implementation, and not on the plans the
campaign workflow writes. There is no second grill of the resulting tickets.

It ends at the first of two things: the griller declares no open questions, or 12
rounds have run. `--rounds <n>` replaces the 12.

## 3. Record every decision this run made

This is the central requirement of the workflow, not a bookkeeping tail.

**An answer this run could not ground in an existing spec or decision record is a
decision this run made itself.** That is the whole test. Grounded in a document,
the repository decided it; grounded in judgement, this workflow did — in a run
with no human in it.

**Record it immediately as a real decision record in the repository's decision
directory, committed alongside the work that depends on it — never only in the
campaign map.** The map is ephemeral scaffolding that the campaign workflow
deletes when the campaign closes, so a decision recorded only there is deleted at
exactly the moment the code depending on it lands.

Each such record carries frontmatter naming the workflow that decided it, a
ratified flag set false, the campaign slug, and the grill round it came from — and
a `needs-human` flag set true where it applies:

```yaml
decided-by: /dev
ratified: false
wayfinder: <slug>
grill-round: <n>
needs-human: true
```

- Its **Status** section states plainly that the decision was proposed by this
  workflow and has **not** been ratified by a human.
- Its **Context** section quotes the griller's question **verbatim**, so the
  reader sees the question that forced the call rather than a summary of it.
- `needs-human: true` marks a decision that also looks like a human's call to make
  — a product choice, a naming or interface commitment, anything irreversible — as
  opposed to an implementation detail this run was right to settle. When in doubt,
  mark it: an over-marked decision costs a line in a pull-request body, an
  under-marked one ships a product call nobody chose.

**This workflow never blocks and never asks the user a question.** It decides,
marks the record, and carries on. **The campaign pull-request body then leads with
the list of `needs-human` decisions** (step 7), so the human's review is where
those calls actually get made.

**No tooling change is needed for these keys, and they are queryable.** The
repository's decision record on the `dirty` flag already established that the docs
tool validates frontmatter keys beyond its core set and that its find verb matches
arbitrary key-value pairs, with an unset key matching nothing rather than erroring.
So listing everything this run decided, or narrowing to the calls a human still
owes, is a query against keys that already work.

The prose in those records follows the repository's density vocabulary: one
instruction per sentence, one term per concept, the warning before the step it
guards, active voice and imperative for an action, literal over idiomatic wording,
at most three nouns in a row, explicit conjunction scope, and uppercase
obligation words where the obligation is the point.

## 4. Chart the campaign

**Invoke the campaign workflow's start operation directly — not through the
orchestrator.** The orchestrator plans a branch name per unit, and the campaign
map already owns those names. Routing charting through it would give one campaign
two branch-naming authorities.

Start writes the campaign map and its task plans and opens the **planning pull
request** through the pull-request workflow. That planning pull request is then
merged to the default branch by the merge-through workflow, given the default
branch as its **merge target**. Merge target and cut point are independent
parameters and neither implies the other, so the merge target is named explicitly.
The planning pull request must land before any ticket branch is cut, so the
default branch carries the plans the ticket runs read.

Under `--dry-run`, print the charted campaign and stop here — before the map is
written, before the branch is cut, before any decision record from step 3 is
committed.

## 5. Build the tickets

**Hand the orchestrator the ticket set and nothing else.** Not the idea, not the
grill, not the decomposition — the campaign workflow already decomposed, and the
map owns the branch names. The orchestrator's job here is scheduling: lanes,
waves, the concurrency cap, and collecting the results.

**One unit per ticket, and each unit is one invocation of the campaign workflow's
execute operation carrying its unattended flag.** That flag is typed into every
unit's invocation because it is never inherited — not from this workflow, not from
the map, not from the campaign's start operation. Typing it is what routes ticket
execution to the merge-through workflow and authorises the ticket merge.

Do not type a delegate, a cut point, or a merge target on the orchestrator's own
invocation. Each ticket lands on the campaign base branch because the campaign
workflow passes that branch through itself — **twice**, once as the merge-through
run's cut point and once as its merge target. A ticket that cannot be given a
merge target is a stop, not a merge into the default branch.

**Waves are the default.** Run as many tickets in parallel as the **file-scope
lanes** allow, bounded by the orchestrator's hard cap of 8. Two tickets editing
one file on a shared base branch is a conflict this run would pay unattended, with
no human at the merge — which is why the lanes are the bound rather than the
ticket count. `--sequential` is the escape hatch; `--parallel <n>` caps concurrency
below the lanes. Both forward to the orchestrator untouched.

A campaign of fewer than three tickets is executed one ticket at a time with no
orchestrator in the middle: the orchestrator documents that a goal decomposing
into fewer than three units is not worth an orchestrator.

**Then run the campaign workflow's complete operation for each landed ticket**,
one invocation per ticket, after its pull request has merged into the campaign
base. That deletes the ticket's plan, appends what was *actually built* to the
map's completed log, and drops its active-tasks row. A ticket that merged but was
never completed leaves the map claiming work already done.

## 6. Failure handling, bounded at one round

The orchestrator already spends at most one retry on a failed unit. When that
retry also fails, this workflow spends **exactly one additional round** on that
ticket: re-grill it with the same long-lived griller, carrying the ticket and the
cause of the failure; re-plan it through the campaign workflow; re-dispatch it
once.

**One round, and no more.** The orchestrator documents why: an orchestrator that
re-plans until everything succeeds does not terminate, and the second re-plan is
where a run stops being able to say what it did.

**If that round also fails, fall back.** The campaign neither vanishes nor merges:

- The campaign workflow's **close operation still runs**, so there is a campaign
  pull request for a human to review.
- **Do not merge it** to the default branch.
- **Do not retire the campaign scaffolding.** The map and the failed ticket's plan
  are kept alive — deleting them is what makes the campaign unresumable.
- **Report** which ticket failed, its cause, both rounds spent, the campaign pull
  request, and the resume invocation as the way back in.

`--resume <slug>` then reads that surviving map, **skips the tickets already
recorded complete**, re-dispatches the outstanding ones through step 5, and closes
through step 7. It re-grills nothing and writes no new campaign.

## 7. Land the campaign

The campaign workflow's close operation opens the **campaign pull request**
through the pull-request workflow, from the campaign base branch to the default
branch, and the merge-through workflow merges it with the default branch named as
its merge target.

**The campaign pull-request body leads with the `needs-human` decisions.** Before
the merge, read the body that was written and confirm the list from step 3 sits at
the top of it — every record carrying that flag, each as its path and its one-line
decision, obtained by querying the docs bundle for that key. If the body does not
lead with it, edit the body so it does, then merge. A human's review of this run is
the only place those calls get made, and a list buried under a change summary is
not a review.

Merging is where this pipeline's failed shell calls concentrate, and almost every
one is a rejected merge re-issued verbatim. Issue a merge **once** and read the
resulting state rather than re-sending the same call: a merge already in progress
is a state to inspect, not a call to repeat; pending required checks are a wait, so
re-issue the identical command as an auto-merge and record the pull request as
queued; a stale base is a merge-in of the base branch followed by a single retry.
Never reach for an administrator override, a raw API call standing in for the
merge, or a re-run under a different token. Never merge a red pull request and
never force-push. Delete a merged branch as its own step rather than as a flag on
the merge, and address a worktree by passing its path as a flag rather than by
changing directory into it. A refusal that comes from the harness rather than from
the forge is final: surface it and carry on with the rest of the run.

Then let the campaign workflow retire its own scaffolding — the map and every plan
— as its close operation already documents. This workflow deletes none of it by
hand.

## Nesting

This workflow, the orchestrator, the campaign workflow, the merge-through
workflow, the task workflow, and the cleanup, review, and pull-request workflows
under it are **six levels of nesting**, and the closing-turn contract holds at
every level. A nested run that spends a text-only turn ends the whole assistant
turn and strands every step its invoker still owes — a recorded failure in this
repository, not a hypothetical. Being deep in a stack changes nothing about which
case applies; each level tells its own case apart from how it was invoked.

A subagent can itself spawn a subagent and then continue that subagent with a
message, which is what makes the long-lived griller work when this workflow is
itself running as a subagent. That was verified as an experiment rather than
assumed.

## Guardrails

- **This workflow implements nothing.** No branch, no commit, no pull request, no
  merge, no worktree teardown, no plan file written by hand.
- Never batch-merge the ticket branches onto the default branch. The campaign base
  branch **is** the integration branch, and the campaign pull request is the one
  pull request off it.
- **A decision made and not recorded is this workflow's real failure mode**, more
  than a failed ticket is. A failed ticket is visible in the report; an unrecorded
  decision is invisible until someone hits it.
- Issue branch-lifecycle operations — checkout, pull, remote-branch inspection,
  branch deletion — as individual shell calls, with status output and follow-up
  verification in separate read-only calls.

## Closing turn

Every run states its outcome on the way out, and how it states it depends on how
the run was invoked. One mechanic decides all three cases: a message carrying text
and zero tool calls ends the assistant's turn and hands control back to the user.
That is what records an outcome, and it is also what strands an invoking pipeline
when a nested run spends one.

Invoked directly by the user, this is the outermost run and it closes in a
text-only turn: one final message carrying text and zero tool calls, sent after
the last tool call returns rather than alongside it. Dispatched as a subagent, it
closes the same way, because its final message is a report to the dispatching
session rather than a turn in that session's conversation. Invoked inline by
another workflow as a step of that invoker's own pipeline, it **hands back without
spending a text-only turn**: the report and the return marker go out as text in the
same message that carries the invoker's next tool call, so the turn continues into
the invoker's next step.

A subagent's report is never the dispatching run's turn — after the griller's
reply arrives and after the orchestrator returns, this run still owes a closing
message of its own. A reply sent to another session is not that turn either: a
message-sending call is still a tool call, so send the reply, let it return, then
close in text alone. Write the return marker exactly once, alone on the last line
of the message that hands control back, in all three cases.

Every exit routes here — merged, left open for review, or stopped before charting.
Lead with one self-contained line naming which of those happened, then the slug,
the ticket outcomes, the decision records this run wrote with the `needs-human`
ones named first, and, on a fallback, the resume invocation as the way back in.

A compaction boundary is a checkpoint, not an ending — a recap prompt, a
background-task notification, or a session-continuation preamble each mean the run
is still owed its turn, so answer in text alone, say where the run stands, and
restore the closing item if it did not survive. Each side of a boundary records its
own standing. Every message from the user opens a task, and only a reply carrying
text and no tool call closes it, so answer a mid-run question, correction, or recap
in text before returning to tool calls.
