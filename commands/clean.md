---
description: Clean up comments across a branch's committed changes (plus any uncommitted changes on top) — make them lean and to the point
argument-hint: "[optional branch name] [optional path or scope to limit cleanup]"
allowed-tools: Bash(git:*), Bash(my-command-tools:*), Bash(pnpm lint:anti-slop), Read, Edit
---

Clean up the comments in my changes. Only touch comments — never change code, logic, formatting, or behavior.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the way this run ends.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **A run another command invoked inline with the `Skill` tool anchors its handback instead**, worded as "hand back to the invoking command in its next turn": a nested run that spends a text-only turn ends the whole assistant turn and strands every step its parent still owes, so the item it carries must not tell it to. A run the user invoked directly, and one dispatched as a subagent, both anchor the text-only close. **Resolve the item in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** Every run recorded before this marker existed is read from that prose, and the prose is still the only reading for any message the marker is missing from. Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

## Scope

<!-- include-block: shared/one-diff-call.md -->
**One diff call, and the content comes back with it.** `my-command-tools scope --diff` returns the branch's whole diff — every file, hunk by hunk, each line annotated `<sign><line number>\t<text>` — so a comment's file *and* its line are known before anything is opened. Read `diff.committed` and `diff.workingTree` off that one result.

- **There is no second diff call.** Not `git diff -- <path>`, not `gh pr diff` narrowed to a file, not one call per entry of the file list: the hunk you would narrow to is already in the first result, and walking that list per path is the loop this call exists to replace. A `PreToolUse` gate refuses a path-narrowed diff once `scope --diff` has run in the session.
- **A file under `diff.omitted` passed the size cap.** Re-run `scope --diff --diff-limit <chars>` once — never diff that path by hand.
- **Open a file only when the hunk is not enough** — to see a symbol the diff does not show. That is a `Read`, batched with every other file you already know you need, never a diff.
<!-- /include-block -->

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

1. **Get the scope and the diff in one call: `my-command-tools scope --diff`**, or `my-command-tools scope --diff --branch <name>` when $ARGUMENTS names one. That single read-only call is the whole discovery phase — it resolves the upstream-or-default base and the merge-base, lists the commits and the changed files, **and returns the diff's own content, hunk by hunk**. It never checks out or switches a branch, so the current checkout stays untouched. Read its fields; re-deriving any of them is the mistake this verb exists to remove.
2. The diff comes back split the way the scope is: `diff.committed` is every commit made on the branch, and `diff.workingTree` the staged/unstaged changes on top — populated only when `workingTree` is true, since no other branch has a working tree of its own. Each file carries `hunks`, and every hunk line is `<sign><line number>\t<text>`: `+` added, `-` removed, a leading space for context, and the number is that line's own file — the new one for `+` and context, the old one for `-`. So a comment's line number is already in hand before any file is opened. If `diff.truncated` is true, `diff.omitted` names the files whose content was past the size cap; raise it with `--diff-limit <chars>` or narrow the run, and never fetch them one at a time.
3. **There is no second diff call, ever** — the one-diff-call rule above, which a `PreToolUse` gate now enforces rather than merely stating. Step 1 already returned all of it.
4. **Select from the hunks, then read once.** Working from that diff, pick out the files whose hunks actually carry a comment in scope. **That subset — not `files` — is the input to a single batched `Read` block**, sent as one turn. `Edit` needs a read of its target in this session, so this reads exactly the files you are about to edit and no others: a changed file with no comment in its hunks is never opened at all, which is most of them on a typical branch. If editing turns up one more file you genuinely need, it joins the next batch alongside everything else still outstanding — it never gets a turn to itself. This governs a list that arrived complete; a probe whose target is chosen by the previous result is a real dependency and is untouched by it.
5. Only consider comments on lines added or modified anywhere in that combined diff. Do NOT clean comments in untouched code, even if they're bad. Ignore generated files.
   - On a long-lived/shared branch, the branch-wide diff resurfaces earlier commits' code (a second `scope --diff --base <commit>` call is a narrowing, not a re-fetch) — including comments a prior clean pass already handled. If `commits` shows evidence of an earlier clean (e.g. a `chore: clean ... comments` subject), narrow with `my-command-tools scope --base <that commit>` and report the older code as out-of-scope instead of re-litigating it.
6. If $ARGUMENTS also names a path or scope (beyond the branch name), limit to that.
   - Prose in Markdown docs is out of scope even when the diff touches it — tightening a doc is [truncate](truncate.md)'s pass, and it has claim-preservation rules this one doesn't. Only comments inside fenced code blocks in a doc are fair game here.
7. If the combined diff is empty, say so and stop.

## Anti-slop lint — early, before touching any comment

Run the repo's anti-slop lint first, when the repo has it:

1. Check the repo root `package.json` for a `lint:anti-slop` script — one `Read`, batched with the Scope reads above.
2. If the script exists, run `pnpm lint:anti-slop` from the repo root **before editing anything**. Its findings flag slop mechanically; treat each finding that lands on a line in scope as a candidate for the delete/tighten pass below.
3. If the script is absent, skip this step and note that in the summary — never add the script, install a plugin, or change lint config to make it runnable.
4. Its output is input, not a gate: findings outside the diff's scope, and non-comment findings, are out of bounds — this command still only touches comments in scope.

## How I want comments

- Lean, concise, to the point.
- Tell the **what**, not the why. Drop comments that only explain why or justify a choice, unless the why is genuinely non-obvious and load-bearing.
- No examples in comments.
- Match the tone of the existing human-written comments in the same file. Don't sound like an AI narrating.

## What to do to each comment in scope

- **Delete** comments that restate what the code plainly says, narrate steps ("Now we loop over...", "This function does..."), or add ceremony (obvious section banners, TODO-less filler).
- **Tighten** comments that carry real information but are verbose — cut them to the essential what, one line where possible.
- **Keep** comments that document something non-obvious the code can't express (edge cases, gotchas, external constraints). Leave license headers, linter directives (e.g. `biome-ignore`, `eslint-disable`), and doc/JSDoc annotation tags intact.
- **Keep** section-header comments inside JSX (e.g. `{/* Header */}`, `{/* Sidebar */}`) that label a structural region of markup — JSX has no other lightweight way to mark these regions, so they aren't ceremony. Only tighten them if verbose; don't delete them.
- **Keep** the sole comment inside an intentionally empty block (`catch {}`, `else {}`) — it is load-bearing: linters like Biome's `noEmptyBlockStatements` fail on an empty block with no comment.
- **Never add** new comments. This command only removes and shortens.

## Finish

- Apply edits directly with Edit.
- Report a short summary: how many comments removed vs. tightened, grouped by file.
- **Don't commit** — and don't carry that rule past this command. It is scoped to `/my-command:clean` and does not survive nesting: the edits are left uncommitted for whoever invoked `/my-command:clean` to own. Invoked directly, uncommitted *is* the deliverable. Invoked from inside another workflow (`/my-command:task` Step 3, `/my-command:task-bootstrap` Step 7, or anything wrapping them), that workflow commits them and its run is not finished until it has — so hand back and continue it at its next step rather than stopping at uncommitted cleanup or reporting the branch as done. If an invoker's instructions never say who commits, flag the uncommitted edits in the summary instead of committing them here.
- **Teardown is never yours.** Never remove a worktree here — not with `git worktree remove`, not by any other route. Whoever invoked `/my-command:clean` owns that workspace and its teardown.
- <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

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
