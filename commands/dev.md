---
description: Take one complex idea all the way to merged, unattended — grill it against the repo's specs and ADRs, record every decision /my-command:dev made as a real ADR, chart it as a wayfinder campaign, build the tickets in waves through /my-command:manage, and land the campaign PR
argument-hint: "[--slug <s>] [--parallel|-p <n>] [--sequential] [--rounds <n>] [--dry-run|-n] [--no-grill] <complex idea> | --resume <slug>"
---

Take **one complex idea** and drive it to merged into the default branch with **no human in the loop**. This command composes the existing suite — `/my-command:wayfinder` charts and tracks, `/my-command:manage` schedules, `/my-command:god` merges, `/my-command:task` implements — and **reimplements none of it**. It cuts no branch, writes no ticket code, opens no PR itself, and issues no merge of its own: every one of those already has an owner, and a second owner corrupts the run.

What it does own is the part nothing else covers: **the decisions it makes on the human's behalf, and the record of them**. An unattended run of this size makes calls a human would otherwise make, and a call made in passing and never written down is the failure this command exists to prevent.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the **idea**.

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

- `--slug <s>` — the campaign slug handed to `/my-command:wayfinder start`. Absent it, `/my-command:wayfinder` picks one.
- `--parallel <n>` / `-p <n>` — cap how many tickets are in flight at once. Forwarded to `/my-command:manage`, whose **hard cap is 8**; a larger value is clamped there and the clamp is reported.
- `--sequential` — one ticket at a time regardless of file-scope independence. The escape hatch from waves, and forwarded to `/my-command:manage` as its own `--sequential`.
- `--rounds <n>` — override the grill's 12-round cap.
- `--dry-run` / `-n` — grill the idea, print the campaign it would chart (the tickets, the waves, the branch names the map would own, and every decision it would record as an ADR), then **stop**. No ADR is written, no branch is cut, no PR is opened, and nothing is dispatched.
- `--no-grill` — skip phase 1 entirely. The idea goes straight to charting, and no decision ADR comes out of a grill that never ran.
- `--resume <slug>` — resume the surviving campaign named by `<slug>`. Mutually exclusive with an idea: see *Resume is always explicit*.
- Anything not a recognized flag is part of the idea.

**Resume is always explicit.** `/my-command:dev <idea>` **always starts a new campaign**. It never reads the plans directory looking for a map whose goal resembles the idea, and it never infers that an idea it was handed is a continuation of something already in flight. Resuming is `--resume <slug>` and nothing else. An inferred resume silently appends tickets to a campaign the human never named, and there is no human in this run to catch it.

## Step 1 — Settle the run before anything is spawned

**Never ask me a question.** This command runs unattended end to end. Where a decision is missing, it is **decided and recorded** (Step 3), not deferred. Where a precondition is genuinely unmet — no git repo, an unresolvable command, `--resume` naming a slug with no map — stop and say what is missing.

1. `my-command-tools state` — one call gives `branch`, `defaultBranch`, `root`, and `worktree`. **The default branch comes from that call**; this command never hardcodes `main`. `<default branch>` below means that value.
2. Resolve every command this run composes — `/my-command:wayfinder`, `/my-command:manage`, `/my-command:god`, `/my-command:pr` — from what is actually installed on this device, the way `/my-command:task` Step 0 resolves an added command. An unresolvable one is a stop, not a workaround.
3. Under `--resume <slug>`, read the surviving map at `<plans>/wayfinder-<slug>.md` **before deciding anything** and jump to Step 6. The map, not memory, says which tickets are done.
4. Confirm the idea is genuinely complex. An idea that charts into fewer than three tickets is not worth this pipeline — say so and name the single `/my-command:task` or `/my-command:god` invocation that does the job.

## Step 2 — Grill the idea

Skipped entirely under `--no-grill`.

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

That applies to the grill's own reading: `docs/specs/index.md`, `docs/adrs/index.md`, and every spec or ADR an answer is grounded in are enumerated from those two indexes and read in one turn, not one file per round.

