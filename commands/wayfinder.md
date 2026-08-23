---
description: Run a wayfinder — a named campaign of related work tracked as markdown plans in the repo rather than on an issue tracker: one base branch, a map of active tasks, one /my-command:task per ticket, and a summary appended as each lands
argument-hint: "[--unattended] [--integration <branch>] [--here|-h] [--base <branch>] [--draft|-d] [--add|-a <command + prompt>[, <command + prompt>]] <start|add task|execute|complete|close> <description>"
---

A **wayfinder** is a named campaign of related work — several tasks that ship together — tracked entirely in markdown inside the repo. It exists to plan and execute a multi-task effort **without an issue tracker or project board**: fewer moving layers for an agent to keep in sync, and everything reviewable in a diff.

The request is the text in the `<command-args>` block above. Parse leading flags off the front; the remainder names the **operation** and its subject.

**Announce the operation you picked before acting** — start, add task, execute, complete task, or close — so the run reads as one of five things rather than as improvised branching.

**The git plumbing runs through `my-command-tools`.** Every verb prints JSON on stdout — read the fields rather than re-deriving them with your own `git` calls. `state` is where the default branch comes from: this command never hardcodes `main`. It is also the fallback for the campaign's integration branch when `--integration` was not typed at start — and once start has resolved that branch, the **map** is where every later operation reads it. If the bare call answers `command not found`, the shim is not linked onto PATH — reach the same CLI at `~/.claude/my-command/toolkit/bin/my-command-tools` (or `~/.codex/my-command/toolkit/bin/my-command-tools`), run `doctor` through that path, and report the `onPath` fix it prints. Do not fall back to hand-rolled shell.

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

### Forwarded to the ticket run

These are the ticket runner's own flags, and they matter only when this run **executes a ticket** — that operation is one invocation of that runner, and these are forwarded to it verbatim. The charting operations (start, add task, complete, close) ignore them.

- `--here` / `-h` — execute the ticket on the current branch, no worktree.
- `--base <branch>` — cut the ticket worktree from `<branch>` instead of the campaign base branch (the default is `wayfinder/<slug>`). **This is the ticket's cut point and nothing else.** It is not the campaign's integration branch, which is `--integration` below; the two answer different questions and a run that means both says both.
- `--draft` / `-d` — open the ticket PR as a draft. **Refused alongside `--unattended`**, which routes tickets through `/my-command:god`, and `/my-command:god` rejects `--draft` outright because a draft cannot merge. Stop and say to run the campaign without `--unattended` if the tickets are meant to stay in draft.
- `--add` / `-a` — weave extra commands into the ticket run, as a comma-separated list of `<command> <prompt>` entries.
- Anything not a recognized flag names the operation and its subject.

The ticket runner owns the authoritative semantics for every one of these — do not reinterpret them here.

### Owned here

- `--integration <branch>` — the campaign's **integration branch**: the branch `wayfinder/<slug>` is cut from, and the branch the campaign's own PRs target. **Read on the `start` operation only**, because that is where the campaign base branch is cut and where the map is written; every later operation reads the resolved branch **out of the map** rather than re-deriving it, so the flag is not retyped and is ignored if it is. Absent the flag, the integration branch is the repository default branch reported by `my-command-tools state` — the behaviour every campaign started before this flag existed already had. Neither the default nor the flag is a hardcoded branch name: `main` is never written into a decision here, and neither is whatever branch a given campaign happened to name.
  - It governs exactly three things, and nothing else: the **cut point** for `wayfinder/<slug>`, the target of the **planning PR** at start, and the target of the **campaign PR** at close. Ticket PRs are untouched by it — they target `wayfinder/<slug>` exactly as they always have.
  - **It is not `--base`, and `--base` is not it.** `--base` is forwarded to the ticket runner and names *a ticket's* cut point inside the campaign; `--integration` names what the *campaign itself* is cut from and merged into. A campaign whose integration branch is `release/2.0` still runs its tickets off `wayfinder/<slug>`. Do not read one as shorthand for the other and do not collapse them into a single flag.
- `--unattended` — authorise this run to merge the PRs it opens, and route ticket execution to `/my-command:god` instead of `/my-command:task`. **It must be TYPED on the invocation that acts.** No operation infers it: not from a command that invoked this one, not from an earlier operation in the same campaign — a start run given the flag authorises nothing for the execute run that follows it — and not from the map, which records the mode but authorises nothing by itself. The reason is what a wayfinder is: it multiplies whatever it authorises, and **N unattended merges out of one invocation is a different risk from one**, which is exactly why `/my-command:manage` requires `--delegate god` to be typed rather than inherited. Absent the flag on this invocation, this command opens PRs and merges nothing, whatever the map says.
  - **Say in the opening announcement that this run will merge**, alongside the operation you picked, so an unattended run is never the thing a reader has to infer.
  - **One path deliberately puts the flag in front of the next agent to type, and only one:** the map's own **Agent kickoff prompt**, for a campaign whose map header records `**Unattended:** yes`. That prompt is not documentation about the campaign — it *is* the resume path, the literal text a fresh agent is handed to pick the campaign back up. A resume that drops the flag silently downgrades the campaign to stopping at every PR, and since a long campaign resumes as a matter of course, an unattended campaign that resumes attended never finishes. So `start` records the mode and generates the prompt to carry `--unattended` when it is set. **The flag is still read off the invocation and nowhere else**; what this adds is a prompt that tells the resuming agent to type it. The decision, and the escalation risk it accepts, are recorded in `docs/adrs/0006-unattended-campaigns-resume-unattended.md`.

