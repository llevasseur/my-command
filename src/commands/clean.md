---
description: Clean up comments across a branch's committed changes (plus any uncommitted changes on top) — make them lean and to the point
argument-hint: "[optional branch name] [optional path or scope to limit cleanup]"
allowed-tools: Bash(git:*), Read, Edit
---

Clean up the comments in my changes. Only touch comments — never change code, logic, formatting, or behavior.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed.<!-- /include -->

## Scope

1. Target branch: if $ARGUMENTS names a branch, use it; otherwise use the current branch (`git branch --show-current`). Never check out or switch branches — diff the target ref in place with the current checkout untouched.
2. Determine the base to diff against:
   - If the target branch has an upstream tracking branch, use `git merge-base <upstream> <branch>`.
   - Otherwise, detect the repo's default branch (`git symbolic-ref refs/remotes/origin/HEAD` or fall back to `main`/`master`, whichever exists) and use `git merge-base origin/<default> <branch>`.
3. Full diff = `git diff <merge-base>...<branch>` (every commit made on the branch) plus, if the target branch is the current branch, any current staged/unstaged changes on top (`git diff HEAD`). If targeting a different branch, only its committed changes are in scope — there's no working tree to inspect.
4. Only consider comments on lines added or modified anywhere in that combined diff. Do NOT clean comments in untouched code, even if they're bad. Ignore generated files.
   - On a long-lived/shared branch, the branch-wide diff resurfaces earlier commits' code — including comments a prior clean pass already handled. If the branch shows evidence of an earlier clean (e.g. a `chore: clean ... comments` commit), scope to the current task's commits (`git diff <task-base>...HEAD`) and report the older code as out-of-scope instead of re-litigating it.
5. If $ARGUMENTS also names a path or scope (beyond the branch name), limit to that.
   - Prose in Markdown docs is out of scope even when the diff touches it — tightening a doc is [truncate](truncate.md)'s pass, and it has claim-preservation rules this one doesn't. Only comments inside fenced code blocks in a doc are fair game here.
6. If the combined diff is empty, say so and stop.

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
- **Don't commit** — and don't carry that rule past this command. It is scoped to `/clean` and does not survive nesting: the edits are left uncommitted for whoever invoked `/clean` to own. Invoked directly, uncommitted *is* the deliverable. Invoked from inside another workflow (`/task` Step 3, `/task-bootstrap` Step 7, or anything wrapping them), that workflow commits them and its run is not finished until it has — so hand back and continue it at its next step rather than stopping at uncommitted cleanup or reporting the branch as done. If an invoker's instructions never say who commits, flag the uncommitted edits in the summary instead of committing them here.
- **Teardown is never yours.** Never remove a worktree here — not with `git worktree remove`, not by any other route. Whoever invoked `/clean` owns that workspace and its teardown.
- <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
