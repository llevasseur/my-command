---
type: feature
title: manage
description: Orchestrate one multi-part goal across existing commands — decompose it into units, assign a branch to each, delegate every unit to its own subagent in waves that cannot collide, and synthesize one report.
tags: [command, workflow, agents]
timestamp: 2026-08-11
updated: 2026-08-11
dirty: true
---

# manage

## Summary

One goal, several separable pieces, and every piece already has a command that
knows how to do it. `manage` is the layer that decides **which** commands, on
**which** branches, in **which** order — and then gets out of the way.

It owns planning, routing, dependency ordering, batching, failure handling, and
the closing synthesis. It owns **none of the implementation**. [task](task.md)
already owns branch → worktree → implement → verify → [clean](clean.md) →
[pr](pr.md) → teardown, and [god](god.md) adds the merge last mile on top. So
`manage` **never branches, commits, opens a PR, merges, or tears down a
worktree**: doing any of it would put two owners on one branch, and the delegate
is the one holding the worktree.

**Its unit of delegation is one invocation of one existing command, and nothing
smaller.** "Have a subagent edit these three files" is not a unit — that subagent
would have no branch, no verification, and no PR, which is the whole thing `/task`
exists to provide.

Its relationship to [work](work.md) is worth stating, because the two look alike:
`work` builds from a **ledger of signed-off ideas** and its scheduling serves that
ledger. `manage` takes a **goal typed at it now** and has no ledger, no claim
protocol, and nothing to mark afterwards.

## Flags / Parameters

| Flag | Default | Meaning |
| --- | --- | --- |
| `--delegate <cmd>` / `-D` | `task` | Which command each unit is handed to: `task`, `god`, or `fb`. An `fb` unit runs on an **existing** branch named by the goal — see below. |
| `--parallel <n>` / `-p` | `3` | Units in flight at once. **Hard cap 8**; a larger value is clamped and the clamp is reported. |
| `--sequential` | off | One unit at a time regardless of independence. Overrides `--parallel`. |
| `--dry-run` / `-n` | off | Print the routing plan and spawn nothing — no task list, no subagent, no branch. Every unit's invocation, base, and forwarded flags are in the print. |
| `--mesh` | off | Opt into peer-to-peer messaging between the workers. |
| `--add <list>` / `-a` | — | Forwarded to every `task` and `god` unit, in the same shape [god](god.md) forwards it. |
| `--here` / `-h` | off | Forwarded. Also forces `--sequential` and collapses the branch plan — see below. |
| `--base <branch>` | `defaultBranch` | The **root** base of the branch plan. Reaches the units that wait on nothing; a stacked unit keeps its own base. |
| `--draft` / `-d` | off | Forwarded to `task` units. With `--delegate god` it is a **stop** — a draft cannot merge. |
| `--sub` / `-s` | off | Forwarded. `god` adds it anyway, so it is redundant there rather than dropped. |

Anything not a recognized flag is the goal. Anything `/task` recognizes and this
command does not own is forwarded rather than reinterpreted — read
[task](task.md)'s own flag list rather than this table for what each one means.

**`--delegate task` is the default for a specific reason.** `/task` stops at an
open PR and leaves a human the merge; `/god` merges without asking. This command
**multiplies whatever it delegates**, and eight unattended merges out of one
invocation is a different risk from one — so `--delegate god` has to be typed.

**`fb` is the one delegate that cannot cut a branch.** [fb](fb.md) applies
feedback to the branch it is already on, or with `--target <branch>` to one that
**already exists**. So an `fb` unit's branch is named by the goal rather than by
the plan, and the unit is dispatched as `/fb --target <that existing branch>`.
Handing `/fb` a `<type>/<kebab-summary>` this run invented gets either a branch
that does not exist or — with no target at all — the orchestrator's own branch,
which is the collision the wave batching exists to prevent. A goal that cannot
name an existing branch for an `fb` unit is a **stop**, not a new branch. `/fb`
documents `--target` alone, so **no forwarded flag survives an `fb` unit** — each
one is dropped and reported as dropped in the plan.

### Forwarded flags

A forwarded flag is typed **once, on the `/manage` invocation**, and lands in every
unit's own run rather than in this one. That is what separates it from a constraint
written into the goal: the goal is prose the planner reads and can honour loosely,
while a forwarded flag is composed into the unit's invocation at dispatch and
printed in the plan before anything spawns. **A behaviour `/task` already has a
flag for is asked for with that flag, not described in the goal text** — a
description leaves nothing to check the plan against.

**A delegate is never handed a flag it does not accept.** Each forwarded flag is
compared against the resolved delegate's own Flags section, and one that delegate
does not document is **dropped from that unit's invocation and reported as dropped**
— per unit, per flag, naming the delegate. It is never passed anyway (a delegate
does not error on an unknown flag, it reads it as criteria, so `-d` becomes a word
in the request) and never re-expressed as a sentence in the criteria (which
reintroduces the prose constraint the flag replaced, hidden inside text that reads
like scope). `task` drops nothing; `god` drops nothing but treats `--sub` as
redundant and turns `--draft` into a **stop before planning**, since a draft cannot
merge and dispatching it would be one stop per unit; `fb` drops the whole set.