## Mental model

- One wayfinder = one **integration branch** — the branch the campaign is cut from and merged back into. `--integration <branch>` names it at start; absent that, it is the repo's default branch from `my-command-tools state`. Whichever it resolves to, **it is written into the map at start and read from there afterwards**, so a fresh agent resuming from the map never re-derives it.
- One wayfinder = one **base branch** `wayfinder/<slug>`, cut from that integration branch.
- One wayfinder = one **mode**, attended or unattended, fixed at start by whether `--unattended` was typed there and written into the map as `**Unattended:**`. It decides one thing and one thing only: whether the map's kickoff prompt is generated carrying `--unattended`. It is never read as authorisation by an operation — every merge still needs the flag typed on the invocation that performs it.
- One wayfinder = one **map** file `<plans>/wayfinder-<slug>.md` listing its active tasks and logging its completed ones.
- Each task = one **plan** file `<plans>/<slug>-NN-<task-slug>.md` and one branch `task/<slug>-NN-<task-slug>` cut from the base branch. **Every ticket PR targets the base branch — never the default branch.**
- `<plans>` is the repo's own plans directory — `docs/plans/` where the repo has one, otherwise the directory its docs convention names. Resolve it once at the start operation and record it in the map; do not invent a second location later in the campaign.
- Everything under `<plans>` for a wayfinder is **ephemeral scaffolding**, on a schedule rather than by accident. The durable record is the merged code plus the repo's own feature, spec, and decision docs. A finished task's plan is **marked done where it already lives** and stays there for the rest of the campaign, so any task can still be restarted from what was *asked*. The campaign's **final ticket** deletes every plan; the map goes when the wayfinder closes.

```
<integration branch>              (--integration <branch>, else the default branch)
 └── wayfinder/<slug>            (base branch — accumulates every ticket)
      ├── task/<slug>-01-...     (/my-command:task --base wayfinder/<slug>)
      ├── task/<slug>-02-...     (/my-command:task --base wayfinder/<slug>)
      └── ...                    → one PR wayfinder/<slug> → integration branch at the end
```

Exactly two PRs legitimately target the **integration branch**: the **planning PR** at start, which lands the map and its tickets so agents can read them, and the **campaign PR** at close, which lands the built code. Neither is a batch merge — each is one branch with one PR. On a campaign that never named an integration branch, that branch *is* the default branch and this reads exactly as it always did.

## Steps

1. **Read the live state first.** `my-command-tools state` gives the branch, the `defaultBranch`, and the worktree — never work from the session's startup snapshot. If a map already exists, read it before deciding anything; the map, not memory, says which tasks are active **and which branch this campaign integrates with**.
2. **Pick the operation** that matches the request and run only that one. Each is written to be re-runnable: re-read the map, act, regenerate the docs index, report.
3. **Report** what changed — the operation, the map path, the branch, and any PR — as this run's closing turn.

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

That applies squarely to the complete and close operations, which read the map and every plan beside it: enumerate them from one listing, then read the whole list in one turn rather than one plan per turn.

## Task status vocabulary

A task's **Status** in the map is one of exactly six values, and no others. The vocabulary is deliberately flat — no sub-states, no transitions to memorise — because its whole job is to tell a fresh agent resuming from the map **why** a task is not running. Each answer calls for a different action, so the status has to carry the action with it:

| Status | Means | What a resuming agent does |
|--------|-------|----------------------------|
| `todo` | Never started. No branch, no worktree, no PR, nothing to read. | Pick it up and execute it. |
| `in-progress` | A ticket run is executing it right now. | Leave it alone **while that run is live**. If nothing is behind it, read the branch and then **rewrite the row** — see below; a stale `in-progress` is the one row that can freeze a campaign. |
| `paused` | Deliberately stopped, and resumable exactly as it stands. Nothing is wrong with it. | Pick it back up and carry on from where it stopped. |
| `blocked-limit` | Stopped mid-run because the usage window or rate limit ran out. **Nothing is wrong with the work** — the clock ran out, not the plan. | Resume it once the window resets. Until then execute a different task rather than waiting on it. |
| `rejected` | I reviewed it and turned it down. | **Do not retry it.** It needs a new decision from me, or a rewritten plan. Report it and move on to another task. |
| `redo` | The work landed but has to be done again differently. | Restart it from the plan: read the Note for what must differ, then execute it as a fresh run. |

**Three of those mean "this task is stopped", and they are not interchangeable.** State the difference outright rather than leaving a reader to infer it from the status names:

- `todo` — **never started.** Nobody has attempted it, so there is no history to read and nothing to resume; executing it is the ordinary thing to do.
- `rejected` — **stopped because I turned it down.** It was attempted, reviewed, and refused. Silently retrying it re-does work a human has already said no to, which is why it is the one status a resuming agent must never act on by itself.
- `blocked-limit` — **stopped because the usage window ran out.** It was attempted, nothing about it was judged, and it resumes untouched when the window resets. No human decision is owed, and treating it like `rejected` strands work that is simply waiting on a clock.

