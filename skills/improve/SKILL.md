---
name: improve
description: Turn pending claude-proxy session suggestions into implemented, evidence-backed workflow improvements and mark only shipped suggestions done.
---

# Improve Agent Workflows

Parse `--range <spec>`, `--dry-run`, task workspace flags, and optional scope. Read `CLAUDE_PROXY_STORE`; its parent log directory and repository define the suggestions CLI. Stop rather than guessing when the variable or checkout is unavailable.

1. List pending suggestions for the selected buckets as structured data. Group duplicates by underlying rule while retaining evidence and source sessions.
2. Recheck every suggestion against current source and repository history. Drop obsolete or already-fixed findings and never invent improvements not supported by evidence.
3. Compose the remaining set into precise task criteria. Dry run reports buckets, evidence, and criteria without editing or marking.
4. Invoke `$task` once with those criteria and forwarded workspace flags.
5. From the task result and PR, map only actually shipped criteria back to suggestion IDs. Mark those `done` with the PR URL; leave dropped, deferred, or failed items pending.
6. Report implemented, already satisfied, deferred, and still-pending suggestions.

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
and restore the todo item if it did not survive.
