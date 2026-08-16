---
description: Orchestrate one multi-part goal across existing commands — decompose it into units, assign a branch to each, and delegate every unit to its own subagent in waves that cannot collide
argument-hint: "[--delegate|-D task|god|fb|work|work:god] [--parallel|-p <n>] [--sequential] [--dry-run|-n] [--mesh] [--here|-h] [--base <branch>] [--into <branch>] [--draft|-d] [--sub|-s] [--add|-a <command + prompt>[, <command + prompt>]] <goal> | work on <area>[, <area>...]"
---

Take one multi-part goal, decompose it into units of work, and delegate each unit to an **existing** MyCommand command running in its own subagent — in parallel where the units are independent, in sequence where they are not.

This command owns planning, routing, dependency ordering, batching, failure handling, and the final synthesis. It owns **none** of the implementation. `/my-command:task` already owns branch → worktree → implement → verify → `/my-command:clean` → `/my-command:pr` → teardown, and `/my-command:god` adds the merge last mile on top of that. So this command **never branches, commits, opens a PR, merges, or tears down a worktree itself**: doing any of it here would mean two owners for one branch, and the delegate is the one holding the worktree. **Its unit of delegation is one invocation of one existing command, and nothing smaller** — never "have a subagent edit these three files".

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the **goal**.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the way this run ends.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **A run another command invoked inline with the `Skill` tool anchors its handback instead**, worded as "hand back to the invoking command in its next turn": a nested run that spends a text-only turn ends the whole assistant turn and strands every step its parent still owes, so the item it carries must not tell it to. A run the user invoked directly, and one dispatched as a subagent, both anchor the text-only close. **Resolve the item in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** Every run recorded before this marker existed is read from that prose, and the prose is still the only reading for any message the marker is missing from. Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

## Flags

- `--delegate <command>` / `-D <command>` — which command each unit is handed to: `task` (default), `god`, `fb`, `work`, or `work:god`. **`task` is the default because it stops at an open PR and leaves a human the merge.** This command multiplies whatever it delegates, and eight unattended merges out of one invocation is a different risk from one, so `--delegate god` must be typed rather than inherited.
  - **`fb` is the one delegate that cannot cut a branch**, so it does not take a planned one. `/my-command:fb` applies feedback to the branch it is already on, or with `--target <branch>` to a branch that **already exists** — which means an `fb` unit's branch is named by the goal rather than by the plan, and the unit is dispatched as `/my-command:fb --target <that existing branch>`. Handing `/my-command:fb` a `<type>/<kebab-summary>` this run invented gets the unit either a branch that does not exist or, with no `--target` at all, this session's own branch — the collision Step 3 exists to prevent. **A goal that cannot name an existing branch for an `fb` unit is a stop, not a new branch.**
  - **`work` cuts no branch either, and for the opposite reason: it cuts many.** `/my-command:work` claims each accepted idea under the branch name it is about to cut and then dispatches its own downstream run per idea, so branch naming lives *inside* the unit. A `work` unit is therefore planned around **one area**, not one branch — see the `work on` form below. **`work:god` puts every one of those downstream runs in god command mode** (`/my-command:work --delegate god`), which merges each idea's PR without asking; it is the most multiplying form this command has — areas × ideas — so like `--delegate god` it must be typed and is never inherited.

### The `work on` form

**`/my-command:manage work on <area 1>[, <area 2>, ...]` selects the `work` delegate and takes the comma-separated list as the areas** — one unit per area, one `/my-command:work --area <area>` each, dispatched in the ordinary waves. `--delegate work` with a goal naming areas means the same thing; typed together they do not conflict.

