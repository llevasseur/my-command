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

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. Resolve it in the same tool-call turn as the run's last piece of real work,
so the list is already clean when that turn returns and the only thing left
to do is speak. Never leave marking it as a call of its own after the work
ends: a run whose last scheduled action is a bookkeeping tool call ends on
that call — the mark lands every time, and the message meant to follow it
never arrives. A
compaction boundary is a checkpoint, not an ending — a recap prompt, a
background-task notification, or a session-continuation preamble each mean the
run is still owed its turn, so answer in text alone, say where the run stands,
and restore the todo item if it did not survive. Each side of a boundary
records its own standing, because a run split across two transcripts is two
runs to the record. Every message from the
user opens a task in the same transcript, and only a reply carrying text
and no tool call closes it, so answer a mid-run question, correction, or
recap in text before returning to tool calls. A reply to another session is
not that turn either: SendMessage is a tool call, so send the reply, let it
return, then close in text alone.
