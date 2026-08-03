---
name: trim
description: Assess whether the current Codex conversation is safe to compact and emit a focused continuation summary only when safe.
---

# Compaction Safety

This workflow is read-only. Assess concrete conversation and repository evidence:

- `C1 CLOSED`: no active edit, command, merge, or pending result.
- `C2 RECOVERABLE`: a summary can preserve goal, decisions, branch/worktree state, changes, checks, findings, blockers, and exact next action.
- `C3 PROGRESS`: material work occurred since the last compaction.
- `N1 STUCK`: repeated failures would lose important negative knowledge.
- `N2 LIVE`: a process, conflict, mutation, or user decision remains pending.
- `N3 VERIFIED`: completed work has relevant verification.

Output exactly those six evidence lines. Recommend compaction only for `C1=Y`, `C2=Y`, `C3=Y`, `N1=N`, `N2=N`, `N3=Y`. Otherwise end with `CONTINUE -- <smallest action>`. When safe, end with `TRIM` and a copyable Codex continuation summary that preserves all active state and discards superseded narration and repetitive output.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.
