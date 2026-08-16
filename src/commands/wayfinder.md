---
description: Run a wayfinder — a named campaign of related work tracked as markdown plans in the repo rather than on an issue tracker: one base branch, a map of active tasks, one /task per ticket, and a summary appended as each lands
argument-hint: "[--unattended] [--here|-h] [--base <branch>] [--draft|-d] [--add|-a <command + prompt>[, <command + prompt>]] <start|add task|execute|complete|close> <description>"
---

A **wayfinder** is a named campaign of related work — several tasks that ship together — tracked entirely in markdown inside the repo. It exists to plan and execute a multi-task effort **without an issue tracker or project board**: fewer moving layers for an agent to keep in sync, and everything reviewable in a diff.

The request is the text in the `<command-args>` block above. Parse leading flags off the front; the remainder names the **operation** and its subject.

**Announce the operation you picked before acting** — start, add task, execute, complete task, or close — so the run reads as one of five things rather than as improvised branching.

**The git plumbing runs through `my-command-tools`.** Every verb prints JSON on stdout — read the fields rather than re-deriving them with your own `git` calls. `state` is where the default branch comes from: this command never hardcodes `main`. If the bare call answers `command not found`, the shim is not linked onto PATH — reach the same CLI at `~/.claude/my-command/toolkit/bin/my-command-tools` (or `~/.codex/my-command/toolkit/bin/my-command-tools`), run `doctor` through that path, and report the `onPath` fix it prints. Do not fall back to hand-rolled shell.

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
- `--base <branch>` — cut the ticket worktree from `<branch>` instead of the campaign base branch (the default is `wayfinder/<slug>`).
- `--draft` / `-d` — open the ticket PR as a draft. **Refused alongside `--unattended`**, which routes tickets through `/god`, and `/god` rejects `--draft` outright because a draft cannot merge. Stop and say to run the campaign without `--unattended` if the tickets are meant to stay in draft.
- `--add` / `-a` — weave extra commands into the ticket run, as a comma-separated list of `<command> <prompt>` entries.
- Anything not a recognized flag names the operation and its subject.

The ticket runner owns the authoritative semantics for every one of these — do not reinterpret them here.

### Owned here

- `--unattended` — authorise this run to merge the PRs it opens, and route ticket execution to `/god` instead of `/task`. **It must be TYPED on the invocation that acts, and it is never inherited.** Not from the map, not from the kickoff prompt the map carries, not from a command that invoked this one, and not from an earlier operation in the same campaign — a start run given the flag authorises nothing for the execute run that follows it. The reason is what a wayfinder is: it multiplies whatever it authorises, and **N unattended merges out of one invocation is a different risk from one**, which is exactly why `/manage` requires `--delegate god` to be typed rather than inherited. Absent the flag, this command opens PRs and merges nothing.
  - **Say in the opening announcement that this run will merge**, alongside the operation you picked, so an unattended run is never the thing a reader has to infer.

## Mental model

- One wayfinder = one **base branch** `wayfinder/<slug>`, cut from the repo's default branch.
- One wayfinder = one **map** file `<plans>/wayfinder-<slug>.md` listing its active tasks and logging its completed ones.
- Each task = one **plan** file `<plans>/<slug>-NN-<task-slug>.md` and one branch `task/<slug>-NN-<task-slug>` cut from the base branch. **Every ticket PR targets the base branch — never the default branch.**
- `<plans>` is the repo's own plans directory — `docs/plans/` where the repo has one, otherwise the directory its docs convention names. Resolve it once at the start operation and record it in the map; do not invent a second location later in the campaign.
- Everything under `<plans>` for a wayfinder is **ephemeral scaffolding**. The durable record is the merged code plus the repo's own feature, spec, and decision docs. When the wayfinder closes, the map and every plan it created are deleted.

```
<default branch>
 └── wayfinder/<slug>            (base branch — accumulates every ticket)
      ├── task/<slug>-01-...     (/task --base wayfinder/<slug>)
      ├── task/<slug>-02-...     (/task --base wayfinder/<slug>)
      └── ...                    → one PR wayfinder/<slug> → default branch at the end
```

