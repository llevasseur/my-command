---
name: review
description: Independently review an open pull request, produce actionable feedback, and apply validated findings on its existing branch.
---

# Review and Apply Feedback

Parse `--target <PR-number-or-branch>`, `--here`, and optional focus. Resolve the PR with `gh`; never approve, comment on, or merge it.

1. Unless valid here mode targets the current branch's PR, fetch and use a fresh existing-branch worktree under `.codex/worktrees/`. Address that checkout by the absolute path the helper reported, copied byte for byte — an existing checkout entered, never a new one requested by name, and never a relative or reconstructed path. A refusal there describes how the worktree was created, so do not retry it and do not reinvent a workaround; work through absolute paths under the reported path instead.
2. Independently inspect the PR body, full diff, repository instructions, surrounding code, and relevant checks. Verify every finding and cover correctness, regressions, security, reliability, conventions, generated output, and docs.
   - **Fetch the diff once, with its content.** One scope-and-diff call returns every changed file's hunks with their line numbers attached, so a finding's file and line are known before anything is opened. There is no second diff call — not one narrowed to a path, not one per entry of the file list; a recorded review walked a PR diff one probe per turn for thirty-five turns, and that loop is what this replaces. Open a file only when the hunk is not enough, as a batched read rather than a diff.
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
Wait for `verify` with one call rather than by polling: start it with
`--background`, then send the `my-command-tools verify --wait <verdict>` command
it reports under `wait.blocking` as a foreground shell call with a 600-second
timeout. The report is written atomically at exit, so reading it while the run is
going returns the same nothing every time.

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