`paused` sits alongside `blocked-limit` on that split — attempted, unjudged, resumable as-is — and differs only in what stopped it: a deliberate choice rather than a limit.

### Repairing a stale `in-progress` row

**`blocked-limit` is the one status the run that needs it often cannot write.** A run whose usage window ran out mid-ticket rarely gets another turn to edit the map, so the status meant to survive a hard stop is exactly the one most likely to be missing — and the row is left on `in-progress`, which reads as live work and freezes the next agent out of it. Left unrepaired that compounds: each successive agent skips the stale row, starts another ticket, and hits the same wall, until every row reads `in-progress` and the campaign reports no eligible task while nothing at all is running.

So **repairing the row is a resuming agent's job, and it comes before picking a task**. For each `in-progress` row, establish whether a run is actually behind it — a live worktree, a branch pushed within the run's lifetime, an open PR. If one is, leave it. If none is, read the branch to see how far it got and rewrite the row before choosing anything:

- The branch carries work and nothing was judged → **`blocked-limit`**, Note saying the run stopped without recording a status and when the window resets.
- The branch carries nothing worth resuming → **`todo`**, Note empty, because nothing was really started.

Never delete the row and never leave it on `in-progress` once you have established no run is behind it. Repairing it is not the same as executing it: repair every stale row first, then pick a task from the repaired map.

### The Note column

The map's **Active tasks** table carries a short free-text **Note** beside the Status. It is there because three of the six statuses are useless to a resuming agent without a reason: `rejected` without my objection cannot be turned into a rewritten plan, `redo` without "differently how" is a re-run of the same thing, and `blocked-limit` without a reset time makes the next agent guess whether to wait.

- **Required** for `rejected`, `blocked-limit`, and `redo` — one clause, not a paragraph.
- **Empty** for `todo`, `in-progress`, and `paused`. A paused task that needs explaining is really a `rejected` or a `blocked-limit` one.

That column is the only thing the vocabulary adds to the table. Do not add a second, and do not split a status into sub-states — a distinction that needs more than one word belongs in the Note or in the plan.

## Operations

### 1. Start a wayfinder

1. Pick a short kebab-case **slug** (e.g. `auth-revamp`). Confirm it with me if the request is ambiguous.
2. **Resolve the integration branch, once, here.** `--integration <branch>` if it was typed on this invocation; otherwise the `defaultBranch` `my-command-tools state` reports. Do not assume it is `main`, and do not assume it is not. Confirm the resolved branch exists on origin before cutting anything from it — a typo'd integration branch is a campaign built on nothing. **Announce which branch it resolved to and where that came from** (the flag, or the repo default), so the campaign's target is stated rather than inferred.
3. Cut the base branch `wayfinder/<slug>` from the up-to-date **integration branch** resolved in step 2.
4. Create the map at `<plans>/wayfinder-<slug>.md` from the **Map template** below, recording that resolved integration branch in the header beside the base branch, and including an instantiated **Agent kickoff prompt**. **The map is the record from here on** — no later operation re-reads the flag or re-derives the branch from `state`.
   - **Record the campaign's mode in the same header**: `**Unattended:** yes` when `--unattended` was typed on *this* `start` invocation, `**Unattended:** no` when it was not. Resolve it once, here, exactly as the integration branch is resolved once here — a campaign's mode is a property of how it was started, not of whoever resumes it. It governs one thing: which of the two closing blocks the **Agent kickoff prompt** below is generated with. A map written before this line existed reads as `no`.
5. Create the task plans you can specify now with **Add a task**, so the tickets land alongside the map rather than trickling in later.
6. **Create the campaign's final ticket here, alongside the rest.** It is `<slug>-zz-retire-done-plans` — a real ticket with a real plan and a real branch, sitting last in **Active tasks**, where the reserved `zz` keeps it however many numbered tickets are added later. Its criteria: delete every `<plans>/<slug>-*.md` plan file, its own included, regenerate the docs index, and leave the map alone for **Close** to retire. **This ticket is critical, and it is not optional bookkeeping.** Every other plan is deliberately kept and marked done for the campaign's whole life, so this ticket is the only thing that ever removes any of them: skip it and the campaign's scaffolding stays in the repository permanently — a directory of done plans belonging to a campaign that ended, owned by nobody, that every later reader has to work out is dead.
7. Regenerate the docs index (see *Index upkeep*) and commit the map plus its plans on the base branch.
8. **Open the planning PR with `/my-command:pr`**, from the base branch, while the branch still holds only that planning commit — so the PR carries the scaffolding and no task code. **Its target is the integration branch the map now records.** `/my-command:pr` targets the repo's default branch by design, so when the map's integration branch is something else, retarget it the moment it exists — `gh pr edit <number> --base <integration branch>` — and confirm the retarget landed, exactly as a ticket PR is retargeted onto the campaign base. **By default do not mark it draft and do not merge it yourself** — I review every PR, and that default holds for every run without `--unattended`. **With `--unattended` typed on this invocation, merging the planning PR is authorised**: wait for it to be green and merge it yourself. Either way it has to land before any ticket branch is cut, so the integration branch carries the plans agents read.
9. Report the integration branch, the base branch, the campaign's recorded mode, the map path, the planning-PR link, and the kickoff prompt.

