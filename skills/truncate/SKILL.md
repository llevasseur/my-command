---
name: truncate
description: Rewrite an okq documentation bundle for density without changing any claim, using dirty frontmatter as the default work queue.
---

# Truncate Documentation

Parse `--here` / `-h`, `--base <branch>`, `--bundle` / `-b <dir>`, `--all` /
`-A`, `--dry-run` / `-n`, `--yes` / `-y`, and optional scope. `-a` is not an
alias for `--all`. Except for dry run, hand the resolved density-pass criteria
to `$task`; it owns workspace setup, commits, `$clean`, `$pr`, and teardown.
Do not forward selection flags as `$task` flags.

1. Discover the bundle with `okq`, read its contract and templates, and resolve
   installed okq reference/maintenance skills when available.
2. Build the queue from `dirty: true` by default, every concept with `--all`, or
   exactly the explicit id/path/topic scope. Explicit scope overrides the dirty
   filter. Exclude generated indexes. An empty queue is a successful no-op.
3. Evaluate each doc independently, using Codex subagents in parallel only when
   delegation is allowed. Inventory every actionable claim first: commands,
   flags, defaults, paths, environment variables, behavior, ordering,
   guardrails, links, and non-obvious constraints.
4. Cut narration, ceremony, unactionable justification, repetition, filler, and
   redundant examples. Preserve every inventoried claim, required section, ADR
   rationale, frontmatter description, command line, code block, and table.
   Never fix suspected drift, add claims, rewrite voice, or bump timestamps.
5. Re-derive the claim inventory after each edit and restore anything missing.
   Confirm cuts over 40% unless `--yes`. Remove `dirty` from every evaluated doc,
   including an already-lean `reviewed` doc; dry run changes nothing.
6. Regenerate indexes and run bundle validation, deadlink, orphan, and repository
   doc gates. Report verdict and before/after size per doc, plus suspected drift
   left for `$docs`.

When a surviving sentence gets shorter, shorten it toward these forms. They
govern how a sentence already being cut comes out; they never license a voice
rewrite. One instruction per sentence. One term per concept, reused rather than
varied. The warning before the step it guards. Active voice and imperative for
an action. Literal wording over idiom. At most three nouns in a row. Explicit
conjunction scope. Uppercase MUST, MUST NOT, SHOULD, and MAY (RFC 2119) where
the obligation is the point, preserving the doc's existing force. An
instruction's force is part of its claim. Do not adopt ASD-STE100's closed
dictionary, sentence-length caps, or tense restrictions: they serve a
limited-vocabulary human reader and cost precision here.

Use `okq` for bundle queries rather than text grep. Quote glob-bearing arguments
for zsh. The bundle's own contract wins. The goal is higher signal per token,
not shorter text at any cost.

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
