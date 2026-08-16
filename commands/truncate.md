---
description: Rewrite-for-style pass over a doc bundle via /my-command:task — cut docs down to high-signal tokens without losing a single claim
argument-hint: "[--here|-h] [--base <branch>] [--bundle|-b <dir>] [--all|-A] [--dry-run|-n] [--yes|-y] [doc id / path / topic to scope to]"
---

Make this repo's docs lean. A doc earns its tokens by carrying claims a reader can act on — flags, defaults, paths, behavior, the non-obvious constraint. Everything else is packaging: narration, restated headings, justification nobody asked for, the same mechanism explained three times in three sections. This command strips the packaging and leaves the claims **exactly** as they were.

This is the density pass [docs](docs.md) runs after reconciliation. `/my-command:docs` owns the whole correctness-then-density flow in one task; standalone `/my-command:truncate` runs the same claim-preserving rules for hand edits, an explicit scope, or a whole-bundle sweep without reconciling first.

The two are wired together by a `dirty` frontmatter flag: `/my-command:docs` marks every doc it refreshes or adds as `dirty: true`, then consumes the resulting queue in its final phase. Standalone `/my-command:truncate` treats the same flag as its default work queue. See Step 2.

The run happens inside a `/my-command:task` workflow (Step 0). Like `/my-command:task`, it defaults to a fresh worktree off the latest `main`.

