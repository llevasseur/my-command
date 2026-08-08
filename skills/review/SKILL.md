---
name: review
description: Independently review an open pull request, produce actionable feedback, and apply validated findings on its existing branch.
---

# Review and Apply Feedback

Parse `--target <PR-number-or-branch>`, `--here`, and optional focus. Resolve the PR with `gh`; never approve, comment on, or merge it.

1. Unless valid here mode targets the current branch's PR, fetch and use a fresh existing-branch worktree under `.codex/worktrees/`. Address that checkout by the absolute path the helper reported, copied byte for byte — an existing checkout entered, never a new one requested by name, and never a relative or reconstructed path. A refusal there describes how the worktree was created, so do not retry it and do not reinvent a workaround; work through absolute paths under the reported path instead.
2. Independently inspect the PR body, full diff, repository instructions, surrounding code, and relevant checks. Verify every finding and cover correctness, regressions, security, reliability, conventions, generated output, and docs.
3. Report concrete path-anchored findings. If findings exist, compose and execute one `$fb` request in the same PR workspace, in this session and never delegated to a subagent; if clean, say no feedback run is needed.
4. Let `$fb`/`$task` own commits, cleanup, and the PR update. Tear down the step 1
   worktree yourself, whether or not feedback ran.
   - Remove a worktree through the same mechanism that created it. One this
     session merely entered is not owned by the session worktree tool; step back
     out, then remove it through the repository helper from outside the worktree,
     which re-verifies the branch reached origin — push rather than forcing if it
     refuses. If another live session still holds it, stop and report the path as
     left in place.
5. Report the final PR state in a text-only outcome.

Use `my-command-tools state`, `verify`, and worktree operations when available.

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
