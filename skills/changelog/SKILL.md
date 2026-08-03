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
