---
name: improve
description: Turn pending claude-proxy session suggestions into implemented, evidence-backed workflow improvements, escalate suggestions whose previous fix did not hold, and mark only shipped suggestions done.
---

# Improve Agent Workflows

Parse `--range <spec>`, `--regressed`, `--dry-run`, task workspace flags, and optional scope. Read `CLAUDE_PROXY_STORE`; its parent log directory and repository define the suggestions CLI. Stop rather than guessing when the variable or checkout is unavailable.

1. List pending suggestions for the selected buckets as structured data. Keep each row's recurrence state and its resolved claim, which names the bucket, date, and note of the fix already applied to that rule. Group duplicates by underlying rule while retaining evidence and source sessions.
2. Split the rows by recurrence. A regressed row means a dated fix already shipped for that rule and later sessions tripped it anyway; it forms a separate criteria block that leads the brief. Status alone cannot make this split, because a regressed row is still pending. A mixed row spans the fix date and proves nothing, so it stays an ordinary finding. `--regressed` narrows the run to the regression block alone.
3. For every regressed row, read the prior fix named in its resolved note, including when that note points at another repository. Record the files it changed and what it changed, then classify its mechanism on this ladder: prose rule in a repository instruction file; step written into the workflow that needs it; mechanical gate such as a hook, script, verification check, or changed default; removal of the affordance itself. Require the new fix to climb at least one rung, and forbid restating the previous rule at the same rung. A regressed row whose prior fix cannot be recovered has nothing to differ from, so treat it as an ordinary finding.
4. Recheck every suggestion against current source and repository history. Drop obsolete or already-fixed findings and never invent improvements not supported by evidence.
5. Compose the remaining set into precise task criteria, naming the repository each change lands in. Dry run reports buckets, evidence, prior fixes with their rungs, and criteria without editing or marking.
6. Group criteria by target repository and invoke `$task` once per repository, sequentially, each with that repository's criteria, its explicit checkout path as the working directory, and the forwarded workspace flags. Most runs target one repository; the ladder makes more than one possible, because the rung that answers a regression often lives in a different checkout than the rule that failed.
7. From each task result and pull request, map only actually shipped criteria back to suggestion IDs. Mark those `done`; leave dropped, deferred, or failed items pending. A criterion whose fix spanned repositories is marked only after every one of them has landed. For a suggestion that had regressed, the note records the attempt number, the rungs climbed from and to, the new pull request, and the prior one it supersedes, because the stored claim keeps only the most recent fix.
8. Report implemented, already satisfied, deferred, and still-pending suggestions, including how many were regressed.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. Being
the only item left is the cue to resolve it, not to leave it open: mark it done
with the run's final tool call, then send the closing message, so the list ends
clean while that message still carries no tool call. A
compaction boundary is a checkpoint, not an ending — a recap prompt, a
background-task notification, or a session-continuation preamble each mean the
run is still owed its turn, so answer in text alone, say where the run stands,
and restore the todo item if it did not survive. Every message from the
user opens a task in the same transcript, and only a reply carrying text
and no tool call closes it, so answer a mid-run question, correction, or
recap in text before returning to tool calls.
