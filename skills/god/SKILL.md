---
name: god
description: Take a task unattended through implementation, review, CI repair, merge into the default branch, and local default-branch update.
---

# Unattended Task to Merge

Use only when the user explicitly invokes `$god`, `/god`, or requests an unattended task-to-merge workflow. Parse task workspace flags, `--auto`, merge method, `--fix <n>`, and `--no-review`; reject draft mode.

1. Record the main checkout and task branch. Invoke `$task` with `--sub` so its
   cleanup and PR stage runs as one delegated subagent, weaving in
   `$review --here` there unless disabled, and require the resulting PR to belong
   to this run's branch.
2. Re-resolve the PR from GitHub. Detect default-branch conflicts locally with `git merge-tree --write-tree`; invoke `$mc --target <branch>` when needed and stop on unresolved conflicts.
3. Unless `--auto`, watch required checks without foreground sleeps. For red CI, inspect the failing job log and spend at most the requested repair rounds through `$fb --target <branch>`.
4. Merge with `gh pr merge` using the requested method and branch protection. Never use `--admin`, force-push, or push directly to the default branch. If checks are pending, enable auto-merge; if the base moved, refresh conflicts once.
5. Fast-forward the local default branch in the recorded main checkout. Stop on divergence.
6. Report task, review, repairs, checks, merge, and local update in a final text-only outcome.

Use `my-command-tools doctor`, `state`, and `verify` for deterministic repository checks when available.

## Git call shape

- Issue a command that may need approval as its own shell call — fetch, config,
  and branch-lifecycle operations such as checkout/switch, pull, remote-branch
  inspection, and local branch deletion. Folding one into a chain escalates
  approval to the whole compound command and costs a turn plus a retry. Put
  status output, pipes, and follow-up verification in separate read-only calls.
- A classifier refusal is not evidence that repository protections should be
  weakened. Inspect the refused command first; when the intended operation is
  safe and the refusal looks incidental to the command's shape — an over-broad
  chain, pipe, or extra flag — retry only the smallest exact command, never a
  permission-settings change.
- A refusal of a PR merge or a remote-ref deletion is final. Surface it to the
  human and carry on with the rest of the work; re-expressing the same operation
  through a raw API call or a different credential is refused for the same reason
  and costs a second turn. Steps 4 and 5 are where this fires: the branch-deleting
  merge and the local branch cleanup that follows it.

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
