---
description: Add a concise changelog entry to CHANGELOG.md for the work done in this session
argument-hint: "[optional summary or area to record]"
allowed-tools: Bash(git:*), Bash(my-command-tools:*), Read, Edit, Write
---

Add a changelog entry describing the work from this session. Keep it concise and factual — what changed and why, no filler.

The `<command-args>` block above, if non-empty, is a summary or area tag to record; otherwise derive the entry from the actual changes.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed.<!-- /include -->

## Steps

1. Figure out what changed: `my-command-tools state` reports the branch's `commits`, the per-file `diffStat`, and any uncommitted `changes` in one call. Read the diff itself where a bullet needs more than a filename. Base the entry on real changes, not guesses.
2. Find `CHANGELOG.md` at the repo root. If none exists, create one using the [Keep a Changelog](https://keepachangelog.com) layout.
3. **Match the repo's existing convention.** If `CHANGELOG.md` already has entries, copy their style exactly — heading format (dated vs. versioned), bullet style, any area tags or PR references. If `CLAUDE.md`/`AGENTS.md`/`CONTRIBUTING.md` documents a changelog format, follow that. Only fall back to Keep a Changelog (`## [Unreleased]` or `## YYYY-MM-DD`, grouped under Added / Changed / Fixed / Removed) when the repo sets no precedent.
4. Write one tight entry and insert it in the right place (most recent first). Group related changes into a single bullet rather than one per file.
5. Don't invent a PR/issue number — include one only if it's known from the arguments or the branch.

## Finish

- Apply the edit directly. Don't commit unless the repo's flow expects the changelog committed with the work.
- Report the entry you added and where. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
