---
type: feature
title: trim
description: Decide whether the current conversation is safe to compact, then provide focused instructions for Claude Code's built-in /compact.
tags: [command, context, read-only]
timestamp: 2026-07-15
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
live, N3 verified) and prints six evidence lines. If any gate fails it prints
`CONTINUE` with the smallest action to make trimming safe; if all pass it prints
`TRIM` followed by a single copyable `/compact <focused instructions>` line.

## Related

- Command source: `src/commands/trim.md`
- Spec: [Adding a command](../specs/adding-a-command.md)