Exactly two PRs legitimately target the default branch: the **planning PR** at start, which lands the map and its tickets so agents can read them, and the **campaign PR** at close, which lands the built code. Neither is a batch merge — each is one branch with one PR.

## Steps

1. **Read the live state first.** `my-command-tools state` gives the branch, the `defaultBranch`, and the worktree — never work from the session's startup snapshot. If a map already exists, read it before deciding anything; the map, not memory, says which tasks are active.
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

## Operations

### 1. Start a wayfinder

1. Pick a short kebab-case **slug** (e.g. `auth-revamp`). Confirm it with me if the request is ambiguous.
2. Cut the base branch from the up-to-date default branch. `my-command-tools state` names that branch; do not assume it is `main`.
3. Create the map at `<plans>/wayfinder-<slug>.md` from the **Map template** below, including an instantiated **Agent kickoff prompt**.
4. Create the task plans you can specify now with **Add a task**, so the tickets land alongside the map rather than trickling in later.
5. Regenerate the docs index (see *Index upkeep*) and commit the map plus its plans on the base branch.
6. **Open the planning PR with `/pr`**, from the base branch, while the branch still holds only that planning commit — so the PR carries the scaffolding and no task code. **By default do not mark it draft and do not merge it yourself** — I review every PR, and that default holds for every run without `--unattended`. **With `--unattended` typed on this invocation, merging the planning PR is authorised**: wait for it to be green and merge it yourself. Either way it has to land before any ticket branch is cut, so the default branch carries the plans agents read.
7. Report the base branch, the map path, the planning-PR link, and the kickoff prompt.

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

Execute the next unblocked active task from the map. Read its linked plan completely, mark it in
progress, then run the task workflow against the plan's criteria with the campaign base branch as
its base, so the work happens in an isolated worktree and is carried through cleanup and a pull
request. Retarget that pull request to the campaign base branch if the task workflow opened it
against the default branch. Follow every repository verification, documentation, and visual-proof
requirement.

