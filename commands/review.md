---
description: Independently review an open PR, produce /fb-ready structured feedback, and apply it
argument-hint: "[--here|-h] [--target|-t <PR-number-or-branch>]"
---

Review an open PR independently, then apply what the review finds. By default, spawn a **fresh** agent so it has no prior investment in the PR's approach and reviews the diff cold. With `--here`, do the review yourself; the caller is asserting that you are already the fresh, independent agent.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; anything left over is extra context for the reviewer (e.g. "focus on the auth changes").

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed. **Then close it out:** "until it is the only item left" is the trigger to resolve it, not a reason to leave it open forever — once it is the last item and the work is done, mark it completed with the run's **final tool call**, and send the text-only message after that call returns. Both constraints hold at once that way: the task list ends clean and the closing message still carries zero tool calls. Never hand back with the anchor still open — a finished run reads as abandoned in the job list.<!-- /include -->

## Flags

- `--target <PR-number-or-branch>` / `-t <PR-number-or-branch>` — review this PR/branch instead of the one associated with the current branch. Anything accepted by `gh pr view <target>` works (PR number, branch name, or PR URL).
- `--here` / `-h` — review the current branch's own PR **yourself**, in the current checkout. Do not create a worktree and do not spawn a review agent; this mode expects that you are already running as a fresh, independent agent. It is only valid without `--target`, because reviewing another branch in place would mean checking it out over whatever is already here. If both `--target` and `--here` are given, `--target` wins: ignore `--here`, use the default fresh-worktree/fresh-agent flow, and say why.
- Anything else left over after flags is extra context for the reviewer, not a separate step.

## Step 1 — Resolve the target PR

- `--target` given: `my-command-tools prs view <target>` to resolve it. It is read-only and already asks for every field this command needs — number, title, body, `headRefName`, `baseRefName`, url — so nothing has to name a `--json` field list. It exits 1 when the PR does not exist; on that, stop and tell me rather than guessing a branch name.
- No `--target`: `my-command-tools prs view` for the current branch. If there's no open PR for the current branch, stop and tell me (this command reviews existing PRs, it doesn't open one).

## Step 2 — Set up the workspace

- **Default (no `--here`):** put the review in a fresh worktree on the PR's **existing** branch — `--existing` so the verb checks the branch out rather than creating one over the PR's work:
  1. `my-command-tools worktree begin --branch <headRefName> --existing --bootstrap` (it fetches first, and reports the `path` it created)
  2. `EnterWorktree` with that `path`
- **`--here` / `-h`:** stay in the current checkout — do not create a worktree — and confirm `my-command-tools state` reports `branch` equal to the PR's `headRefName`. If it isn't, stop and tell me rather than switching branches for you.

## Step 3 — Perform the review