The bundle is an [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) collection of Markdown-with-frontmatter docs, queried with [okq](https://github.com/mikevalstar/okq). Use `okq` to find and read them — not `grep`. The `okq-reference`, `okq-explore`, and `okq-maintain` skills are the contract; load them via the `Skill` tool as each step needs them.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; anything left over **scopes** the run (see Flags).

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

**Workspace** — where the pass happens. Passed through to `/my-command:task` in Step 0; they mean exactly what they mean there.

- `--here` / `-h` — do NOT create a worktree. Truncate on the **current branch** as it is now.
- `--base <branch>` — branch off `<branch>` instead of `main`. Ignored when `--here` is set.
- With neither, the default is a fresh worktree off the latest `main`.

**Selection and scope** — what gets truncated. These stay here; they are not `/my-command:task` flags.

- `--bundle <dir>` / `-b <dir>` — the bundle directory. Default: discover it (Step 1).
- `--all` / `-A` — evaluate **every** doc in the bundle, not just the dirty ones. Use after a bulk import, or the first time this command runs against a bundle that has never been truncated.
- `--dry-run` / `-n` — report the queue and the proposed cuts, change nothing. Stop after Step 3.
- `--yes` / `-y` — apply without pausing, including cuts past the size guard in Step 4. Without it, any doc that would lose more than 40% of its body is confirmed with me first.
- Anything left after flags scopes the run to a concept id (`features/pr`), a path or glob (`docs/adrs/*`), or a topic (`worktree handling`) — resolve a topic with `okq --bundle <dir> search "<topic>"`. **An explicit scope overrides the dirty filter**: those docs are evaluated whether or not they are marked, and `--all` is redundant with it.

**`-a` is not a flag here.** The whole-bundle flag is `--all` / `-A` precisely because `-a` already means the missing-docs pass in `/my-command:docs` and extra woven-in commands in `/my-command:task`. Never forward this command's `-A`, `-b`, `-n`, or `-y` to `/my-command:task` as flags — they belong in the criteria text, not the invocation.

## Step 0 — Choose the workspace, then hand the pass to `/my-command:task`

This command does no branching, committing, or PR work of its own. It resolves **where** the pass happens, then delegates to `/my-command:task`, which owns workspace setup, commits, `/my-command:clean`, `/my-command:pr`, and worktree teardown. Do this **before** Step 1 — the bundle you edit must be the one inside the workspace `/my-command:task` set up, not the checkout you started in.

1. Map the workspace flag to the `/my-command:task` invocation:
   - **Default (neither flag):** `/my-command:task <criteria>` — a fresh worktree off the latest `main`. The branch type is always `docs` (this command only ever changes docs), so: `docs/<kebab-summary>` — e.g. `docs/truncate-bundle`, or scope-specific like `docs/truncate-task-doc`.
   - **`--here` / `-h`:** `/my-command:task --here <criteria>` — truncate on the current branch, no worktree. If that branch is `main`, `/my-command:task` creates a feature branch in place; let it.
   - **`--base <branch>`:** `/my-command:task --base <branch> <criteria>` — worktree branched off `<branch>`.
2. The `<criteria>` you hand `/my-command:task` is **this command's Steps 1–6 with the selection and scope already resolved** — state them in plain language rather than as flags (e.g. "run the `/my-command:truncate` density pass per Steps 1–6 over the dirty docs only, scoped to `features/`"). `/my-command:task`'s Step 2 *is* this pipeline.
3. **Don't create the worktree yourself** — `/my-command:task` Step 1 does it. Doing both nests a worktree inside a worktree. Report the branch name once `/my-command:task` has it.
4. `/my-command:task`'s Step 1.5 bootstrap can skip code generation (this is a docs-only change), but the workspace still needs `okq` on `PATH` — it's a device-level install, so a fresh worktree inherits it.
5. **`--dry-run` / `-n` skips this step entirely.** A dry run writes nothing, so there is nothing to isolate, commit, or open a PR for: stay in the current checkout, run Steps 1–3 in place, report the proposed cuts, and stop. Never spin up a worktree or call `/my-command:task` for a dry run.

## Step 1 — Locate the bundle and learn its rules

1. Confirm `okq` is installed (`command -v okq`). If it isn't, say so, point at the install instructions in the [okq repo](https://github.com/mikevalstar/okq) (`cargo install okq`, unless this repo documents its own way), and stop.
2. Resolve the bundle directory, in order: `--bundle` if given; the path this repo's own docs use (grep `AGENTS.md`/`CLAUDE.md`/`README.md` for `okq --bundle <dir>`); then a conventional directory that exists and holds Markdown with frontmatter (`docs/`, `.okf/`, `notes/`); then the repo root. Confirm with `okq --bundle <dir> stats`.
3. **Read the bundle's own contract before touching a file.** Its README/index and any process spec it keeps about itself define which frontmatter keys it uses, which sections a doc type is required to carry (a folder `_template.md` is the clearest statement of this), and whether directory `index.md` files are generated. A required section is never cut, even when empty of claims — tighten it instead.
4. **The bundle's own rules win over anything in this command.** Where they conflict, follow the bundle and say you did.

## Step 2 — Build the queue

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

1. **Default — dirty docs only:** `okq --bundle <dir> find --where dirty=true --json`. These are the docs `/my-command:docs` (or a human following the bundle's spec) touched since the last density pass. `No concepts match` means nothing is queued — that is a clean result, not a failure; report it and stop.
2. **`--all` / `-A`:** every concept — `okq --bundle <dir> find --json`.
3. **Explicit scope:** resolve it to concrete concepts (id, path/glob, or `okq search` for a topic) and use exactly those, ignoring `dirty` entirely.
4. Exclude from every mode: generated directory `index.md` files (they are output — regenerate, never edit) and anything the bundle marks as generated.
5. Record each queued doc's current body size (lines and characters, frontmatter excluded) — Step 5 reports the reduction against these numbers.
6. Report the queue before touching anything.

## Step 3 — Evaluate each doc, one at a time

**Dispatch each doc's evaluation to its own fresh subagent** via the `Agent` tool, with **`subagent_type: "mycommand-doc-auditor"`**, in parallel batches of about four. Each evaluation means reading a doc in full, and that is context this session does not need to keep — only the proposed edit is. That definition already carries the claim inventory, the every-claim-survives rule, and the propose-don't-edit boundary, so give each subagent this run's specifics alone: the bundle dir, the concept id, and the density rules below. Keep only the findings here.

Every evaluation starts by taking a **claim inventory** — the list of things the doc asserts that a reader could act on or be wrong about:

- command names, flags, and their short forms
- defaults, exit codes, thresholds, file paths, env vars
- described behavior and ordering ("X runs before Y")
- guardrails — what never to do, and any non-obvious constraint or gotcha
- an instruction's **force** — must, should, and may are three different obligations, and flattening one into another changes the doc as surely as deleting a flag
- links to other concepts

That inventory is the contract for Step 4: it must survive the edit unchanged, one for one.

### Cut

- **Narration and ceremony** — "This document describes…", "In this section we will…", a `## Summary` that restates the title, a sentence announcing what the next sentence says.
- **Justification that carries no claim** — the "why" behind a decision the reader cannot act on differently. If knowing the why changes nothing a reader does, it is packaging. (**ADRs are the exception** — see Keep.)
- **Repetition across sections** — the same mechanism explained in Summary, then Behavior, then Notes. Keep the fullest statement, cut the echoes, and let the doc's own structure carry the reader.
- **Content duplicated from a linked doc** — replace it with the link. One canonical statement, everywhere else a pointer.
- **Hedging and filler** — "it's worth noting that", "generally", "basically", "in order to", "please note", adverb stacks that survive deletion intact.
- **Redundant examples** — where two examples demonstrate the same thing, keep the clearer one. Where an example only restates the sentence above it, cut the example.
- **List items that restate their own heading.**

### Keep

- **Every claim in the inventory**, in the same words wherever the words are the claim (a flag spelling, a path, a command line).
- **The non-obvious.** A gotcha, an edge case, an external constraint, a "this looks wrong but is deliberate" — that is the highest-signal content in any doc and the first thing a careless pass deletes.
- **ADR reasoning.** An ADR's Context and Consequences *are* its payload: a decision without its reasoning cannot be revisited later. Tighten an ADR's wording; never remove why it was decided. The same holds for any doc whose stated job is to explain a rationale.
- **Required sections** from the bundle's template or spec, even when short.
- **Frontmatter** — `description` is what `okq search` and `find` surface, so it stays a full sentence.
- **Code blocks, command lines, and tables** verbatim. Cut the prose *around* an example, never inside it.

### Never

- **Never add** a claim, a section, or an explanation. This command only removes and shortens.
- **Never fix a claim you believe is wrong.** Drift is `/my-command:docs`' job. Record it as a finding for Step 6 and leave the words alone — a doc that is wrong and short is worse than one that is wrong and flagged.
- **Never bump `updated` / `timestamp`.** No claim changed, and those dates feed `/my-command:docs`' staleness ranking: bumping them would make a doc *look* freshly reconciled and push it down the audit queue on the strength of a style edit. Truncating is not reconciling.
- **Never rewrite for voice.** Match the doc's existing tone and the surrounding docs. The output should read like the same author with less to say, not like a different author.

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

## Step 4 — Apply, with a size guard

1. Apply the accepted cuts directly with `Edit`.
2. **Verify the claim inventory survived.** Re-derive it from the edited doc and compare to the one from Step 3. Any claim that is missing is a bug in the edit, not a successful truncation — restore it. This check is the whole safety story of this command; do not skip it on a doc that looks obviously fine.
3. **The size guard:** a doc that would lose **more than 40% of its body** is confirmed with me first — show the before/after size and the cut list — unless `--yes` / `-y` was given. A cut that deep usually means the doc was mostly duplication (legitimate) or that whole claims are going out with it (not).
4. Remove the `dirty` key from the frontmatter of every doc you evaluated, whether or not anything was cut — the flag means "not yet evaluated for density", and evaluating it clears it. Under `--dry-run`, remove nothing.
5. Leave every other frontmatter key exactly as it was.

## Step 5 — Verify and report

1. Regenerate what's generated: `okq --bundle <dir> index` if the bundle has generated `index.md` files.
2. Re-run the health checks until clean: `okq --bundle <dir> validate`, `deadlinks --check`, `orphans` (exit code 3 means the gate tripped, not the text). Send each as its own plain Bash call — the harness reports every call's exit status on its own, so there is nothing to capture with `$?` and no reason to wrap them in a `( … ; echo … )` line, which is refused on shape. A cut that removed the last link to a doc shows up here as a new orphan; restore the link.
3. Run the repo's own doc gate if it has one (e.g. `pnpm run check:commands`, the `docs` CI job's command). Report exactly what you ran.
4. Report a table: doc | verdict (`truncated` / `reviewed` / `deferred`) | lines before → after | what was cut. `reviewed` means it was evaluated and already lean — a real outcome, not a miss. Then, separately, the **claims that looked wrong** — drift you noticed but deliberately left alone — since those are a `/my-command:docs` run, not this one.
5. Apply edits directly, then let the surrounding `/my-command:task` run take it from here — its Step 2 commits the changes, and its Step 3 runs `/my-command:clean`, `/my-command:pr`, and worktree teardown. Report the table above as this pass's result rather than opening the PR yourself. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include --> Under `--dry-run` there is nothing to hand off.

## Notes

- **A claim is never a style choice.** If you cannot decide whether a sentence carries a claim, it does — keep it. The cost of a kept sentence is a few tokens; the cost of a cut claim is a doc that silently lies by omission.
- **This command edits docs only** — never source code, never tests, never a command's own instructions in `src/commands/`. Those are read as the source of truth, not rewritten.
- **Shorter is not the goal; higher signal per token is.** A doc that is already lean gets `reviewed` and no edit. Never manufacture cuts to show a number.
- `okq` over `grep` throughout: `find --where`, `get --section`, and `search` are structure-aware, and `get --section` keeps whole files out of context.
- **Quote any Bash argument holding `*` or `?` that the invoked program — not the shell — should expand** (`okq --bundle docs find 'docs/adrs/*'`). The shell is zsh: an unquoted glob that matches nothing aborts the whole command with `no matches found`.
- Delegating to `/my-command:task` means `/my-command:task`'s own rules apply. `--yes` / `-y` governs the size-guard confirmations, not whether a PR gets opened.
- `--dry-run` writes nothing at all — no edits, no `dirty` clearing, and no worktree, commit, or PR either.
- If the queue is empty, say so plainly and stop. Nothing to truncate is a real result.

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