Do **not** create issues, labels, or project-board items. That is the layer this command replaces.

#### Agent kickoff prompt

Add this section to a new map after the goal and before **Active tasks**. Replace every placeholder, and keep it plain-language and provider-neutral — no model, vendor, or product-specific command names — so it can be pasted into any agent CLI.

````markdown
## Agent kickoff prompt

Paste this into an agent CLI from the repository root to begin or resume execution:

```text
Continue the `<slug>` wayfinder in this repository.

Read the repository instructions, the wayfinder workflow at <workflow-path>, and the campaign map
at <plans>/wayfinder-<slug>.md. Inspect the live Git and worktree state before making changes.

Execute the next unblocked active task from the map. A task is eligible when its status is one of:
never started, deliberately paused, stopped because a usage window ran out (and that window has
since reset), or marked for redoing differently. Never re-execute a task a human rejected — that
one needs a new human decision or a rewritten plan, so report it and pick another.

The campaign's final task — the one numbered `zz`, which deletes the campaign's plan files — is
executed only once it is the last active task left. Skip it while any other task is still active,
and never treat it as done work or drop it from the map: it is the only thing that removes the
plan files, so a campaign that skips it leaves its scaffolding in the repository permanently.

Before choosing a task, repair any task marked in progress that no run is actually behind — check
for a live worktree, a recently pushed branch, or an open pull request. A run stopped by a usage
window usually never gets the turn in which it would have recorded that, so a task can sit marked
in progress with nothing running it, and skipping it every time is how a campaign stalls with every
row marked in progress and nothing executing. Where a run is behind it, leave it. Where none is,
read the branch and rewrite the status: stopped with work in hand becomes stopped-by-usage-window
with a note saying no status was recorded, and stopped with nothing worth resuming becomes never
started. Repair every such row first, then pick a task from the repaired map.

Read its linked plan completely, mark it in progress, then run the task workflow against the plan's
criteria with the campaign base branch as its base, so the work happens in an isolated worktree and
is carried through cleanup and a pull request. Retarget that pull request to the campaign base
branch if the task workflow opened it against the default branch. Follow every repository
verification, documentation, and visual-proof requirement.

If you stop before the pull request is open, set the task's status to say why — deliberately paused,
or stopped because the usage window ran out — with a short note, rather than leaving it marked in
progress.

When reporting back, include the task completed, verification results, the pull-request link, and
any remaining risks or decisions.

<closing block — one of the two below, chosen by the map's **Unattended:** line>
```
````

Use this workflow's own repo-relative location for `<workflow-path>`. If every active task is blocked, report the blocking dependency instead of starting unrelated work — a task sitting on `rejected` counts as blocked on a human, and a task on `blocked-limit` as blocked on the clock. If none remain, report that the campaign is ready to close.

##### The closing block is generated, not fixed

The prompt's last paragraph is the only part that differs between an attended campaign and an unattended one, and **which one gets written is read off the map header's `**Unattended:**` line** — that is, off whether `--unattended` was typed at `start`. Write exactly one of these in place of the placeholder:

**`**Unattended:** no` — the reviewed default, and the wording every campaign has always had:**

```text
Stop after opening the pull request so a human can review it. Never merge it, and never leave it
targeting the default branch.
```

**`**Unattended:** yes` — resume the campaign the way it was started:**

```text
This campaign is recorded as unattended in the map header above, so resume it that way: type this
workflow's `--unattended` flag on the invocation you run. That routes the ticket through the
merge-through runner, which resolves conflicts, waits for checks, retargets the pull request onto
the campaign base branch, and merges it there. Do not stop at the open pull request — carry the
ticket through to merged, and never leave it targeting the default branch. Include the merge in
what you report back.
```

**Naming `--unattended` there does not break the prompt's provider-neutrality.** The rule that bars model, vendor, and product-specific command names still holds in full — `--unattended` is this *workflow's* own flag, parsed identically wherever the workflow is installed, so it reads the same in any agent CLI. Do not name the runner commands themselves in the prompt; "the merge-through runner" is the neutral phrasing, and this workflow's own docs say which command that resolves to.

**Everywhere else, the kickoff prompt still carries no flag it was not generated with, and the never-inherited rule is otherwise untouched.** This one exception exists because the prompt *is* the resume path: a campaign that stops at every pull request when it was started not to never finishes, and a resume is the ordinary event in a multi-week campaign rather than the exception. The flag is still read only from the invocation that acts — the map does not authorise anything, it decides which sentence gets written. `docs/adrs/0006-unattended-campaigns-resume-unattended.md` records the decision and states the escalation risk it accepts: a map is a file in the repository, so whoever can edit it can put the flag in a later resume's hands.

### 2. Add a task to the wayfinder