- **Default:** dispatch a **fresh** agent (not a fork — it must not inherit this conversation's framing of the PR) via the `Agent` tool, working in the worktree from Step 2. Brief it with the material and rubric below.
- **`--here` / `-h`:** do **not** use the `Agent` tool. Apply the material, rubric, and required output shape below directly yourself in the current checkout. The caller chose this mode because this command is already running inside the fresh agent that should perform the independent review.

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

Review material:
- PR number, title, body, base branch, head branch, and URL from Step 1.
- Task: verify the PR does what it claims, and compare it against the existing codebase for discrepancies.
  - Read the actual diff: `gh pr diff <number>` or `git diff <base>...<head>`.
  - Check the diff against the PR's own title/description — does the code match what's claimed?
  - Run the repo's own verification with `my-command-tools verify` and report failures — it discovers the repo's gates itself and returns a bounded log for each one that failed.
  - Compare against surrounding code and this repo's own conventions (`AGENTS.md`/`CLAUDE.md`, existing patterns in touched files) for things that clash: inconsistent style, skipped repo-specific steps (e.g. a missing feature doc, an out-of-sync generated file), missed edge cases, dead code, anything the PR description doesn't mention but the diff does.
  - Fold in the extra context from `<command-args>` (if any) as additional review focus.
  - The diff's file list is the enumeration the batched-discovery step above asks for: read those files and their neighbours in one turn, and ask for the whole diff in a single `git diff <base>...<head> -- <path> <path> …` rather than one call per path.
- Required output shape — the review report MUST end with:
  1. A short bullet list of concrete findings (or a single line stating none were found).
  2. If there are findings: a fenced code block containing **exactly one** ready-to-run `/my-command:fb` line that folds every finding into a single imperative feedback request, e.g.:
     ```
     /my-command:fb fix the off-by-one in the pagination cursor at src/list.ts:42, add the missing docs/features/review.md entry, and drop the leftover console.log in src/commands/review.md
     ```
     No `--target` in that line — it's meant to run **inside this same worktree/checkout**, which is already the PR's branch.
  3. If there are no findings: state clearly that no `/my-command:fb` is needed.

## Step 4 — Report and apply

1. Show me the review findings and the `/my-command:fb` block verbatim — this is the copy-pasteable output the wish asked for, so it must be visible even though the next step also applies it. In `--here` mode, emit your own report in exactly the same shape.
2. If the review found nothing to fix: don't invoke `/my-command:fb` for a clean PR — go straight to (4).
3. If the review produced an `/my-command:fb` line: run it **inline in this session** via the `Skill` tool (`skill: "fb"`, `args:` the feedback text after `/my-command:fb`). Never dispatch `/my-command:fb` to a subagent via the `Agent` tool — the independence a subagent buys is the *reviewer's*, and Step 3 already spent it; running `/my-command:fb` here keeps the findings you just read in context. This runs inside the same worktree/checkout from Step 2, so `/my-command:fb`'s default (current branch, no `--target`) is correct — do not add `--target` yourself.
   - `/my-command:fb` wraps `/my-command:task --here`, which implements the fix, commits, then runs `/my-command:clean` and `/my-command:pr` — `/my-command:pr` updates the **same** PR (same branch, already pushed).
4. **Tear down the Step 2 worktree yourself** (default mode only — under `--here` there is no worktree, so touch nothing), whether or not `/my-command:fb` ran. `/my-command:pr` does **not** remove it: it skips teardown for any worktree its session didn't create. <!-- include: shared/worktree-ownership.md -->**Remove a worktree through the same mechanism that created it.** One created by `git worktree add` or `my-command-tools worktree begin` is not owned by the session worktree tool merely because the session later entered it via `EnterWorktree({path})` — `ExitWorktree` refuses to remove it. Step back out with `action: "keep"`, then run `my-command-tools worktree end --branch <branch>` from outside the worktree; it re-verifies the branch reached origin before removing, so push rather than forcing if it refuses. If it refuses because another live session still holds the worktree, stop and report the path as left in place — never force past a live lock. **Whatever removes the worktree, stop the processes rooted in it first.** `worktree end` now does this itself, but `ExitWorktree` does not: a dev server or watcher started inside a worktree outlives the directory, and where the repo symlinks shared state (a log directory, a database) into each worktree, the survivor keeps writing to that shared state through a path that no longer resolves — one whose reads now fail can reconcile the shared store down to empty and make the main checkout look like it has no data. Run `my-command-tools worktree reap --path <worktree path>` immediately before `ExitWorktree({action: "remove"})`, and pass `--no-reap` to `end` only when a survivor is deliberate.<!-- /include -->
5. Report the verdict, what `/my-command:fb` applied (or that the PR was clean), and the PR. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Notes

- This command never merges or approves the PR — it only reviews, then fixes what it finds. Merging is a separate, human decision.
- This command doesn't post the review as a GitHub PR comment/review (`gh pr review`) — its output is the `/my-command:fb`-ready text, both shown to me and applied locally.
- If `--here` is used and the current branch has uncommitted changes unrelated to the PR, stop and tell me rather than mixing them into the review.

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no marker to type: the `- done:` line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor item as the last tool call.** The todo item that held this turn open is the one thing still owed once the work lands: mark it completed, let that call return, then send the message. It is the natural final call, and it keeps the closing message free of tool calls exactly as this step requires. Handing back with it still open makes a finished run read as abandoned.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
