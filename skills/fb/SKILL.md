---
name: fb
description: Implement feedback through the task workflow on the current branch or an existing target branch.
---

# Apply Feedback

Parse `--target <branch>` / `-t <branch>` and treat the remaining prompt as task criteria.

- Without a target, invoke `$task --here <feedback>` in the current checkout.
- With a target, fetch and verify the existing local or remote branch, then use
  `my-command-tools worktree begin --existing` when available to create a fresh
  worktree at `.codex/worktrees/<safe-branch>` without creating a new branch.
  Work there and invoke `$task --here <feedback>`.

Never create a missing target branch. The `$task` workflow owns implementation, verification, commits, `$clean`, `$pr`, and safe worktree teardown. Report the branch before work and the PR number and URL at completion.

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