1. Read the map for the next task number `NN`.
2. Write the plan to `<plans>/<slug>-NN-<task-slug>.md` — pass that exact path, so it lands beside the map rather than at whatever default filename a planning tool would choose. Open it with the **Plan header** below, whose `**Status:** active` line is the marker completion later flips. State the task's criteria plainly enough that `/my-command:task` can be handed them unedited.
3. Add a row to the map's **Active tasks** table: number, task slug, plan link, branch `task/<slug>-NN-<task-slug>`, status **`todo`**, Note empty. `todo` is the only status this operation ever writes, because a freshly added task is by definition one that was never started.
4. Regenerate the docs index. Report the new task and its plan path.

### 3. Execute a task

**Ticket execution is an existing command, not hand-rolled implementation.** That command owns the worktree, the bootstrap, the verification, the commits, `/my-command:clean`, and `/my-command:pr`. Reimplementing any of that here is how a ticket ends up unverified or on the wrong branch.

**Which command is the flag's doing, and nothing else's:**

- **Default — `/my-command:task`.** It stops at an open, reviewed PR and leaves me the merge.
- **`--unattended` — `/my-command:god`.** It runs that same `/my-command:task` pipeline and adds the last mile: conflicts resolved, CI waited on, the ticket PR retargeted onto its merge target and merged there. That merge target must be named with `--into`, or it is the default branch.

**Which tasks this operation may pick up is read straight off the Status column**, and the vocabulary above says what each one means: `todo` (start it), `paused` (resume it as it stands), `blocked-limit` (resume it once the window has reset — otherwise execute a different task rather than waiting on the clock), and `redo` (restart it from the plan, doing differently whatever the Note names). **`rejected` is never executed here** — I turned that ticket down, so it needs a new decision from me or a rewritten plan before it is a ticket again; report it and pick another. `in-progress` belongs to a live run.

**The `zz` plan-retirement ticket is executed last, after every other task has completed.** It is eligible like any other ticket, but running it early deletes plans for tasks still to come. Pick it only when nothing else is active.

1. Read the task's plan in full.
2. Mark the task **`in-progress`** in the map — the only status this operation writes on the way in, whichever of the four eligible statuses the row carried before, and clear any Note that status left behind.
3. Invoke the runner with the campaign base and any forwarded flags:
   ```text
   /my-command:task --base wayfinder/<slug> [forwarded flags] <the plan's criteria>
   /my-command:god --base wayfinder/<slug> --into wayfinder/<slug> [forwarded flags] <the plan's criteria>   # --unattended only
   ```
   **`--base` and `--into` are both required on the `/my-command:god` form, and neither implies the other.** `--base` is the cut point; `--into` is the merge target. Absent `--into`, `/my-command:god`'s merge target is the default branch — and it *retargets the PR onto that target before merging*, so a ticket run without it merges into the default branch no matter what this command did to the PR's base beforehand. **A ticket that cannot be given `--into` is a stop, not a merge.**
4. `/my-command:pr` targets the default branch by design, so **retarget the ticket PR to the base branch** as soon as it exists:
   ```bash
   gh pr edit <number> --base wayfinder/<slug>
   ```
   Confirm the retarget landed — a ticket left pointing at the default branch is the one failure this command cannot absorb.
   - **Under `--unattended` this step is `/my-command:god`'s, not mine.** `--into wayfinder/<slug>` makes the campaign base its merge target, and `/my-command:god` retargets the PR onto that target itself, before it merges. Retargeting from out here would be too late anyway: `/my-command:god` merges before it returns. Confirm from `/my-command:god`'s own report that the ticket PR was merged into `wayfinder/<slug>`.
5. **By default, do not merge it — I review every PR.** That is this command's documented default rather than a limit of the operation. **With `--unattended`, the ticket merge is authorised** and `/my-command:god` performs it against the retargeted base as part of its own run; there is nothing left to merge here.
6. **If the ticket stops before it lands, write the status that says why.** This is the operation that records it, and a row left on `in-progress` by a run that stopped is what makes dead work read as live to the next agent:
   - The usage window or rate limit ran out mid-run → **`blocked-limit`**, Note naming when it resets. Nothing is wrong with the work.
   - Stopped deliberately and resumable as it stands → **`paused`**, Note empty. This is the status a pause writes, and it is a normal event in a long campaign rather than a failure.
   - I reviewed the ticket and turned it down → **`rejected`**, Note carrying my objection in one clause. Do not re-execute it afterwards.

   Otherwise the ticket landed, and **Complete a task** is the operation that records it.

### 4. Complete a task

Run this after a ticket's PR merges into the base branch. This is the operation that keeps the map honest.

1. Make sure the base branch actually carries the merged work before recording it as done.
2. **Mark the plan done where it already is** — set its header's `**Status:**` line to `done · YYYY-MM-DD`. Do not delete it, do not move it, and do not copy it anywhere; the file stays at the exact path the map already links.
3. **Append a summary** to the map's **Completed** section from the **Completed entry template** below. Describe what was *actually built*, not what the plan proposed — the deviations are the part worth keeping.
4. **Remove the task's row** from **Active tasks**. A completed task carries no status at all — the Completed entry replaces the row rather than joining the vocabulary, which is why there is no `done` among the six. The plan file's own `done` marker is a different thing on a different object: the row describes work in flight and goes away, the file describes what was asked and stays.
5. Regenerate the docs index and commit the map edit and the plan's status flip together on the base branch.

