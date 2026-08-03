---
description: Implement a feedback request via /my-command:task — on the current branch by default, or inside a worktree of a named existing branch with --target
argument-hint: "[--target|-t <branch>] <feedback request>"
---

Implement a feedback request. This is a thin wrapper around `/my-command:task`: it decides **where** the work happens, then hands the feedback to `/my-command:task` to take it from criteria to a PR.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the **feedback request** (the task criteria for `/my-command:task`).

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed. **Then close it out:** "until it is the only item left" is the trigger to resolve it, not a reason to leave it open forever — once it is the last item and the work is done, mark it completed with the run's **final tool call**, and send the text-only message after that call returns. Both constraints hold at once that way: the task list ends clean and the closing message still carries zero tool calls. Never hand back with the anchor still open — a finished run reads as abandoned in the job list.<!-- /include -->

## Flags

- `--target <branch>` / `-t <branch>` — apply the feedback onto an **existing** branch inside a fresh worktree.
- Anything not a recognized flag is part of the feedback request.

## Behavior

### Default (no `--target`)

Run `/my-command:task --here <feedback request>` on the **current branch**.

- `/my-command:task -h` stays on the current branch and does not create a worktree.
- If the current branch is `main` (or the repo's default branch), `/my-command:task` will create a feature branch in place — that's expected; let it.

### `--target <branch>` / `-t <branch>` given

If the target repo is not the repo this session started in, prefer starting a new session in the target repo. Otherwise, use the steps below without `EnterWorktree`: do all work through absolute paths under the returned `path`, then tear down with `my-command-tools worktree end`, which re-verifies the branch reached origin before removing it.

1. `my-command-tools worktree begin --branch <branch> --existing --bootstrap`. It fetches first, then checks out that **existing** branch into a worktree and reports the `path`. `--existing` is what makes this safe: without it the verb would create a new branch, silently abandoning the work already on `<branch>`.
   - If it errors with `branch does not exist locally or on origin`, stop and tell me — do **not** create a new branch. This flag is for applying feedback onto existing work.
   - If it says the branch is already used by a worktree, do **not** retry `worktree begin`: inspect `my-command-tools worktree list`, validate the reported owner path and branch, then work in that existing checkout when it is this run's target. A live owner belonging to another session is a stop, not a reason to force or remove the worktree.
2. When the target and session-start repo are the same, switch into the reported `path` with the `EnterWorktree` tool. For a cross-repo run, stay outside it and use absolute paths under `path`.
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
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor item as the last tool call.** The todo item that held this turn open is the one thing still owed once the work lands: mark it completed, let that call return, then send the message. It is the natural final call, and it keeps the closing message free of tool calls exactly as this step requires. Handing back with it still open makes a finished run read as abandoned.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