**Spawn exactly ONE griller, and keep it alive for the whole grill.**

- The first round is one `Agent` call: a **read-only** adversarial griller, handed the idea, the repo's okq specs index (`docs/specs/index.md`), and the ADR index (`docs/adrs/index.md`).
- **Every round after that is a `SendMessage` to that same agent.** Never a fresh `Agent` call per round. A fresh griller re-derives the whole repo context every round, so the context is paid for once per round instead of once per grill, and the questions restart from a reading that has already been answered.
- `SendMessage` resumes that agent and returns as soon as the send is accepted; **the griller's reply arrives afterwards, as a task notification, not as the tool call's return value**. So a round is: send, let the call return, wait for the notification, then answer. Do not read the send's acknowledgement as the answer.

**The griller asks ONE question at a time**, mirroring the `grilling` skill, which is explicit that multiple questions at once are bewildering. The reason is sharper than politeness: **batching questions lets a weak answer hide among strong ones**, and the weak answer is exactly the one that becomes an unrecorded decision. Tell the griller so in its spawn prompt, and hold it to one question per round.

**Answer every question, and ground every answer in this repo.** An answer cites the okq spec or ADR it comes from **by path** — `docs/specs/adding-a-command.md`, `docs/adrs/0003-dirty-flag-for-doc-density.md` — and quotes or paraphrases what that document actually says. A fact the repo already holds is looked up, never guessed at and never asked about.

**The grill is ONE pass, on the IDEA ONLY.** It stress-tests what is being built and why — not the decomposition the idea later charts into, not a ticket's implementation, and not the plan `/my-command:wayfinder` writes. There is no second grill of the resulting tickets.

**It ends at the first of two things:** the griller declares it has no open questions, or **12 rounds** have run. `--rounds <n>` replaces the 12. Then the griller is done — do not send it another round for anything except the one bounded re-grill in Step 6.

## Step 3 — Record every decision this run made as a real ADR

This is the central requirement of this command, not a bookkeeping tail.

**An answer this run could not ground in an existing spec or ADR is a decision this run made itself.** That is the whole test. If Step 2 answered a question from `docs/specs/…` or `docs/adrs/…`, the repo decided it. If the answer came from judgement, it is **this command's** decision, made in a run with no human in it.

**Record it immediately as a real ADR in `docs/adrs/`, committed alongside the work that depends on it — NEVER only in the wayfinder map.** The map is ephemeral scaffolding: `/my-command:wayfinder` deletes it and every plan beside it when the campaign closes. A decision recorded only there is deleted at exactly the moment the code that depends on it lands, which is the point at which someone first needs it.

Each such ADR carries, in its frontmatter:

```yaml
decided-by: /my-command:dev
ratified: false
wayfinder: <slug>
grill-round: <n>
```

and, where it applies:

```yaml
needs-human: true
```

- Its **Status** section states plainly that the decision was **proposed by `/my-command:dev` and has not been ratified by a human**.
- Its **Context** section **quotes the griller's question verbatim**, so the reader sees the question that forced the call rather than a summary of it.
- `needs-human: true` marks a decision that **also looks like a human's call to make** — a product choice, a naming or interface commitment, anything irreversible — as opposed to an implementation detail this run was right to settle. When in doubt, mark it: an over-marked decision costs a line in a PR body, an under-marked one ships a product call nobody chose.

**This command NEVER blocks and NEVER asks me a question.** It decides, marks the ADR, and carries on. **The campaign PR body then LEADS with the list of `needs-human` decisions** (Step 7), so the human's review is the place those calls actually get made — which is what makes deciding-and-recording safe rather than presumptuous.

**No tooling change is needed for any of these keys, and they are queryable.** ADR 0003 (`docs/adrs/0003-dirty-flag-for-doc-density.md`) established it for the `dirty` flag: `okq validate` accepts frontmatter keys beyond the OKF core, and `okq --bundle docs find --where <KEY=VALUE>` matches arbitrary keys, with an unset key matching nothing rather than erroring. So the convention rides on behaviour that already exists — `okq --bundle docs find --where ratified=false` lists everything this run decided, and `--where needs-human=true` narrows it to the calls a human still owes.