When reporting back, include the task completed, verification results, the pull-request link, and
any remaining risks or decisions. Stop after opening the pull request so a human can review it.
Never merge it, and never leave it targeting the default branch.
```
````

Use this workflow's own repo-relative location for `<workflow-path>`. If every active task is blocked, report the blocking dependency instead of starting unrelated work. If none remain, report that the campaign is ready to close.

**The kickoff prompt never carries `--unattended`, and its "stop after opening the pull request" line is written as-is even for a campaign started with the flag.** The prompt is pasted into some later agent's session, which is precisely the inheritance path the flag refuses: whoever runs that prompt types the flag themselves or gets the reviewed default.

### 2. Add a task to the wayfinder

1. Read the map for the next task number `NN`.
2. Write the plan to `<plans>/<slug>-NN-<task-slug>.md` — pass that exact path, so it lands beside the map rather than at whatever default filename a planning tool would choose. State the task's criteria plainly enough that `/task` can be handed them unedited.
3. Add a row to the map's **Active tasks** table: number, task slug, plan link, branch `task/<slug>-NN-<task-slug>`, status `todo`.
4. Regenerate the docs index. Report the new task and its plan path.

### 3. Execute a task

**Ticket execution is an existing command, not hand-rolled implementation.** That command owns the worktree, the bootstrap, the verification, the commits, `/clean`, and `/pr`. Reimplementing any of that here is how a ticket ends up unverified or on the wrong branch.

**Which command is the flag's doing, and nothing else's:**

- **Default — `/task`.** It stops at an open, reviewed PR and leaves me the merge.
- **`--unattended` — `/god`.** It runs that same `/task` pipeline and adds the last mile: conflicts resolved, CI waited on, the ticket PR retargeted onto its merge target and merged there. That merge target must be named with `--into`, or it is the default branch.

1. Read the task's plan in full.
2. Mark the task `in-progress` in the map.
3. Invoke the runner with the campaign base and any forwarded flags:
   ```text
   /task --base wayfinder/<slug> [forwarded flags] <the plan's criteria>
   /god --base wayfinder/<slug> --into wayfinder/<slug> [forwarded flags] <the plan's criteria>   # --unattended only
   ```
   **`--base` and `--into` are both required on the `/god` form, and neither implies the other.** `--base` is the cut point; `--into` is the merge target. Absent `--into`, `/god`'s merge target is the default branch — and it *retargets the PR onto that target before merging*, so a ticket run without it merges into the default branch no matter what this command did to the PR's base beforehand. **A ticket that cannot be given `--into` is a stop, not a merge.**
4. `/pr` targets the default branch by design, so **retarget the ticket PR to the base branch** as soon as it exists:
   ```bash
   gh pr edit <number> --base wayfinder/<slug>
   ```
   Confirm the retarget landed — a ticket left pointing at the default branch is the one failure this command cannot absorb.
   - **Under `--unattended` this step is `/god`'s, not mine.** `--into wayfinder/<slug>` makes the campaign base its merge target, and `/god` retargets the PR onto that target itself, before it merges. Retargeting from out here would be too late anyway: `/god` merges before it returns. Confirm from `/god`'s own report that the ticket PR was merged into `wayfinder/<slug>`.
5. **By default, do not merge it — I review every PR.** That is this command's documented default rather than a limit of the operation. **With `--unattended`, the ticket merge is authorised** and `/god` performs it against the retargeted base as part of its own run; there is nothing left to merge here.

### 4. Complete a task

Run this after a ticket's PR merges into the base branch. This is the operation that keeps the map honest.

1. Make sure the base branch actually carries the merged work before recording it as done.
2. **Delete the plan file** — `git rm <plans>/<slug>-NN-<task-slug>.md`.
3. **Append a summary** to the map's **Completed** section from the **Completed entry template** below. Describe what was *actually built*, not what the plan proposed — the deviations are the part worth keeping.
4. **Remove the task's row** from **Active tasks**.
5. Regenerate the docs index and commit the map edit and the deletion together on the base branch.

### 5. Close the wayfinder

Run when every task is complete and the durable docs exist.

1. Confirm each completed task produced its durable artifacts in the repo's own docs — the feature, spec, or decision doc the change owes. The map's Completed log is scaffolding, not the deliverable.
2. Open **one** PR from `wayfinder/<slug>` to the default branch with `/pr`, summarizing the whole campaign and linking the map's Completed log. **By default, do not merge it — I review it**, and that default holds for every run without `--unattended`. **With `--unattended` typed on this invocation, merging the campaign PR is authorised** once it is green.
3. **After that PR merges**, retire the scaffolding: delete the map and every `<plans>/<slug>-*.md` plan, regenerate the docs index, and commit as `chore: retire <slug> wayfinder scaffolding` — folded into the campaign PR if it has not merged yet, otherwise as a small follow-up PR. Then delete the base branch locally and on origin.

## Map template

Write to `<plans>/wayfinder-<slug>.md`, carrying whatever frontmatter the repo's docs bundle requires:

```markdown
# Wayfinder — <Human Name>

**Slug:** `<slug>`
**Base branch:** `wayfinder/<slug>` (cut from the default branch; every ticket PR targets it)
**Plans directory:** `<plans>`
**Started:** YYYY-MM-DD
**Goal:** <one sentence — what this campaign ships>

> Ephemeral scaffolding. This file and every `<slug>-*.md` plan beside it are deleted when the
> wayfinder closes. The durable output is the merged code and the repo's feature and spec docs.

## Active tasks

| # | Task | Plan | Branch | Status |
|---|------|------|--------|--------|
| 01 | <task slug> | [<slug>-01-...](<slug>-01-....md) | `task/<slug>-01-...` | todo |

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

