---
name: changelog
description: Add a concise, factual CHANGELOG.md entry for the work in the current branch or session.
---

# Changelog

Derive the entry from `my-command-tools state` when available, plus the current
diff and commits since the task base; never guess.

1. Find the root `CHANGELOG.md`, read repository guidance, and match its headings, ordering, tone, and references.
2. Add one tight factual entry in the appropriate newest-first location. Group related work into one bullet and do not invent PR or issue numbers.
3. Edit directly. Do not commit unless the surrounding workflow authorizes it.
4. Report the exact entry and location.

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