<!-- include-block: shared/rewrite-toward.md -->
### Rewrite toward

These govern **how a sentence you are already shortening comes out**. They are not a license to rewrite voice — the `Never rewrite for voice` rule still holds — and they are not a reason to touch a sentence you were not otherwise cutting.

- **One instruction per sentence.** Split a sentence carrying two.
- **One term per concept.** Reuse the doc's existing word every time it appears. A synonym introduced for variety reads as a second thing.
- **The warning before the step it guards.** A caveat trailing its instruction arrives after the reader has acted.
- **Active voice, imperative for an action.** "Run the gate", not "the gate should be run" — the passive drops the actor, and the actor is usually the claim.
- **Literal over idiomatic.** Replace "paper over", "silently under-check", "fakes a pass" with what they actually mean.
- **At most three nouns in a row.** Break a longer cluster with `of` or `for`.
- **Explicit conjunction scope.** "Never do A or B" leaves how far the negation reaches ambiguous. Name each side.
- **Uppercase MUST / MUST NOT / SHOULD / MAY** where the obligation is the point ([RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)). Preserve the doc's existing force; never soften or strengthen it to fit the form.

Deliberately **not** adopted from [ASD-STE100](https://asd-ste100.org) Simplified Technical English, which these rules are drawn from: its closed ~900-word dictionary, its sentence-length caps, and its restriction to simple tenses. Those serve a human reader with a limited English vocabulary. Here they cost precision and buy nothing.
<!-- /include-block -->

Those govern the ADR prose this step writes. They are not a licence to rewrite an ADR that already exists.

## Step 4 — Chart the campaign

**Invoke `/my-command:wayfinder start` DIRECTLY — not through `/my-command:manage`.** `/my-command:manage` plans a branch name per unit, and the wayfinder map already owns those names. Routing the charting through it would give one campaign two branch-naming authorities, and the map would lose.

```text
/my-command:wayfinder --unattended start [--slug <s>] <the idea, as grilled>
```

`/my-command:wayfinder start` writes the campaign map and its task plans and **opens the planning PR through `/my-command:pr`**. That planning PR merges to the default branch:

```text
/my-command:god --into <default branch> <merge the planning PR>
```

`--into` names the **merge target** and `--base` names the **cut point**; neither implies the other, so the planning merge names the default branch explicitly. The planning PR has to land before any ticket branch is cut, so the default branch carries the plans the ticket runs read.

Under `--dry-run` / `-n`, print the charted campaign and **stop here** — before the map is written, before the branch is cut, before any ADR from Step 3 is committed.

## Step 5 — Build the tickets

**Hand `/my-command:manage` the ticket set and nothing else.** Not the idea, not the grill, not the decomposition — `/my-command:wayfinder` already did the decomposing, and the map owns the branch names. `/my-command:manage`'s job here is **scheduling**: lanes, waves, the concurrency cap, and collecting the results.

**One unit per ticket, and each unit is one `/my-command:wayfinder` invocation:**

```text
/my-command:wayfinder --unattended execute NN
```

`--unattended` is **typed into every unit's invocation**, because it is never inherited — not from this command, not from the map, not from the campaign's start operation. That is what routes ticket execution to `/my-command:god` and authorises the ticket merge.

Do not type `--delegate`, `--base`, or `--into` on the `/my-command:manage` invocation. Each ticket lands on the campaign base branch because `/my-command:wayfinder` passes it through itself:

```text
/my-command:god --base wayfinder/<slug> --into wayfinder/<slug> <the plan's criteria>
```

— the campaign base named twice, once as the cut point and once as the merge target. A ticket that cannot be given `--into` is a stop, not a merge into the default branch.

**Waves are the DEFAULT.** Run as many tickets in parallel as the **file-scope lanes** allow, bounded by `/my-command:manage`'s existing hard cap of **8**. Two tickets editing one file on a shared base branch is a conflict this run would pay **unattended, with no human at the merge** — which is why the lanes are the bound rather than the ticket count. `--sequential` is the escape hatch; `--parallel <n>` caps concurrency below the lanes. Both forward to `/my-command:manage` untouched.

A campaign of fewer than three tickets goes straight to `/my-command:wayfinder --unattended execute NN`, one ticket at a time, with no `/my-command:manage` in the middle: `/my-command:manage` documents that a goal decomposing into fewer than three units is not worth an orchestrator.

**Then complete each landed ticket**, one invocation per ticket, after its PR has merged into the campaign base:

```text
/my-command:wayfinder complete NN
```

That is what deletes the ticket's plan, appends what was *actually built* to the map's Completed log, and drops its Active tasks row. A ticket that merged but was never completed leaves the map claiming work that is already done.

## Step 6 — Failure handling, bounded at one round

`/my-command:manage` already spends **at most one retry** on a failed unit. When that retry also fails, this command spends **exactly ONE additional round** on that ticket:

1. **Re-grill the ticket** — one `SendMessage` to the same griller from Step 2, carrying the ticket and the cause of the failure.
2. **Re-plan it** — update its plan file through `/my-command:wayfinder`.
3. **Re-dispatch it** — one more `/my-command:wayfinder --unattended execute NN`.

**One round, and no more.** `/my-command:manage` documents why: an orchestrator that re-plans until everything succeeds does not terminate, and the second re-plan is where a run stops being able to say what it did.

**If that round also fails, FALL BACK.** The campaign does not vanish and it does not merge:

- **`/my-command:wayfinder close` still runs**, so there is a campaign PR for a human to review.
- **Do NOT merge it** to the default branch. No `/my-command:god --into <default branch>`.
- **Do NOT retire the wayfinder scaffolding.** The map and the failed ticket's plan are kept alive — deleting them is what makes the campaign unresumable.
- **Report**: which ticket failed, its cause, both rounds spent, the campaign PR, and `--resume <slug>` as the way back in.

**`/my-command:dev --resume <slug>`** then reads that surviving map, **skips the tickets already recorded complete**, re-dispatches the outstanding ones through Step 5, and closes through Step 7. It re-grills nothing and writes no new campaign.

## Step 7 — Land the campaign

```text
/my-command:wayfinder --unattended close
```

`/my-command:wayfinder close` opens the **campaign PR** through `/my-command:pr` from `wayfinder/<slug>` to the default branch, and this merges it:

```text
/my-command:god --into <default branch> <merge the campaign PR>
```

**The campaign PR body LEADS with the `needs-human` decisions.** Before the merge, read the body `/my-command:pr` wrote and confirm the list from Step 3 is at the top of it — every ADR carrying `needs-human: true`, each as its path and its one-line decision. `okq --bundle docs find --where needs-human=true` is the list. If the body does not lead with it, edit the body so it does, then merge. A human's review of this run is the only place those calls get made, and a list buried under a change summary is not a review.

<!-- include-block: shared/merge-command-forms.md -->
### Merge command forms

The merge steps are where this pipeline's failed shell calls concentrate, and almost every one is a rejected merge re-issued verbatim. Read the error text and branch on it; never send the same call twice.

- **Merging a PR into the default branch** is `gh pr merge <number> --<method>`, issued **once**, and **never with `--delete-branch`**. That flag runs a local branch cleanup after the merge, which fails with `fatal: '<default>' is already used by worktree at …` on any device that keeps the default branch checked out — so the merge lands and the call still exits 1, reporting a failure for work that succeeded. Delete the branch as its own step instead: `my-command-tools worktree end --branch <branch>` for the local worktree and branch, and `git push origin --delete <branch>` for the remote ref, each in its own call. Its rejections are states, not usage errors:
  - `Merge already in progress`, or a failing `mergePullRequest` GraphQL call — GitHub accepted a merge and is still processing it. **Do not re-issue it.** Read the outcome instead: `my-command-tools prs view <number>`, whose result already carries `state`, `mergedAt`, and `mergeStateStatus`. `MERGED` is success, and the run continues at its next step. Only a PR that settles back to `OPEN` is merged again, and then once.
  - Pending required checks — a wait, not a refusal. Re-issue the identical command **with `--auto`** and record the PR as queued.
  - `not mergeable`, `BLOCKED`, or `BEHIND` — the default branch moved. Run `/my-command:mc -t <branch>`, then retry the merge once.
  - Never reach for `--admin`, `gh api -X PUT .../merge`, or a `GH_TOKEN=` re-run to get past any of these.
- **Merging the default branch into a branch** addresses a worktree by path rather than by changing directory: `git -C <path> merge --no-edit origin/main`, `git -C <path> diff --name-only --diff-filter=U`, `git -C <path> push origin HEAD`. `cd <dir> && git …` is the recorded failure, because a worktree session is rarely where that path resolves. The toolkit takes the path as a flag for the same reason: `my-command-tools verify --cwd <path>`.
- A refusal that comes from the harness rather than from `gh` is final. Surface it and carry on with the rest of the run.
<!-- /include-block -->

Then let `/my-command:wayfinder` retire its own scaffolding — the map and every plan — as its close operation already documents. This command deletes none of it by hand.

## Nesting

`/my-command:dev` → `/my-command:manage` → `/my-command:wayfinder` → `/my-command:god` → `/my-command:task` → `/my-command:clean` + `/my-command:pr` + `/my-command:review` is **six levels of nesting**, and this repo's closing-turn contract holds at **every** level. A nested run that spends a text-only turn ends the whole assistant turn and strands every step its parent still owes — a recorded failure in this repo, not a hypothetical.

So each level tells its own case apart, and being deep in a stack changes nothing about which case applies:

- **This command, invoked by me directly**, is outermost and closes in a text-only turn.
- **This command, dispatched as a subagent**, closes in a text-only turn too — its final message is a report *to* the dispatching session, so nothing of that session's is waiting behind it.
- **This command, invoked inline by another command with the `Skill` tool**, hands back without spending a text-only turn.
- **A command this run invokes inline** is nested and hands back; **a command this run dispatches as a subagent**, and the griller, both close in turns of their own — and **a subagent's report is never this run's turn**. After the griller's notification arrives, and after `/my-command:manage` returns, this run still owes its own closing message.

A subagent can itself spawn a subagent and then continue it with `SendMessage`, which is what makes the long-lived griller work when `/my-command:dev` is itself running as a subagent. That was verified as an experiment rather than assumed.

## Notes

- **This command implements nothing.** No branch, no commit, no PR, no merge, no worktree teardown, no plan file written by hand. `/my-command:wayfinder` owns the map and the plans, `/my-command:manage` owns the schedule, `/my-command:god` owns the merge, `/my-command:task` owns the implementation.
- **Never batch-merge the ticket branches onto the default branch.** The campaign base branch *is* the integration branch, and the campaign PR is the one PR off it.
- **A decision made and not recorded is the failure mode of this command**, more than a failed ticket is. A failed ticket is visible in the report; an unrecorded decision is invisible until someone hits it.
- **Never merge a red PR, never force-push, never reach for `--admin`.** A campaign multiplies whatever it authorises.
- <!-- include: shared/approval-own-call.md -->**A command that may need approval goes in its own Bash call** — `git fetch`, `git config`, and, as a narrow exception to the general rule to chain dependent mutations, branch-lifecycle operations such as checkout/switch, pull, remote-branch inspection, and local branch deletion. Folding one into an `&&` chain escalates approval to the whole compound command and costs a turn plus a retry. Put status output, pipes, and follow-up verification in separate read-only calls.<!-- /include -->
- Report the campaign slug, the map path, every ticket and its outcome, the `needs-human` decisions, and the campaign PR. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Step 8 — Close the run in a text-only turn

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

For this command: lead with whether the campaign **merged into the default branch**, was **left open for review** after the bounded failure round, or **stopped** before charting. Then the slug, the ticket outcomes, the ADRs this run wrote — naming the `needs-human` ones first — and, on a fallback, `--resume <slug>` as the way back in.
