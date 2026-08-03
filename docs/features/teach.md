---
type: feature
title: teach
description: Name the technique a user can only describe, grill the plan into a spec, and copy a /god invocation written in that vocabulary.
tags: [command, terminology, grilling, clipboard]
timestamp: 2026-08-02
dirty: true
---

# teach

## Summary

For the case where you know the outcome but not the word for it, and an agent
handed the raw description builds the cousin of the thing you meant.
`/teach <description>` identifies the technique, teaches the terms practitioners
use, runs the `grilling` skill until the decisions are settled, and hands the
result to [cp](cp.md) as a ready-to-paste `/god` invocation. It implements
nothing and never runs the target command.

## Flags / Parameters

- `--to <command>` — hand-off target, passed to `/cp` as its first token.
  Default `god`.
- `--no-grill` — skip the interview; compose from the description as given.
- `--glossary` / `-g` — teach only. No interview, no hand-off, nothing copied.
- Everything else — the description of the technique.

## Behavior

**Name it.** Facts are looked up, not asked: this repo first (a codebase's own
name for a thing beats a general one; `AGENTS.md` and `docs/` may already fix the
vocabulary), then any installed reverse-lookup glossary skill covering the domain
(`animation-vocabulary` for motion and UI), then the web, preferring spec text,
library docs, or the paper that named it. The report gives the term with a
one-line definition in the user's scenario, the near neighbors it is confused
with and what separates them, and the two or three words that change what gets
built. Two plausible techniques → both are named and the first interview question
settles it. Nothing recognizable → it says so and keeps the user's own words
rather than inventing a term.

**Grill it.** The `grilling` skill runs scoped to the technique — one question at
a time, a recommended answer with each, decisions left to the user. A variant, an
unpicked default, or a term that differs across ecosystems is a question rather
than an assumption.

**Teach back.** The term settled on, each decision in one clause, and any
rejected term with why — what the user keeps once the clipboard is overwritten.

**Hand off.** One `/cp <target> <criteria>` call, criteria written in the learned
vocabulary and phrased to stand alone for an agent that never saw the
conversation. `/cp` owns the clipboard write, so the composed criteria are never
printed and the target command is never invoked.

## Related

- Command source: `src/commands/teach.md`
- Command: [cp](cp.md) — performs the clipboard write
- Command: [god](god.md) — the default hand-off target
- Spec: [Adding a command](../specs/adding-a-command.md)
