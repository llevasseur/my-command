---
name: docs
description: Reconcile an okq documentation bundle with the code, then truncate its dirty docs for density without changing claims.
---

# Reconcile Documentation

Parse `--here`, `--base <branch>`, `--dry-run`, `--bundle <dir>`, pass filters, `--yes`, and optional scope. Except for dry run, hand the complete reconciliation-and-density criteria to `$task` so it owns workspace, commits, `$clean`, and `$pr`. Run the density phase inline in that task; do not invoke `$truncate` and create a nested task.

1. Discover the bundle and read its own contract, templates, generated indexes, and validation commands.
2. Inventory documentable code concepts and classify docs as check, missing, or obsolete before editing.
3. Refresh docs by comparing claims to current code. Use git history only to rank suspicion; verify flags, defaults, paths, behavior, and neighboring references directly. Edit prose only where a claim changed, then set top-level `dirty: true` for the final density phase. Preserve an existing dirty flag during reconciliation.
4. Add missing docs using bundle templates and start each new doc with `dirty: true`. Treat ADRs as immutable decisions: supersede rather than rewrite. Audited-but-unchanged docs are not dirty, and dry runs set nothing.
5. Prune only with evidence that the documented concept is gone; repoint renames instead of deleting them.
6. Run the `$truncate` density rules inline over the resulting dirty queue, including dirty docs that predated this run. Exclude generated indexes. Inventory every actionable claim before cutting narration, repetition, filler, and redundant examples; preserve all claims, required sections, ADR reasoning, frontmatter descriptions, commands, code blocks, and tables. Re-derive the inventory after editing. Use `--yes` for the existing over-40% size guard. Do not fix suspected drift or bump claim timestamps. Remove `dirty` from every evaluated doc, including an already-lean doc. Treat an instruction's force as part of its claim, and shorten a surviving sentence toward the `$truncate` forms: one instruction per sentence; one term per concept; the warning before the step it guards; active voice and imperative for an action; literal wording over idiom; at most three nouns in a row; explicit conjunction scope; uppercase MUST, MUST NOT, SHOULD, and MAY (RFC 2119) at the doc's existing force. These govern only a sentence already being cut and never license a voice rewrite. Do not adopt ASD-STE100's closed dictionary, sentence-length caps, or tense restrictions.
7. Regenerate indexes, run bundle validation and repository doc gates, and report reconciliation verdicts plus density verdicts and before/after sizes. Report any deferred dirty docs as incomplete work; a successful run leaves the dirty queue empty. Dry run reports the reconciliation plan and projected density queue without mutation.

The bundle's own contract wins if it uses a different density-work-queue key.

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
