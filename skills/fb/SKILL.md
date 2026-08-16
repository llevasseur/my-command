---
name: fb
description: Implement feedback through the task workflow on the current branch or an existing target branch.
---

# Apply Feedback

Parse `--target <branch>` / `-t <branch>` and `--worktree <path>`, and treat the remaining prompt as task criteria.

- With `--worktree <path>`, the checkout already exists and belongs to whoever
  dispatched this run: make none of your own, work through absolute paths beneath
  it, forward the path to the task workflow, and leave it standing at the end.
- Without a target, invoke `$task --here <feedback>` in the current checkout.
- With a target, fetch and verify the existing local or remote branch, then use
  `my-command-tools worktree begin --existing` when available to create a fresh
  worktree at `.codex/worktrees/<safe-branch>` without creating a new branch.
  Work there and invoke `$task --here <feedback>`. Address that checkout by the
  absolute path the helper reported, copied byte for byte — an existing checkout
  entered, never a new one requested by name. A refusal there describes how the
  worktree was created, so do not retry it and do not reinvent a workaround;
  work through absolute paths under the reported path, and tear down with the
  repository helper from outside it.

Never create a missing target branch. The `$task` workflow owns implementation, verification, commits, `$clean`, `$pr`, and safe worktree teardown. Report the branch before work and the PR number and URL at completion.

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