**`--base <branch>` sets the root of the branch plan, and only the root.** It
replaces the `defaultBranch` that unit branches are otherwise named against, and it
reaches the units at the **root of the dependency graph** — the ones waiting on
nothing. **A stacked unit keeps the base the wave batching gave it: the branch of
the unit it depends on, never `main` and never this root base.** Cutting a stacked
unit from the root instead would leave it without the interface it consumes and buy
a conflict at merge time, which is the failure stacking exists to avoid. So a root
base moves where the plan starts without collapsing the per-unit bases, and the
plan prints every unit's base so a root one and an inherited one are told apart
before anything spawns.

**`--here` forces `--sequential` and collapses the branch plan.** What makes
concurrency safe at all is that `/task` cuts a fresh worktree per run, so two units
are two working trees; `--here` removes exactly that. Units go out one at a time
regardless of independence, no per-unit branch is planned, and the run yields **one**
branch and one PR rather than one per unit — stated in the plan and in the report.

## Behavior

**Planning decides four facts per unit, before anything is spawned:** the command
invocation with its surviving forwarded flags, the branch and the base it is cut
from, the files it touches, and what it depends on.

**Every parallel unit gets its own branch and its own worktree** — a new one for
`task` and `god`, an existing one for `fb`. Two `/task` runs
sharing a branch is a corrupted run — the second one's commits land on top of the
first one's half-finished tree and neither PR describes what it contains. The plan
therefore assigns branch names **up front** and passes them into the delegates,
rather than letting two delegates independently derive the same
`<type>/<kebab-summary>` from similar criteria.

**Three to eight units.** Below three there is nothing to orchestrate and the goal
should go straight to the delegate. Above eight the plan stops being holdable — the
failure is not the spawning, it is that nothing left in the run can still say what
the whole thing was for — so a larger decomposition is planned in full and
dispatched in **successive waves**.

**Two things, and only two, make one unit wait for another:**

- **File-scope overlap.** Sequenced **however independent the units look**, because
  two branches editing one file buy a conflict per unit, paid later by a human at
  merge time. This is why "what files does this unit touch" is a planning field
  rather than a note. A clean textual merge is never evidence of independence.
- **A stated dependency** — unit B needs the interface, migration, or command unit
  A introduces.

Everything else goes out **together**, as multiple `Agent` calls in a single
assistant turn. **Dispatching independent units one after another is the specific
failure this command exists to prevent**: it is the shape a run falls into by
default, because each unit reads as the natural next thing to do, and it turns a
wave into a queue while reporting success either way.

Every unit in a wave carries an explicit **lane** — the paths it owns and the paths
it must not touch — because a subagent cannot see its siblings' plans.

### Star topology, not mesh

Workers talk to the orchestrator and to nothing else. Peer messaging between
agents costs roughly **2.4x–2.7x** the tokens of the equivalent Task-tool fan-out
— about **150K vs 400K** for a three-agent review, **500K vs 1.2M** for an
eight-agent feature — because every worker pays to read every other worker's
traffic. That price earns itself only when workers must negotiate a cross-cutting
concern mid-flight, and `manage`'s workers have nothing to negotiate: each runs a
self-contained command on its own branch in its own worktree, and the concern they
would negotiate was already resolved into lanes at planning time. `--mesh` is the
named escape hatch for the case where a human knows better.

### Delegate prompts stay minimal

Each delegate is a command already self-contained through its own file, which the
subagent loads on invocation. The prompt passes the invocation, the unit's
criteria, its branch, and its lane — and stops. Restating the whole plan into every
subagent prompt puts a second set of instructions in front of the command's own,
competes with them for attention, and makes completion **less** reliable.

### State lives in the harness task list

One `TaskCreate` per unit, then `TaskUpdate --addBlockedBy` to link dependencies
**after** every task exists, since a link needs both ids. The task list is live
session state that survives a compaction; the prompt is not — so once the run is
summarized, that list is the only surviving record of what was dispatched and what
is still owed. Same reasoning as the closing-turn anchor, reusing the same store:
`manage` builds **no second task store, no progress file, and no status
dashboard**.

### Error isolation, and a bounded replan

A failed unit must not cancel its siblings or end the run. The failure is recorded
**with its cause**; **at most one retry** is spent, and only when the cause is
something a retry can change; everything else carries forward. **Four successes and
one stated failure is a good outcome; dying on the first failure is not** — the
siblings' work is already done and gets thrown away for nothing.

**The replanning loop is bounded at one round.** A unit whose retry fails is
reported as failed and the run moves on: not decomposed again, not rerouted to
another delegate, not replanned around. An orchestrator that replans until
everything succeeds does not terminate, and the second replan is where a run stops
being able to say what it did.

### Synthesis is mandatory

**A subagent's report is never visible to the user and is never the run's
outcome** — and that matters more here than anywhere, because the whole run is
subagents. The closing turn names, per unit: the command that ran with the forwarded
flags it carried, the branch and the base it was cut from when that was not the
run's root base, the PR number or URL, and the outcome. Then one line for the run:
how many units, how many landed, what is left for a human — and **every forwarded
flag that was dropped, with the units it was dropped for**, since a flag typed on
the invocation and silently missing from a unit's run is indistinguishable, in a
report of outcomes alone, from one that was honoured.

**The branches are never batch-merged onto `main`.** If the run was meant to land
as one thing, the unit branches merge onto an **integration branch**, get verified
there, and one PR opens from it.

## Related

- Command source: `src/commands/manage.md`
- Delegates to: [task](task.md) by default, or [god](god.md) / [fb](fb.md) with
  `--delegate`
- Compare: [work](work.md), which schedules the same way but builds from the
  signed-off ideas ledger rather than from a goal typed at it
- Spec: [Adding a command](../specs/adding-a-command.md)
