---
name: manage
description: Orchestrate one multi-part goal across existing commands — decompose it into units of work, assign a branch to each, and delegate every unit to its own subagent in waves that cannot collide, then synthesize one report.
---

# Orchestrate a Multi-Part Goal

Parse `--delegate task|god|fb`, `--parallel <n>`, `--sequential`, `--dry-run`, `--mesh`, added-command pass-through, and the goal text.

Take one multi-part goal, decompose it into units of work, and hand each unit to an **existing** workflow running in its own subagent — in parallel where the units are independent, in sequence where they are not.

This workflow owns planning, routing, dependency ordering, batching, failure handling, and the final synthesis. It owns **none** of the implementation. `$task` already owns branch → worktree → implement → verify → clean → pull request → teardown, and `$god` adds the merge last mile. So this workflow **never branches, commits, opens a pull request, merges, or tears down a worktree itself**: doing any of it here means two owners for one branch, and the delegate is the one holding the worktree. **The unit of delegation is one invocation of one existing workflow, and nothing smaller** — never "have a subagent edit these three files".

## Flags

- `--delegate <workflow>` — `task` (default), `god`, or `fb`. **`task` is the default because it stops at an open pull request and leaves a human the merge.** This workflow multiplies whatever it delegates, so eight unattended merges out of one invocation is a different risk from one, and `--delegate god` must be typed rather than inherited. **`fb` is the one delegate that cannot cut a branch**: the feedback workflow applies to the branch it is already on, or to a branch that **already exists** when one is named as its target. So an `fb` unit's branch comes from the goal rather than the plan, and is passed as that workflow's target — handing it a branch name this run invented gets either a branch that does not exist or the orchestrator's own branch, which is the collision the batching exists to prevent. A goal that cannot name an existing branch for an `fb` unit is a stop, not a new branch.
- `--parallel <n>` — units in flight at once. Default three, hard cap eight; a larger value is clamped and the clamp is reported.
- `--sequential` — dispatch one unit at a time regardless of independence.
- `--dry-run` — print the routing plan and spawn nothing: no task list, no subagent, no branch.
- `--mesh` — opt into peer-to-peer messaging between workers. Off by default.
- Added-command entries are forwarded to every `task` and `god` unit and are not interpreted here. The feedback workflow accepts no added-command list, so an `fb` unit is dispatched without one and the omission is reported in the plan.
- Anything not a recognized flag is part of the goal.

## Steps

1. **Settle the preconditions without asking a question you can answer yourself.** Read live repository state in one call for the current branch, the default branch, and the checkout root; never a session's startup snapshot. Resolve the named delegate against what is actually installed on this device — an unresolvable delegate is a stop, not a silent fallback. Then confirm the goal is genuinely multi-part: **a goal that decomposes into fewer than three units is not worth an orchestrator**, so say so and hand it to the delegate as one run instead of wrapping a single run in a planning layer. Reserve a clarifying question for a true branch point — an irreversible action the goal does not authorize, or a requirement genuinely missing rather than merely unstated.

2. **Decompose the goal, recording four facts per unit, all decided before anything is spawned.** The **workflow invocation** it runs, with its flags and criteria. The **branch** it runs on, in the task workflow's own type-and-summary shape — except an `fb` unit, which takes an existing branch named by the goal, because the feedback workflow applies onto work that is already there — every parallel unit gets its own branch and its own worktree, because two implementation runs sharing a branch is a corrupted run where the second one's commits land on the first one's half-finished tree and neither pull request describes what it contains; the plan assigns the names up front rather than letting two delegates derive the same name from similar criteria. The **files it touches**, as concretely as the goal allows, which is the input to the batching rather than documentation. And **what it depends on**, if anything.

   **Three to eight units.** Below three there is nothing to orchestrate. Above eight the plan stops being holdable — the failure is not the spawning but that nothing left in the run can still say what the whole thing was for — so a larger decomposition is planned in full and dispatched in successive waves, never fanned out at once.

3. **Batch the units into waves.** Exactly two things make one unit wait for another. **File-scope overlap**: units whose scopes intersect are sequenced however independent they look, because two branches editing one file buy a conflict per unit, paid later by a human at merge time — which is why "what files does this unit touch" is part of planning. And **a stated dependency**, where one unit needs the interface, migration, or surface another introduces. A clean textual merge is never evidence of independence. Everything else is independent and goes out together.

   Give every unit in a wave an explicit **lane**: the paths it owns and the paths it must not touch. The lane goes in that unit's prompt, because a subagent cannot see its siblings' plans.

   **Record the dependency graph in the harness task list, not in a file** — one task per unit, then link the dependencies once every task exists, since a link needs both identifiers. The task list is live session state that a compaction carries forward and this prompt is not, so after a summary it is the only surviving record of what was dispatched and what is still owed. That is the same reasoning behind anchoring the closing turn, and it is why this workflow builds **no second task store, no progress file, and no status dashboard**. A dry run prints the plan and stops here, before any task is created.