Three merges are authorised, and no more: the **planning PR** at start, each **ticket PR** (performed by `/god` inside the ticket run, into the `--into wayfinder/<slug>` merge target it was given), and the **campaign PR** at close. A PR this run did not open is never merged. Never reach for `--admin`, never force-push, and never merge a red PR — a campaign is exactly where one bad merge is multiplied.

<!-- include-block: shared/merge-command-forms.md -->
### Merge command forms

The merge steps are where this pipeline's failed shell calls concentrate, and almost every one is a rejected merge re-issued verbatim. Read the error text and branch on it; never send the same call twice.

- **Merging a PR into the default branch** is `gh pr merge <number> --<method>`, issued **once**, and **never with `--delete-branch`**. That flag runs a local branch cleanup after the merge, which fails with `fatal: '<default>' is already used by worktree at …` on any device that keeps the default branch checked out — so the merge lands and the call still exits 1, reporting a failure for work that succeeded. Delete the branch as its own step instead: `my-command-tools worktree end --branch <branch>` for the local worktree and branch, and `git push origin --delete <branch>` for the remote ref, each in its own call. Its rejections are states, not usage errors:
  - `Merge already in progress`, or a failing `mergePullRequest` GraphQL call — GitHub accepted a merge and is still processing it. **Do not re-issue it.** Read the outcome instead: `my-command-tools prs view <number>`, whose result already carries `state`, `mergedAt`, and `mergeStateStatus`. `MERGED` is success, and the run continues at its next step. Only a PR that settles back to `OPEN` is merged again, and then once.
  - Pending required checks — a wait, not a refusal. Re-issue the identical command **with `--auto`** and record the PR as queued.
  - `not mergeable`, `BLOCKED`, or `BEHIND` — the default branch moved. Run `/mc -t <branch>`, then retry the merge once.
  - Never reach for `--admin`, `gh api -X PUT .../merge`, or a `GH_TOKEN=` re-run to get past any of these.
- **Merging the default branch into a branch** addresses a worktree by path rather than by changing directory: `git -C <path> merge --no-edit origin/main`, `git -C <path> diff --name-only --diff-filter=U`, `git -C <path> push origin HEAD`. `cd <dir> && git …` is the recorded failure, because a worktree session is rarely where that path resolves. The toolkit takes the path as a flag for the same reason: `my-command-tools verify --cwd <path>`.
- A refusal that comes from the harness rather than from `gh` is final. Surface it and carry on with the rest of the run.
<!-- /include-block -->

## Notes

- **Never leave a ticket PR targeting the default branch.** Retarget it the moment `/pr` opens it. Only the planning PR and the campaign PR belong there.
- **No issues, no project board.** This command is the replacement for that flow, not a companion to it.
- **Delete on completion, don't archive.** A finished task's plan is removed and distilled into the map's Completed log; the closed campaign's map is removed once the repo's own docs carry the record. An archived plan is a second source of truth that immediately starts drifting.
- **Base every decision on live git state**, never a stale snapshot. Confirm the branch you are on before cutting another.
- **By default this command merges nothing** — I review and merge each PR. That is the documented default, not a limit of the command: `--unattended`, typed on the invocation that acts, is the one thing that authorises the planning, ticket, and campaign merges. Absent it, every PR this run opens is left open for me, and a run that merges without the flag typed on it has exceeded what it was asked to do.
- If the request does not clearly name one of the five operations, ask me one focused question rather than guessing — starting a second wayfinder for a request that meant "add a task" is expensive to unwind.
- <!-- include: shared/approval-own-call.md -->**A command that may need approval goes in its own Bash call** — `git fetch`, `git config`, and, as a narrow exception to the general rule to chain dependent mutations, branch-lifecycle operations such as checkout/switch, pull, remote-branch inspection, and local branch deletion. Folding one into an `&&` chain escalates approval to the whole compound command and costs a turn plus a retry. Put status output, pipes, and follow-up verification in separate read-only calls.<!-- /include -->
- <!-- include: shared/gh-identity.md -->This device is logged in as more than one GitHub account, and `gh`'s GraphQL-backed writes (`gh pr create`, `gh pr edit`) authenticate as whichever one is active — so on a repo owned by another of them GitHub answers `must be a collaborator`. That is the wrong identity, not a permission to request, and the right account is not a guess: it is the remote's owner. `my-command-tools pr` resolves it internally and reports the `identity` that worked, so nothing extra is needed there. For any other `gh` write, ask the toolkit — `my-command-tools identity` names the `owner`, the `active` account, and the one plain `select` command, and `my-command-tools identity --select` runs it. **Never compose `GH_TOKEN="$(gh auth token --user <login>)" <command>`**: an assignment wrapping a command substitution is refused on shape, and it guesses at a login the remote already states.<!-- /include -->
- <!-- include: shared/refusal-final.md -->A refusal of a **PR merge or a remote-ref deletion is final.** Surface it to the human and carry on with the rest of the work. Re-expressing the same operation is refused for the same reason and costs a second turn: `gh api -X PUT .../pulls/N/merge` is `gh pr merge`, and `gh api --method DELETE .../git/refs/heads/...` is `git push origin --delete`, so neither is a narrow retry — nor is re-running one under `GH_TOKEN=...`.<!-- /include -->
- Report the operation, the map path, the branch, any PR link, and — under `--unattended` — which of those PRs this run merged. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**Every run states its outcome on the way out, and *how* it states it depends on how this run was invoked.** One mechanic decides all three cases: in Claude Code an assistant message carrying text and **zero tool calls** ends the assistant's turn and hands control back to the user. That is what records a run's outcome — and it is also what strands a parent pipeline when a nested run spends one, because the parent's remaining steps never get a turn to run in.