- **The area is the unit, and it is also the lane.** Every idea on the ledger is filed under exactly one area, so two `work` units select disjoint idea sets by construction, and `/my-command:work`'s own claim is the device-wide backstop when some other run holds one. **Never compose `--idea` into a `work` unit** — a named slug bypasses the partition the areas are providing.
- **A `work` unit's file scope is undetermined at plan time**, because the ideas that decide it are read by `/my-command:work` after dispatch. So this command cannot sequence `work` units on file-scope overlap the way it does every other kind: two areas whose ideas happen to touch one file yield two PRs to reconcile rather than one corrupted branch, since each idea still lands in its own `/my-command:task` worktree. Say that in the plan, and use `--sequential` when the areas are known to be adjacent.
- **`--parallel` bounds units in flight, not ideas per unit.** How many runs one `work` unit fans out to is `/my-command:work`'s own schedule, and `--max` does not cap it either — a unit always carries `--area`, which is an explicit selector, and `/my-command:work` caps only the run nobody narrowed.
- **An area that does not exist is `/my-command:work`'s stop, not this command's.** Do not re-derive the ledger check here; the unit stops naming the areas that do exist, and Step 5 records it as one failed unit while its siblings carry on.
- `--parallel <n>` / `-p <n>` — how many units may be in flight at once. Default `3`, hard cap `8`; a larger value is clamped to `8` and the clamp is reported.
- `--sequential` — dispatch one unit at a time regardless of independence. Overrides `--parallel`.
- `--dry-run` / `-n` — print the routing plan (the units, the waves, the dependencies, the branch names, each unit's base and its merge target, the forwarded flags each unit carries and the ones dropped for it, and the chosen delegate) and **spawn nothing**. No task list, no subagent, no branch.
- `--mesh` — opt into peer-to-peer messaging between the workers. **Off by default; see the topology rule below.**
- `--add <list>` / `-a <list>` — forwarded to every `task`, `god` and `work` unit, in the same comma-separated `<command> <prompt>` shape `/my-command:god` forwards it in. It reaches that unit's own run, not this command.
- `--into <branch>` — the **merge target** every merging unit's PR is merged into, forwarded verbatim to each of them. It is owned here rather than picked up from `/my-command:task`, because **`/my-command:task` does not document it** — only `/my-command:god` does, so it is dropped and reported for a `task`, `fb`, or plain `work` unit like any other flag the resolved delegate cannot parse. **`work:god` is the one indirect case**: those units merge, so `--into` forwards to `/my-command:work`, which passes it on to each `/my-command:god` it dispatches. Absent `--into`, a merging unit names no merge target and `/my-command:god` falls back to the default branch, exactly as it did before the flag existed.
- Anything not listed above that `/my-command:task` recognizes is **forwarded to every `task`, `god` and `work` unit this run dispatches** — currently `--here` / `-h`, `--base <branch>`, `--draft` / `-d`, `--sub` / `-s`, and `--add` / `-a <list>`. Read `/my-command:task`'s own Flags section rather than duplicating its list here; this command does not interpret a forwarded flag itself, beyond the three rules below.
- Anything not a recognized flag is part of the goal.

### Forwarded flags

A forwarded flag is typed **once, on this invocation**, and lands in every unit's own run rather than in this one. That is what separates it from a constraint written into the goal: the goal is prose a planner reads and can honour loosely, while a forwarded flag is composed into the unit's invocation in Step 4 and printed in Step 3's plan before anything spawns. **So a behaviour `/my-command:task` already has a flag for is asked for with that flag, never described in the goal text** — describing it leaves nothing to check the plan against.

**A delegate is never handed a flag it does not accept.** For every unit, compare this run's forwarded set against the **resolved** delegate's own Flags section, and for a flag that delegate does not document:

- **Drop it from that unit's invocation**, and report the drop in the plan — per unit and per flag, naming the delegate that cannot parse it. This is the rule the `--add`-on-an-`fb`-unit omission was always a case of, and it now covers the whole forwarded set.
- **Never pass it anyway.** A delegate that cannot parse a flag does not error on it; it reads it as criteria, so `-d` silently becomes a word in the feedback request.
- **Never re-express it in the criteria either.** Folding a dropped flag back in as a sentence reintroduces exactly the prose constraint the flag replaced, and hides it inside text that reads like scope.

What each delegate takes:

- **`task`** — the whole forwarded set **except `--into <branch>`**, which `/my-command:task` does not document: it stops at an open PR and merges nothing, so it has no merge target to name. A `--into` typed alongside the default delegate is dropped and reported per unit like any other, and the drop is worth reading as a sign `--delegate god` was meant.
- **`god`** — `--here` / `-h`, `--base <branch>`, `--into <branch>`, and `--add` / `-a`. It adds `--sub` to its own `/my-command:task` call whatever you pass, so forwarding `--sub` is accepted and redundant rather than dropped. **`--draft` / `-d` with `--delegate god` is a stop in Step 1**, not a per-unit drop: `/my-command:god` rejects `--draft` outright because a draft cannot merge, so dispatching it would be N units each stopping on their own. Say to use `--delegate task -d`.
- **`fb`** — `--target <branch>` alone, which the plan already fills from the goal, so **no forwarded flag survives an `fb` unit**. Every one of them is dropped and listed as dropped. That is not a gap to work around: `/my-command:fb` cuts no branch, and it hands its own `--here` to `/my-command:task` internally, so the flags that would matter are already settled by what `/my-command:fb` is.
- **`work` / `work:god`** — `--here` / `-h`, `--base <branch>`, `--draft` / `-d`, and `--add` / `-a`, which `/my-command:work` documents as its own pass-through set, plus the `--area` the plan fills from the goal. `--sub` is dropped (`/my-command:work` does not document it; `/my-command:task` receives its own). `--into` is dropped for a plain `work` unit and **kept for `work:god`**, which is the one unit that reaches `/my-command:god` two levels down. **`--draft` is not a stop for `work:god` the way it is for `god`** — it would become one inside each downstream run, so refuse it in Step 1 for both and say to use plain `work`.

**`--base <branch>` sets the root of the branch plan, and only the root.** It replaces the `defaultBranch` that Step 1 would otherwise name every unit's branch against, and it reaches the units at the **root of the dependency graph** — the ones waiting on nothing. **A stacked unit keeps the base Step 3 gave it: the branch of the unit it depends on, never `main` and never this root base.** Cutting a stacked unit from the root base instead would leave it without the interface it consumes and buy a conflict at merge time — the failure stacking exists to avoid. So a root `--base` moves where the plan starts; it does not collapse or override the per-unit bases Step 2 and Step 3 build, and the plan prints every unit's base so a root one and an inherited one are told apart before anything spawns.

**That inheritance is for the delegates that do not merge. Under `--delegate god` a stacked unit is cut from the run's merge target instead**, because `/my-command:god` merges each unit's PR and then deletes its remote branch — and waves run in order, so the branch a stacked unit would inherit is already deleted **before that unit is dispatched**, not merely before it merges. Cutting from it would name a branch that no longer exists. Nothing is lost by cutting from the merge target: the dependency's PR merged into it, so the interface the stacked unit consumes is already there, which is the only thing the inheritance was ever for.

**`--into <branch>` is uniform across every unit, and is never inherited down a stack.** `--base` and `--into` look like a pair and behave nothing alike: **every `god` unit in the run carries the same `--into`, the one typed on this invocation, whether it waits on nothing or is stacked three deep.** A stacked unit does **not** merge into the branch it was cut from. Three reasons, and the third is the one that decides it:

- **`/my-command:god` defines the two as independent.** `--base` is the cut point, `--into` is the merge target, and `/my-command:god` states `--into` is never inherited from `--base`. Inheriting `--into` here *because* `--base` inherits would re-couple, one level up, exactly the two things that flag exists to separate.
- **`--base` inherits for a reason that is only about the cut point.** A stacked unit has to be **cut** from the branch carrying the interface it consumes or it cannot build against it. Nothing equivalent is true of the merge target: the stacked unit already holds its dependency's commits by having been cut from them, so merging into the dependency's branch would hand it code it is already sitting on.
- **Under `--delegate god` — the only delegate that takes `--into` — the branch a stacked unit would inherit is gone by the time it needs it.** Waves run in order, and `/my-command:god` merges each unit's PR and then deletes its remote branch. So when a stacked unit reaches its own merge step, the unit it depends on has already merged and its branch has already been deleted. An inherited `--into` would name a branch that no longer exists, and the run's single merge target is the only branch guaranteed to still be there.

The reader-facing consequence is what Step 3 prints: **cut points fan out down the stack while merge targets all read the same.** A plan where two units show different merge targets is a planning bug, not a stack.

**`--here` / `-h` forces `--sequential`, and collapses the branch plan.** What makes concurrency safe here is that `/my-command:task` cuts a fresh worktree per run, so two units are two working trees; `--here` removes exactly that and puts every unit in one checkout on one branch. So units go out one at a time regardless of independence, Step 2 plans no branch name for them, and the run yields **one** branch and one PR rather than one per unit — say all of that in the plan and in the closing report. `--base` is ignored alongside it, the way `/my-command:task` already documents. **`--into` is not** — the run still merges under `--delegate god`, and the one branch and one PR `--here` collapses to still need a merge target, so `--here` is the one place the two flags most visibly part company.

## Step 1 — Read the goal and settle the preconditions

**Never stop to ask what you can answer from the goal, the repo, or this session.** Reserve `AskUserQuestion` for a true branch point: an irreversible action the goal does not authorize, or a requirement genuinely missing rather than merely unstated. A question asked to feel certain costs the run its unattendedness and buys nothing.

1. `my-command-tools state` — one call gives `branch`, `defaultBranch`, `root`, and `worktree`. That `defaultBranch` is this run's **root base** unless `--base <branch>` was given, in which case the given branch is; either way every unit's branch is named against the root base, and nothing here is derived from the session's startup snapshot.
2. Resolve the delegate named by `--delegate` the way `/my-command:task` Step 0 resolves an added command: from what is actually installed on this device, never from the name looking plausible. An unresolvable delegate is a stop, not a fallback to `/my-command:task`.
3. **Settle the forwarded flags against that resolved delegate before planning anything.** Which of them it accepts, which are dropped for it, and whether any is refused outright — `--draft` / `-d` under `--delegate god` or `work:god` is the one stop, and `--here` / `-h` forces `--sequential`. Record the surviving set: Step 4 composes it into every invocation and Step 3's plan prints it alongside every drop. Reading the delegate's own Flags section is what settles this; a flag's fate is never guessed from its name.
4. Confirm the goal is genuinely multi-part. **A goal that decomposes into fewer than three units is not worth an orchestrator** — say so and hand it to the delegate directly as a single run, rather than wrapping one `/my-command:task` in a planning layer. For the `work on` form the units are the areas, so **fewer than three areas is one `/my-command:work --area <list>` invocation**, which already selects the union of several areas by itself.

## Step 2 — Decompose the goal into units

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

Read the repo enough to know what each unit touches, then write the plan down. Every unit gets four facts, and all four are decided **here**, before anything is spawned:

- **The command it invokes**, with its flags and its criteria — one invocation of one existing command. Its flags are this run's forwarded set minus whatever the resolved delegate does not accept, and the drops are written down here rather than noticed at dispatch.
- **The branch it runs on and the base it is cut from**, the branch named `<type>/<kebab-summary>` the way `/my-command:task` names one — except an `fb` unit, which takes an **existing** branch named by the goal, because `/my-command:fb` applies feedback onto work that is already there, and a `work` unit, which is planned around its **area** and gets no branch at all, because `/my-command:work` names one per idea when it claims it. The base is this run's **root base** for a unit that waits on nothing, and the **branch of the unit it depends on** for a stacked one — the run's merge target instead for a stacked one under `--delegate god`, whose dependency branch is merged and deleted before that unit is dispatched; under `--here` no branch is planned at all, because every unit runs in place on the current one. **Every parallel unit gets its own branch and its own worktree.** Two `/my-command:task` runs sharing a branch is a corrupted run — the second one's commits land on top of the first one's half-finished tree and neither PR describes what it contains — so the plan assigns the names up front and passes them through, rather than letting two delegates independently derive the same name from similar criteria.
- **The files it touches**, as concretely as the goal allows. This is not documentation; it is the input to Step 3's batching. A `work` unit is the one that cannot answer it — its area is its scope, and the paths behind that area are `/my-command:work`'s to discover.
- **What it depends on**, if anything.

**Three to eight units.** Below three there is nothing to orchestrate. Above eight the plan stops being holdable — the failure is not the spawning, it is that nothing left in the run can still say what the whole thing was for — so a goal that decomposes into more than eight units is **batched into successive waves**, planned in full and dispatched a wave at a time, never fanned out at once.

## Step 3 — Batch the units into waves

Two things, and only two, make one unit wait for another:

- **File-scope overlap.** Units whose file scopes intersect are **sequenced, however independent they look**. Two branches editing the same file buy a conflict per unit, and the conflict is paid later, by a human, at merge time. This is why "what files does this unit touch" is part of planning rather than a note.
- **A stated dependency** — unit B needs the interface, migration, or command unit A introduces.

A clean textual merge is never evidence of independence: two units can edit disjoint lines of one file and still leave the file incoherent.

Everything else is independent and goes out **together**. **Dispatching independent units one after another is the specific failure this command exists to prevent** — it is the shape a run falls into by default, because each unit reads as the natural next thing to do, and it turns a wave into a queue while reporting success either way.

Give every unit in a wave an explicit **lane**: the paths it owns and the paths it must not touch. The lane goes into that unit's prompt, because the subagent cannot see its siblings' plans.

**Record the graph in the harness task list, not in a file.** One `TaskCreate` per unit, then `TaskUpdate` with `addBlockedBy` to link the dependencies — **after** every task exists, since the link needs both ids. The task list is live session state that survives a compaction; this prompt is not, so once the run is summarized the task list is the only surviving record of what was dispatched and what is still owed. That is the same reasoning behind the closing-turn anchor, and it is why this command **builds no second task store, no progress file, and no status dashboard**.

Under `--dry-run` / `-n`, print the plan and **stop here** — before `TaskCreate`, before any spawn.

**The printed plan is what makes a forwarded flag checkable rather than hoped for**, so every flag is visible in it before a subagent exists. Per unit: the **full invocation Step 4 would compose**, flags included and in order; the branch, the base it is **cut from**, and the merge target it **lands in**; its lane; what it waits on; and every forwarded flag **dropped** for it, with the delegate that cannot parse it. **Print the cut point and the merge target as two named fields, never one "base" field**, because they are the two things a reader most needs told apart before a subagent exists and the words for them are otherwise interchangeable — that is the whole reason this plan is printed. A `god` or `work:god` unit prints the run's `--into`, or the default branch when none was typed; a `task`, `fb`, or plain `work` unit prints no merge target at all and shows `--into` among its drops. A `work` unit prints its **area** where the others print a branch and a cut point, and says its file scope is undetermined until `/my-command:work` reads the ledger. Then for the run as a whole: the resolved delegate, the waves, the `--parallel` cap with any clamp, and any flag that changed the schedule rather than a unit — `--here` forcing `--sequential`, and the single branch and PR that follows from it. A plan that reports a unit's criteria but not the flags it will carry is the failure this print exists to close.

## Step 4 — Dispatch each wave

Send a wave as **multiple `Agent` calls in a single assistant turn**. One subagent per unit. Star topology: every worker talks to this session and to nothing else.

**Do not wire the workers to each other.** Peer messaging between agents costs roughly **2.4x–2.7x** the tokens of the equivalent fan-out through the Task tool — about **150K versus 400K** for a three-agent review, and **500K versus 1.2M** for an eight-agent feature — because every worker pays to read every other worker's traffic. That price is worth paying only when the workers must negotiate a cross-cutting concern mid-flight. **Here they have nothing to negotiate:** each one runs a self-contained command on its own branch in its own worktree, and the concern they would negotiate was already resolved into lanes in Step 3. `--mesh` is the escape hatch for the case where a human knows better; it is off by default and stays off unless typed.

**Keep each delegate prompt minimal.** Every delegate is a MyCommand command that is already self-contained through its own file, which the subagent loads when it is invoked. Pass the invocation, that unit's criteria, its branch, and its lane — then stop. Restating the whole plan into every subagent prompt puts a second set of instructions in front of the command's own, competes with them for attention, and makes completion **less** reliable rather than more.

A unit's prompt is therefore about this shape, naming the **resolved** delegate rather than `/my-command:task` by default:

```
Run /<delegate> <this unit's forwarded flags> <this unit's criteria>.
Branch: <type>/<kebab-summary>, cut from <base>. Own <paths>; do not touch <paths>.
```

**The flags in that invocation are the surviving set Step 1 settled and Step 3 printed** — this run's forwarded flags minus the ones the delegate cannot parse, composed exactly as they were printed. `--add <list>` is one of them rather than a special case, and `--base` carries **this unit's** base: the root base for a unit that waits on nothing, and the branch it depends on for a stacked one — or, under `--delegate god`, the run's merge target for that stacked one, since the branch it would otherwise inherit has already been merged and deleted by the wave before it. `--into` carries the **run's** merge target, identical in every `god` invocation and never swapped for the unit's own base — the one flag in the set that does not vary per unit. Never re-derive the set here, and never add a flag the plan did not show.

An `fb` unit is the one that reads differently — the branch goes in the invocation, and **no forwarded flag survives**, `/my-command:fb` documenting `--target` alone:

```
Run /my-command:fb --target <existing branch> <this unit's criteria>.
Own <paths>; do not touch <paths>.
```

A `work` unit reads differently again — the **area** is both the selector and the lane, and there is no branch to name:

```
Run /my-command:work --area <this unit's area> <this unit's surviving forwarded flags> <any extra context from the goal>.
Own that area alone; never select an idea filed under <the other units' areas>.
```

Add `--delegate god` to that invocation for `work:god`, carrying `--into` when the run has one. `/my-command:work` claims every idea it takes before writing any code, so two units racing for one idea resolve in the ledger rather than here.

`--sequential` dispatches the same units one at a time. `--parallel <n>` caps how many of a wave go out at once; a wave larger than the cap is split, and the split is reported as part of the plan rather than discovered at dispatch.

## Step 5 — Collect the wave, isolate the failures

Wait for the whole wave, then read every result. **One failed unit must not cancel its siblings or end the run.**

- Record the failure with its **cause**, not just its name.
- Spend **at most one retry** on it, and only when the cause is something a retry can change (a flaky gate, a transient network call) rather than something it cannot (criteria the repo contradicts).
- Carry everything else forward. **Four successes and one stated failure is a good outcome; dying on the first failure is not** — the siblings' work is already done and is thrown away for nothing.

**The replanning loop is bounded at one round.** If a unit fails and its retry fails, it is reported as failed and the run moves on. Do not decompose it again, do not route it to a different delegate, and do not re-plan the wave around it. An orchestrator that re-plans until everything succeeds does not terminate, and the second re-plan is where a run stops being able to say what it did.

Then dispatch the next wave, until every wave is done or the plan is exhausted.

## Step 6 — Synthesize the run

**Synthesis is mandatory, and raw subagent reports are not the deliverable.** A subagent's report is never visible to me and is never the run's outcome — the outcome belongs to this session. So end with **one** summary naming, per unit:

- the command that ran, with the forwarded flags it actually carried,
- the branch, and the base it was cut from when that was not this run's root base,
- the PR number or URL — for a `work` unit, **one line per idea it built**, with the slug, since that unit is a fan-out rather than a single PR,
- the outcome (shipped / merged / failed with its cause / not dispatched).

Then one line for the run as a whole: how many units, how many landed, what is left for a human. **Name every forwarded flag that was dropped, and for which units** — a flag typed on this invocation and silently missing from a unit's run is indistinguishable, in a report that lists only outcomes, from one that was honoured.

**Never batch-merge the resulting branches onto `main`.** If the run was meant to land as one thing, the way to do that is an integration branch: merge the unit branches there, verify there, and open **one** PR from it. Merging each branch straight onto the default branch skips every gate the PR exists to run.

## Notes

- **This command implements nothing.** No branch, no commit, no PR, no merge, no worktree teardown — those belong to the delegate, and a second owner for any of them corrupts the run.
- `--delegate god` merges each unit's PR without asking, and `work:god` merges every PR of every idea in every area. That is those values' whole meaning; require each to be typed and say in the opening announcement that the run will merge, and for `work:god` that the count is not known until the areas are read.
- **A `work` unit delegates twice.** `/my-command:manage` hands it an area, `/my-command:work` hands each accepted idea to `/my-command:task` or `/my-command:god`, and that one owns the branch and the PR. Nothing here plans a branch for it or marks an idea shipped — the ledger is `/my-command:work`'s, exactly as the worktree is `/my-command:task`'s.
- **A forwarded flag is for the delegate's run, never for this one.** This command cuts no branch and opens no PR, so `--base`, `--draft`, `--sub`, and `--here` change nothing here directly: `--base` is an input to the branch plan, `--here` is an input to the schedule, and the rest are carried through untouched. **Ask for a delegate's behaviour with its flag rather than with a sentence in the goal** — a flag is composed into the invocation and printed in the plan, while a sentence is only as reliable as the planner's reading of it.
- <!-- include: shared/approval-own-call.md -->**A command that may need approval goes in its own Bash call** — `git fetch`, `git config`, and, as a narrow exception to the general rule to chain dependent mutations, branch-lifecycle operations such as checkout/switch, pull, remote-branch inspection, and local branch deletion. Folding one into an `&&` chain escalates approval to the whole compound command and costs a turn plus a retry. Put status output, pipes, and follow-up verification in separate read-only calls.<!-- /include -->
- Report each unit's branch up front and its PR at the end. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Step 7 — Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**Every run states its outcome on the way out, and *how* it states it depends on how this run was invoked.** One mechanic decides all three cases: in Claude Code an assistant message carrying text and **zero tool calls** ends the assistant's turn and hands control back to the user. That is what records a run's outcome — and it is also what strands a parent pipeline when a nested run spends one, because the parent's remaining steps never get a turn to run in.

**Tell which of the three cases this run is in before composing anything, from how it was invoked:**

- **Outermost** — the user invoked this command directly, as the prompt this turn is answering. No other command run encloses it. It **closes in a text-only turn**.
- **Nested inline** — another command invoked this one with the `Skill` tool in this same session, as a step of its own pipeline, and that parent still has steps owed once this one returns. It **hands back without spending a text-only turn**.
- **Subagent** — this run was dispatched with the `Agent` tool (`--sub`, a delegated unit, any Agent-tool dispatch). It has its own conversation, and its final message is a report *to* the parent session rather than a turn *in* the parent's conversation, so nothing of the parent's is waiting behind it. It **closes in a text-only turn**, exactly like an outermost run.

**Outermost and subagent: close in a text-only turn. Never skipped, never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

**Nested inline: hand back without spending a text-only turn.** Emit the report and the return marker as **text in the same assistant message that carries the parent's next tool call**, so the turn continues into the parent's next step instead of ending and returning control to the user. A nested run that closes in a text-only turn strands every step its parent still owes — the recorded failure is a `/my-command:clean` and a `/my-command:pr` nested in one pipeline, where each child's text-only close handed control back before the parent could invoke the next child, run its teardown, or record its own outcome, leaving a live run reading as abandoned. So do not compose a message of text alone here, and do not stop to let the parent speak: say what this run did, write the marker, and make the parent's next call in that same message. The parent's own closing turn is the one that records the outcome for both.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes; which of the three cases applies does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available. A nested run that stopped early still hands back in the parent's turn — it reports the stop as text beside the parent's next call, and the parent decides whether to carry on.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line, in all three cases:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Written **exactly once**, on the last line of the message that hands control back, whether that message is a text-only close or a nested handback riding the parent's next tool call. The marker is the only record of where a run handed control back, so it is never weakened, deferred to a later message, or dropped because the turn continues: without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. That is true even inside a nested run: my message is addressed to the session, not to whichever command currently holds it. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never the dispatching run's turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close that run in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it — in the two closing cases.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of an outermost or subagent run and swallow the outcome. The nested handback is the deliberate exception and the only one: there the report rides the parent's **next** call, which is what keeps the parent's turn alive.
<!-- /include-block -->