4. **Dispatch each wave as multiple subagent invocations issued together**, one subagent per unit, in a star topology where every worker talks to this session and to nothing else. **Do not wire the workers to each other.** Peer messaging between agents costs roughly 2.4 to 2.7 times the tokens of the equivalent fan-out — about 150K versus 400K for a three-agent review, and 500K versus 1.2M for an eight-agent feature — because every worker pays to read every other worker's traffic. That price is worth paying only when workers must negotiate a cross-cutting concern mid-flight, and here they have nothing to negotiate: each runs a self-contained workflow on its own branch in its own worktree, and the concern they would negotiate was already resolved into lanes. `--mesh` is the escape hatch for the case where a human knows better; it stays off unless typed.

   **Keep each delegate prompt minimal.** Every delegate is a workflow already self-contained through its own file, which the subagent loads when it is invoked. Pass the invocation of the **resolved** delegate — not the default one — with that unit's criteria, its branch, and its lane, then stop — restating the whole plan into every subagent prompt puts a second set of instructions in front of the workflow's own, competes with them for attention, and makes completion less reliable rather than more.

   **Dispatching independent units one after another is the specific failure this workflow exists to prevent.** It is the shape a run falls into by default, because each unit reads as the natural next thing to do, and it turns a wave into a queue while reporting success either way.

5. **Collect the whole wave, then isolate the failures.** One failed unit must not cancel its siblings or end the run. Record the failure with its **cause**, not just its name; spend **at most one retry**, and only when the cause is something a retry can change rather than criteria the repository contradicts; carry everything else forward. Four successes and one stated failure is a good outcome, and dying on the first failure is not — the siblings' work is already done and is thrown away for nothing. **The replanning loop is bounded at one round**: a unit whose retry fails is reported as failed and the run moves on, never decomposed again, rerouted to another delegate, or replanned around. An orchestrator that replans until everything succeeds does not terminate, and the second replan is where a run stops being able to say what it did.

6. **Synthesize, because raw subagent reports are not the deliverable.** A subagent's report is never visible to the user and is never the run's outcome. End with **one** summary naming, per unit: the workflow that ran, the branch, the pull request number or URL, and the outcome — shipped, merged, failed with its cause, or never dispatched. Then one line for the run as a whole: how many units, how many landed, and what is left for a human. **Never batch-merge the resulting branches onto the default branch**; if the run was meant to land as one thing, merge the unit branches onto an integration branch, verify there, and open one pull request from it.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. **A subagent's
report is never that turn**, which matters more here than anywhere: the whole run
is subagents, and the outcome belongs to the session that dispatched them. Every
ending owes that turn, including a run that stops early, is blocked or refused, or
hands work back to an invoking workflow.

Which turn that is depends on how this run was invoked, and there are exactly
three cases. Invoked directly by the user, this is the outermost run and it
closes in a text-only turn as above. Invoked inline by another command in the
same session, as a step of that invoker's own pipeline, it hands back without
spending a text-only turn: the report and the return marker go out as text in
the same message that carries the invoker's next tool call, so the turn
continues into the invoker's next step instead of returning control to the user.
A text-only turn there ends the whole assistant turn and strands every step the
invoker still owes, which is how a live pipeline comes to read as abandoned.
Dispatched as a subagent, it closes in its own text-only turn like an outermost
run, because its final message is a report to the parent session rather than a
turn in the parent's conversation. The return marker is written exactly once in
all three cases, alone on the last line of the message that hands control back —
never weakened, deferred to a later message, or dropped because the turn
continues.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. Resolve
it in the same tool-call turn as the run's last piece of real work, so the list
is already clean when that turn returns and the only thing left to do is speak.
Never leave marking it as a call of its own after the work ends: a run whose last
scheduled action is a bookkeeping tool call ends on that call — the mark lands
every time, and the message meant to follow it never arrives. A
compaction boundary is a checkpoint, not an ending — a recap prompt, a
background-task notification, or a session-continuation preamble each mean the
run is still owed its turn, so answer in text alone, say where the run stands and
which units are still in flight, and restore the todo item if it did not survive.
Each side of a boundary records its own standing, because a run split across two
transcripts is two runs to the record. Every message from the user opens a task in
the same transcript, and only a reply carrying text and no tool call closes it, so
answer a mid-run question, correction, or recap in text before returning to tool
calls. A reply to another session is not that turn either: sending a message is a
tool call, so send the reply, let it return, then close in text alone.
