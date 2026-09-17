---
type: feature
title: trim
description: Decide whether the current conversation is safe to compact, then provide focused instructions for Claude Code's built-in /compact.
tags: [command, context, read-only]
timestamp: 2026-07-15
updated: 2026-09-16
dirty: true
---

# trim

## Summary

Applies an evidence-backed safety rubric to the current conversation and, when
every gate passes, emits a tailored `/compact` command. Read-only — it never edits
files or runs mutating commands, and it never performs compaction itself
(`/compact` is a Claude Code built-in only the user can invoke).

## Flags / Parameters

- None. Reads the current conversation (and, when relevant, live repo state).

## The deterministic gates are computed, not argued

Four of the six gates are facts about the session, so `my-command-tools trim` answers them and
the command reads the fields. It reports C1's returned-calls half, C3, N1's repeat arithmetic
and N2, from the transcript machinery in `src/hooks/lib/` — `timeline()`, `read-only.mjs`,
`watchedOutputs()` — plus the working tree. It needs no API key, makes no network call, and
has no fail-open path, because a computation that cannot be wrong has nothing to fail open
from. [ADR 0007](../adrs/0007-deterministic-trim-gates-stay-a-facts-verb.md) records why these
never reach a classifier.

What it deliberately does not answer is as load-bearing as what it does. C2 RECOVERABLE and N3
VERIFIED come back `unknown` on every run, and so do the judgement clauses inside the gates it
otherwise answers — C1's "mid-tool sequence" and N1's "would hide useful negative evidence",
each reported as `residual` beside a gate marked `partial`. It prints no `TRIM`/`CONTINUE`
verdict either: `verdict` is `null`, because six gates decide that and two of them are the
agent's. Judgment stays with the agent, which is the rule
[Command toolkit](../specs/command-toolkit.md) already states.

The verb reads the transcript through the same library the workflow gates use rather than a
second copy of it, and imports it lazily — two supported installs ship the toolkit without
those gates beside it, and a top-level import would take every other verb down with them.
Where the library or the transcript is missing, the transcript gates report `unknown` and the
repository halves of C3 and N2 still answer.

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
- [health](health.md) — the other read-only assessment command; both end in a
  verdict rather than an edit.
