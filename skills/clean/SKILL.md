---
name: clean
description: Clean up comments across a branch's committed and uncommitted changes without altering behavior.
---

# Clean Comments

Only touch comments—never code, logic, formatting, or behavior.

1. Resolve the target branch from the request or use the current branch. Do not switch branches.
2. Get the scope and the diff content in a single read-only call — merge base, commits, changed files, and the hunks themselves — covering the branch's commits plus staged and unstaged changes when the target is current. There is no second diff call, and above all no diff call per changed path. Each hunk line carries its own line number, so a comment's location is known before any file is opened.
3. That diff is the comment context — never re-fetch it a file at a time. Every line this skill may touch is already in the hunks it returned, so the changed-file list is not something to walk: a scope call returning eighteen paths followed by a diff call each is the failure this step replaces. From the hunks, select the files that actually carry a comment in scope, and open exactly that subset in one batched read, since editing needs the file read first. A changed file with no comment in its hunks is never opened at all, and a file discovered mid-edit joins the next batch rather than taking a turn of its own. This governs a list that arrived complete; a probe whose target is chosen by the previous result is a real dependency and is unaffected.
4. Inspect only comments on added or modified lines; ignore generated files and out-of-scope earlier work. Markdown prose is always out of scope because `$truncate` owns density with claim-preservation rules; comments inside fenced code blocks are out of scope too.
5. Delete comments that restate code or narrate steps. Tighten verbose comments to the essential fact. Preserve licenses, directives, annotations, non-obvious constraints, JSX structural labels, and load-bearing empty-block comments.
6. Never add comments. Report removed and tightened counts by file.
7. Do not commit — a rule scoped to this skill, not to whatever invoked it. The edits are left for the invoking workflow to commit as part of its own run; when one invoked you, hand back and continue it at its next step instead of stopping at uncommitted cleanup. If the invoker never says who commits, flag the uncommitted edits in the summary.
8. Teardown is never yours. Never remove a worktree here, by any route — whoever invoked this skill owns that workspace and its teardown.

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
