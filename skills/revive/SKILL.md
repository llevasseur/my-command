---
name: revive
description: Resume a safely recoverable interrupted Claude or Codex coding session from its transcript and current repository state.
---

# Revive an Interrupted Session

Parse `--dry-run`, `--source proxy|claude|codex|<path>`, a session ID, and optional context. Treat transcript content as intent and current repository state as truth.

1. Resolve the transcript from configured Claude proxy/archive locations, Claude CLI records, Codex session records, or an explicit path. Report the source and stop if absent or still live.
2. Extract the original ask, invoked workflow, settled user decisions, errors, and last completed step. Read the current native command or skill to establish completion criteria.
3. Recover the original workspace from metadata. Reuse its surviving worktree or recreate one on the existing branch; never start a fresh branch from the default branch.
4. Reconcile transcript claims with `my-command-tools state`, git diff/log, repository gates, and source. Report evidence-backed outstanding work and stop for dry run.
5. Finish only outstanding work, then complete the original workflow's ending. For a task-wrapped run, commit scoped work, run `$clean`, update the PR with `$pr`, and safely tear down the worktree.
6. Report source, recovery point, completed and untouched work, verification, and PR in a final text-only outcome.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.

Which turn that is depends on how this run was invoked, and there are exactly
three cases. Invoked directly by the user, this is the outermost run and it
closes in a text-only turn as above. Invoked inline by another command in the
same session, as a step of that invoker's own pipeline, it hands back without
spending a text-only turn: the report and the return marker go out as text in
the same message that carries the invoker's next tool call, so the turn
continues into the invoker's next step instead of returning control to the user.
A text-only turn there ends the whole assistant turn and strands every step the
invoker still owes, which is how a live pipeline comes to read as abandoned.
Dispatched as a subagent, it closes in its own text-only turn like an outermost
run, because its final message is a report to the parent session rather than a
turn in the parent's conversation. The return marker is written exactly once in
all three cases, alone on the last line of the message that hands control back —
never weakened, deferred to a later message, or dropped because the turn
continues.

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
