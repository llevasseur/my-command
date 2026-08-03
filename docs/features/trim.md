---
type: feature
title: trim
description: Decide whether the current conversation is safe to compact, then provide focused instructions for Claude Code's built-in /compact.
tags: [command, context, read-only]
timestamp: 2026-07-15
updated: 2026-08-02
---

# trim

## Summary

Applies an evidence-backed safety rubric to the current conversation and, when
every gate passes, emits a tailored `/compact` command. Read-only — it never edits
files or runs mutating commands, and it never performs compaction itself
(`/compact` is a Claude Code built-in only the user can invoke).

## Flags / Parameters

- None. Reads the current conversation (and, when relevant, live repo state).

## Behavior

Evaluates six gates (C1 closed, C2 recoverable, C3 progress, N1 not stuck, N2 not
live, N3 verified) and prints six evidence lines in that order. Judgment is
conservative: length alone is never a reason to compact. If any gate fails it prints
`CONTINUE` with the smallest action to make trimming safe; if all pass it prints
`TRIM` followed by a single copyable `/compact <focused instructions>` line that
names what to preserve (the original goal, constraints and decisions, current
implementation and repository state, changed files, verification evidence,
unresolved work, the exact next action) and what to discard (superseded plans,
repetitive tool output, completed narration, failed approaches beyond the concise
negative knowledge that prevents a retry). The report ships in a text-only closing
turn.

## Related

- Command source: `src/commands/trim.md`
- Spec: [Adding a command](../specs/adding-a-command.md)
