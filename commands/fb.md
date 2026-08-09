---
description: Implement a feedback request via /my-command:task — on the current branch by default, or inside a worktree of a named existing branch with --target
argument-hint: "[--target|-t <branch>] <feedback request>"
---

Implement a feedback request. This is a thin wrapper around `/my-command:task`: it decides **where** the work happens, then hands the feedback to `/my-command:task` to take it from criteria to a PR.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the **feedback request** (the task criteria for `/my-command:task`).

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **Resolve it in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** Every run recorded before this marker existed is read from that prose, and the prose is still the only reading for any message the marker is missing from. Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

## Flags

- `--target <branch>` / `-t <branch>` — apply the feedback onto an **existing** branch inside a fresh worktree.
- Anything not a recognized flag is part of the feedback request.

## Behavior

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

### Default (no `--target`)

Run `/my-command:task --here <feedback request>` on the **current branch**.

- `/my-command:task -h` stays on the current branch and does not create a worktree.
- If the current branch is `main` (or the repo's default branch), `/my-command:task` will create a feature branch in place — that's expected; let it.

### `--target <branch>` / `-t <branch>` given

If the target repo is not the repo this session started in, prefer starting a new session in the target repo. Otherwise, use the steps below without `EnterWorktree`: do all work through absolute paths under the returned `path`, then tear down with `my-command-tools worktree end`, which re-verifies the branch reached origin before removing it.

1. `my-command-tools worktree begin --branch <branch> --existing --bootstrap`. It fetches first, then checks out that **existing** branch into a worktree and reports the `path`. `--existing` is what makes this safe: without it the verb would create a new branch, silently abandoning the work already on `<branch>`.
   - If it errors with `branch does not exist locally or on origin`, stop and tell me — do **not** create a new branch. This flag is for applying feedback onto existing work.
   - If it says the branch is already used by a worktree, do **not** retry `worktree begin`: inspect `my-command-tools worktree list`, validate the reported owner path and branch, then work in that existing checkout when it is this run's target. A live owner belonging to another session is a stop, not a reason to force or remove the worktree.
2. When the target and session-start repo are the same, switch into the reported `path` with the `EnterWorktree` tool. For a cross-repo run, stay outside it and use absolute paths under `path`. <!-- include: shared/enter-worktree.md -->**The working form is `EnterWorktree({path: "<absolute path>"})`, with the path copied byte for byte from the `path` field `worktree begin` just printed.** Enter the checkout that already exists — that is what the `path` argument is for — and never call it with `name`, which asks the tool to create a *new* worktree and is refused for a session that has already made one another way. A relative path, or one reassembled from the branch name, is not in `git worktree list` and is rejected the same way. Make that one call and read its result; a refusal here describes how the worktree was created, so do not retry it and do not reinvent an absolute-path workaround from scratch — fall back to working through absolute paths under `path`, which is the documented cross-repo mode. **Decide teardown with entry, because it is not `ExitWorktree({action: "remove"})`:** a worktree `my-command-tools worktree begin` created is not the session tool's to remove, so step out with `ExitWorktree({action: "keep"})` and then run `my-command-tools worktree end --branch <branch>` from outside the path.<!-- /include -->
3. Run `/my-command:task --here <feedback request>` against the reported worktree: from inside it for a same-repo run, or through its absolute paths for a cross-repo run. `-h` keeps `/my-command:task` on the checked-out branch — no nested worktree, no new branch.
4. Tear the worktree down yourself once `/my-command:task` reports the PR — **`/my-command:pr` will not do it for you.** It skips teardown for any worktree its session didn't create, and this one is yours.
   - **Same repo:** you entered it with `EnterWorktree({path})`, so `ExitWorktree` refuses to remove it. Call `ExitWorktree` with `action: "keep"` to step back out to the original checkout, then run `my-command-tools worktree end --branch <branch>` from there.
   - **Cross-repo:** you never entered it — just run `my-command-tools worktree end --branch <branch>` from outside `path`.
   - Either way the verb re-verifies the branch reached origin before removing, and refuses if it hasn't. If it refuses, push first rather than forcing.

## Notes

- Either path ends by delegating to `/my-command:task`, so `/my-command:task`'s own rules apply.
- If the feedback request is too vague to act on, ask me one focused clarifying question before setting anything up.
- Report the branch name up front and the PR number/URL at the end (from `/my-command:task`/`/my-command:pr`). <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Every command leaves through this step, so it is the one place a run nested inside another provably passes on its way out, and the marker is the only record of where it handed control back. Without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close here in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