**Why the plan stays until the campaign's final ticket.** The Completed entry records what was **built** — prose written afterwards about the outcome. The plan records what was **asked**: the criteria, the constraints, the conditions the work had to meet. Only the second can be handed to a runner again, so a campaign that deletes plans at completion can re-open a task only from a summary of the very thing it is trying to redo. Keeping the plan costs one status line and is what makes `redo` an operation rather than a rewrite.

**Re-opening a completed task is the one path that writes `redo`.** When work that already landed has to be done again differently, restore its row to **Active tasks** with status **`redo`** and a Note naming what must differ, and leave its Completed entry in place as the record of what shipped the first time. **Its plan is still there, marked done** — flip its `**Status:**` back to `active` and amend it with whatever must differ this time. `redo` means restart from what was asked, and the plan is what carries that.

The final `zz` ticket is the one completion with no plan left to mark: it deletes every plan in the campaign, its own among them. Record it with steps 3–5 and skip step 2, saying so rather than looking for the file.

### 5. Close the wayfinder

Run when every task is complete and the durable docs exist.

1. Confirm each completed task produced its durable artifacts in the repo's own docs — the feature, spec, or decision doc the change owes. The map's Completed log is scaffolding, not the deliverable.
2. **Confirm the campaign's final ticket has landed.** This operation expects `<slug>-zz-retire-done-plans` to be in the map and executed, because that ticket — not this step — is what removes the campaign's plan files. Where it exists but has not run, execute it now with **Execute a task** before opening the campaign PR; where the map never carried it, add it with **Add a task** and then execute it. **Do not sweep the plans by hand here.** A deletion performed as a side effect of closing is exactly the untracked cleanup this ticket exists to replace, and doing it here would quietly make the ticket optional again.
3. Open **one** PR from `wayfinder/<slug>` to the **integration branch the map records** with `/my-command:pr`, summarizing the whole campaign and linking the map's Completed log. Read that branch from the map's header — do not re-derive it from `state`, and do not assume the campaign integrates with the default branch. `/my-command:pr` targets the default branch by design, so retarget when they differ (`gh pr edit <number> --base <integration branch>`) and confirm it landed before merging anything. **By default, do not merge it — I review it**, and that default holds for every run without `--unattended`. **With `--unattended` typed on this invocation, merging the campaign PR is authorised** once it is green.
4. **After that PR merges**, retire what is left: delete the map, regenerate the docs index, and commit as `chore: retire <slug> wayfinder scaffolding` — folded into the campaign PR if it has not merged yet, otherwise as a small follow-up PR. The plans are already gone, removed by the final ticket in step 2; a `<plans>/<slug>-*.md` still standing here means that ticket was skipped, and step 2 is where to go back to rather than deleting it from under the map. Then delete the base branch locally and on origin.

## Plan header

Every plan opens with this header, above its criteria:

```markdown
# <slug>-NN — <task title>

**Wayfinder:** `<slug>`
**Branch:** `task/<slug>-NN-<task-slug>`
**Status:** active
```

`**Status:**` is the plan file's own marker and takes exactly two values: `active` while the task is unfinished, and `done · YYYY-MM-DD` once its PR merged and **Complete a task** ran. **It is not the map's Status column** and shares nothing with that six-value vocabulary — the map's column describes a *row in the table*, which a completed task no longer has, while this describes the *file*, which a completed task keeps. That is why completion writes `done` here and still writes no `done` there.

Marking it done in place is the whole mechanism: one file, at one path, in one state. Nothing is copied to an `archive/` or a `done/` directory, because a second copy of a plan is a second source of truth and starts drifting from the first immediately.

## Map template

Write to `<plans>/wayfinder-<slug>.md`, carrying whatever frontmatter the repo's docs bundle requires:

```markdown
# Wayfinder — <Human Name>

**Slug:** `<slug>`
**Integration branch:** `<resolved integration branch>` (this campaign is cut from it and merges back into it; the planning and campaign PRs target it)
**Base branch:** `wayfinder/<slug>` (cut from the integration branch above; every ticket PR targets it)
**Unattended:** `<yes|no>` (fixed at start by whether `--unattended` was typed there; `yes` means the kickoff prompt below resumes this campaign unattended)
**Plans directory:** `<plans>`
**Started:** YYYY-MM-DD
**Goal:** <one sentence — what this campaign ships>

> Ephemeral scaffolding, on a schedule. Every `<slug>-*.md` plan beside this file stays here for the
> campaign's life — marked done once its task lands — so any task can be restarted from what was
> asked. The final ticket `<slug>-zz` deletes them all; this map goes when the wayfinder closes. The
> durable output is the merged code and the repo's feature and spec docs.

## Active tasks

| # | Task | Plan | Branch | Status | Note |
|---|------|------|--------|--------|------|
| 01 | <task slug> | [<slug>-01-...](<slug>-01-....md) | `task/<slug>-01-...` | todo | |
| zz | retire-done-plans | [<slug>-zz-retire-done-plans](<slug>-zz-retire-done-plans.md) | `task/<slug>-zz-retire-done-plans` | todo | Final ticket — deletes every plan. Execute last. |

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

The `zz` row is this campaign's final ticket. It always sorts last, it is executed
after every other task, and it deletes every plan in this directory. Do not drop it:
nothing else removes them, so without it they outlive the campaign permanently.
-->

## Completed

<!-- newest first; one entry appended per task completion -->
```