**Tell which of the three cases this run is in before composing anything, from how it was invoked:**

- **Outermost** — the user invoked this command directly, as the prompt this turn is answering. No other command run encloses it. It **closes in a text-only turn**.
- **Nested inline** — another command invoked this one with the `Skill` tool in this same session, as a step of its own pipeline, and that parent still has steps owed once this one returns. It **hands back without spending a text-only turn**.
- **Subagent** — this run was dispatched with the `Agent` tool (`--sub`, a delegated unit, any Agent-tool dispatch). It has its own conversation, and its final message is a report *to* the parent session rather than a turn *in* the parent's conversation, so nothing of the parent's is waiting behind it. It **closes in a text-only turn**, exactly like an outermost run.

**Outermost and subagent: close in a text-only turn. Never skipped, never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

**Nested inline: hand back without spending a text-only turn.** Emit the report and the return marker as **text in the same assistant message that carries the parent's next tool call**, so the turn continues into the parent's next step instead of ending and returning control to the user. A nested run that closes in a text-only turn strands every step its parent still owes — the recorded failure is a `/clean` and a `/pr` nested in one pipeline, where each child's text-only close handed control back before the parent could invoke the next child, run its teardown, or record its own outcome, leaving a live run reading as abandoned. So do not compose a message of text alone here, and do not stop to let the parent speak: say what this run did, write the marker, and make the parent's next call in that same message. The parent's own closing turn is the one that records the outcome for both.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes; which of the three cases applies does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available. A nested run that stopped early still hands back in the parent's turn — it reports the stop as text beside the parent's next call, and the parent decides whether to carry on.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line, in all three cases:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Written **exactly once**, on the last line of the message that hands control back, whether that message is a text-only close or a nested handback riding the parent's next tool call. The marker is the only record of where a run handed control back, so it is never weakened, deferred to a later message, or dropped because the turn continues: without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. That is true even inside a nested run: my message is addressed to the session, not to whichever command currently holds it. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never the dispatching run's turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close that run in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it — in the two closing cases.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of an outermost or subagent run and swallow the outcome. The nested handback is the deliberate exception and the only one: there the report rides the parent's **next** call, which is what keeps the parent's turn alive.
<!-- /include-block -->

For this command: lead with which operation ran and what it changed — the base branch and planning PR on a start, the plan path on an add, the ticket PR on an execute, the map entry on a complete, the campaign PR on a close — or with what stopped the run.