## Completed entry template

Append under the map's **Completed** heading as each task finishes:

```markdown
### <slug>-NN — <task title> · YYYY-MM-DD

**Built:** <what actually shipped, 1–3 sentences>
**Key files:** `path/one.ts`, `path/two.tsx`
**Docs:** <feature/spec doc added or updated, or "none">
**Follow-ups / deviations:** <anything left, or "none">
```

## Index upkeep

Where the repo's docs are a generated bundle, the plans directory participates in it. Any time a plan or the map is added or deleted, regenerate the listings and re-run the bundle's own check until it exits clean, then commit the regenerated index alongside the change. For an okq bundle that is `okq --bundle docs index` followed by `okq --bundle docs index --check`. A repo with no generated index has nothing to do here — say so rather than inventing a step.

Expect churn in that index: the plans directory is deliberately fast-moving.

## Merging under `--unattended`

This section applies only to a run with `--unattended` typed on it. Without the flag this command issues no merge at all, and none of the forms below are reached.

Three merges are authorised, and no more: the **planning PR** at start, each **ticket PR** (performed by `/my-command:god` inside the ticket run, into the `--into wayfinder/<slug>` merge target it was given), and the **campaign PR** at close. The planning and campaign merges land on the **integration branch the map records**, which is the default branch only when the campaign never named another one — so confirm each of those two PRs is based on that branch before merging it, rather than trusting the base `/my-command:pr` opened it with. A PR this run did not open is never merged. Never reach for `--admin`, never force-push, and never merge a red PR — a campaign is exactly where one bad merge is multiplied.

<!-- include-block: shared/merge-command-forms.md -->
### Merge command forms

The merge steps are where this pipeline's failed shell calls concentrate, and almost every one is a rejected merge re-issued verbatim. Read the error text and branch on it; never send the same call twice.

- **Merging a PR into the default branch** is `gh pr merge <number> --<method>`, issued **once**, and **never with `--delete-branch`**. That flag runs a local branch cleanup after the merge, which fails with `fatal: '<default>' is already used by worktree at …` on any device that keeps the default branch checked out — so the merge lands and the call still exits 1, reporting a failure for work that succeeded. Delete the branch as its own step instead — see the cleanup bullet below. Its rejections are states, not usage errors:
  - `Merge already in progress`, or a failing `mergePullRequest` GraphQL call — GitHub accepted a merge and is still processing it. **Do not re-issue it.** Read the outcome instead: `my-command-tools prs view <number>`, whose result already carries `state`, `mergedAt`, and `mergeStateStatus`. `MERGED` is success, and the run continues at its next step. Only a PR that settles back to `OPEN` is merged again, and then once.
  - Pending required checks — a wait, not a refusal. Re-issue the identical command **with `--auto`** and record the PR as queued.
  - `not mergeable`, `BLOCKED`, or `BEHIND` — the default branch moved. Run `/my-command:mc -t <branch>`, then retry the merge once.
  - Never reach for `--admin`, `gh api -X PUT .../merge`, or a `GH_TOKEN=` re-run to get past any of these.
- **Deleting a branch once its PR is merged** is `my-command-tools cleanup --branch <branch>`, and it replaces composing the local and remote deletions by hand. It settles both halves from the PR rather than from git's answer, which is what makes the two recurring post-merge errors unreachable rather than merely explained: a squash merge leaves no shared history, so `git branch -d` calls the branch unmerged and the verb deletes it on the PR's evidence instead; GitHub's auto-delete setting takes the remote ref at merge time, so the verb asks `git ls-remote` first and reports `already-absent` as an outcome rather than pushing a delete that exits 1. Its answer names both halves — read `local.reason` and `remote.reason` and move on. `local.reason: "not-merged"` is the one refusal that means something: no merged PR was found and the branch's commits exist nowhere else, so escalating to `git branch -D` by hand would discard them. `--keep-remote` and `--keep-local` skip a half deliberately. A worktree still holding the branch reports `checked-out` with the path; `my-command-tools worktree end --branch <branch>` removes that first.
- **Merging the default branch into a branch** addresses a worktree by path rather than by changing directory: `git -C <path> merge --no-edit origin/main`, `git -C <path> diff --name-only --diff-filter=U`, `git -C <path> push origin HEAD`. `cd <dir> && git …` is the recorded failure, because a worktree session is rarely where that path resolves. The toolkit takes the path as a flag for the same reason: `my-command-tools verify --cwd <path>`.
- A refusal that comes from the harness rather than from `gh` is final. Surface it and carry on with the rest of the run.
<!-- /include-block -->

## Notes

- **Never leave a ticket PR targeting the default branch.** Retarget it the moment `/my-command:pr` opens it. Only the planning PR and the campaign PR leave `wayfinder/<slug>`, and they target the campaign's **integration branch** rather than the default branch as such.
- **The integration branch and `--base` are two different things, and conflating them is the mistake this note exists to stop.** `--integration <branch>` is the campaign's: what `wayfinder/<slug>` is cut from and what the planning and campaign PRs merge into. `--base <branch>` is a ticket's: forwarded verbatim to the ticket runner as that one ticket's cut point. Naming one never sets the other. A campaign integrating with `release/2.0` still cuts its tickets from `wayfinder/<slug>`, and a ticket cut from somewhere unusual with `--base` changes nothing about where the campaign lands.
- **After start, the integration branch is read from the map and nowhere else.** Not from `state`, not from the flag, not from the branch that happens to be checked out. Re-deriving it is how a campaign resumed by a fresh agent quietly retargets itself at the default branch halfway through.
- **The Status column is the resuming agent's whole briefing, so keep it true.** A task left on `in-progress` by a run that stopped reads as live work and freezes the next agent out of it; a stopped task never given a status reads as `todo` and gets silently re-executed. However a ticket run ends short, write the status before the run is over — `paused`, `blocked-limit`, or `rejected` — and never re-execute a `rejected` one without a new decision from me. **A long unattended campaign pausing and resuming is a normal event, not an incident**: `paused` and `blocked-limit` are how that is recorded, and neither implies anything is wrong with the work.
- **No issues, no project board.** This command is the replacement for that flow, not a companion to it.
- **Mark done in place, don't archive.** A finished task's plan is marked done at the path it already occupies and distilled into the map's Completed log. It is never copied into an `archive/` or a `done/` directory: an archived plan is a second source of truth that immediately starts drifting, which is precisely why the marker goes in the file rather than the file going somewhere else. It is not deleted at completion either — it is kept for the campaign's life so a task can be restarted from what was *asked*, and the campaign's final `zz` ticket is what deletes every plan at the end. The closed campaign's map is removed once the repo's own docs carry the record.
- **Base every decision on live git state**, never a stale snapshot. Confirm the branch you are on before cutting another.
- **By default this command merges nothing** — I review and merge each PR. That is the documented default, not a limit of the command: `--unattended`, typed on the invocation that acts, is the one thing that authorises the planning, ticket, and campaign merges. Absent it, every PR this run opens is left open for me, and a run that merges without the flag typed on it has exceeded what it was asked to do. **The map's `**Unattended:** yes` never substitutes for the flag** — it authorises nothing on its own and no operation reads it as authorisation. Its only effect is on generation: it decides which closing block the map's kickoff prompt is written with, so the next agent to resume the campaign is told to type the flag. See `docs/adrs/0006-unattended-campaigns-resume-unattended.md`.
- **After start, the campaign's mode is read from the map, exactly like the integration branch** — and for the same reason. It is not re-derived from whether the current invocation carries `--unattended`: that flag says what *this run* may do, while the map's line says what the *campaign* was started as, and a `start` run's answer to the second is the one that has to survive into every session after it.
- If the request does not clearly name one of the five operations, ask me one focused question rather than guessing — starting a second wayfinder for a request that meant "add a task" is expensive to unwind.
- <!-- include: shared/approval-own-call.md -->**A command that may need approval goes in its own Bash call** — `git fetch`, `git config`, and, as a narrow exception to the general rule to chain dependent mutations, branch-lifecycle operations such as checkout/switch, pull, remote-branch inspection, and local branch deletion. Folding one into an `&&` chain escalates approval to the whole compound command and costs a turn plus a retry. Put status output, pipes, and follow-up verification in separate read-only calls.<!-- /include -->
- <!-- include: shared/gh-identity.md -->This device is logged in as more than one GitHub account, and `gh`'s GraphQL-backed writes (`gh pr create`, `gh pr edit`) authenticate as whichever one is active — so on a repo owned by another of them GitHub answers `must be a collaborator`. That is the wrong identity, not a permission to request, and the right account is not a guess: it is the remote's owner. `my-command-tools pr` resolves it internally and reports the `identity` that worked, so nothing extra is needed there. For any other `gh` write, ask the toolkit — `my-command-tools identity` names the `owner`, the `active` account, and the one plain `select` command, and `my-command-tools identity --select` runs it. **Never compose `GH_TOKEN="$(gh auth token --user <login>)" <command>`**: an assignment wrapping a command substitution is refused on shape, and it guesses at a login the remote already states.<!-- /include -->
- <!-- include: shared/refusal-final.md -->A refusal of a **PR merge or a remote-ref deletion is final.** Surface it to the human and carry on with the rest of the work. Re-expressing the same operation is refused for the same reason and costs a second turn: `gh api -X PUT .../pulls/N/merge` is `gh pr merge`, and `gh api --method DELETE .../git/refs/heads/...` is `git push origin --delete`, so neither is a narrow retry — nor is re-running one under `GH_TOKEN=...`.<!-- /include -->
- Report the operation, the map path, the branch, any PR link, and — under `--unattended` — which of those PRs this run merged. A start also names the integration branch it resolved and whether that came from `--integration` or the repo default; a close names the branch the campaign PR targets. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Close the run in a text-only turn

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

For this command: lead with which operation ran and what it changed — the integration branch, the base branch, and the planning PR on a start, the plan path on an add, the ticket PR on an execute, the map entry on a complete, the campaign PR on a close — or with what stopped the run.
