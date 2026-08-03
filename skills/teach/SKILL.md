---
name: teach
description: Name the technique the user can only describe, grill the plan into a spec, then copy a $god invocation written in that vocabulary.
---

# Teach the terminology, then hand off the prompt

The user can describe an outcome but not name it, so an agent handed the raw
description builds the cousin of the thing they meant. Supply the missing
vocabulary, settle the decisions, and put a ready-to-paste invocation on the
clipboard. Implement nothing, and never run the target skill.

Arguments: leading flags, then the description.

- `--to <skill>` — hand-off target. Default `god`.
- `--no-grill` — skip the interview; compose from the description as given.
- `--glossary` / `-g` — teach only. No interview, no hand-off, nothing copied.

## 1. Name it

Look facts up instead of asking. Read this repo first — its own name for a thing
beats a general one, and `AGENTS.md` and `docs/` may already fix the vocabulary.
Then any installed glossary skill covering the domain (`$animation-vocabulary`
for motion and UI). Then the web, preferring spec text, the library's own docs,
or the paper that named it.

Report the **term** with a one-line definition in the user's scenario, the
**near neighbors** it is confused with and what separates them, and the two or
three words that actually change what gets built. Ambiguous between two
techniques → name both and let the first interview question settle it. Nothing
recognizable → say so and use the user's own words rather than inventing a term.

## 2. Grill it

Run `$grilling` scoped to this technique: one question at a time, wait for each
answer, offer a recommended answer, look facts up, leave decisions to the user.
A variant, an unpicked default, or a term that means different things in two
ecosystems is a question, not an assumption. Stop when further questions would
not change what an agent builds.

## 3. Teach back

A handful of lines: the term settled on, each decision in one clause, and any
term rejected with why. This is what the user keeps after the clipboard is
overwritten. Under `--glossary` / `-g`, stop here.

## 4. Hand off

Run `$cp <target> <criteria>` — target defaults to `god`. Write the criteria in
the learned vocabulary: the term, the decisions, the stated constraints, phrased
to stand alone for an agent that never saw this conversation. Do not pass
`--verbatim`. `$cp` owns the clipboard write; never invoke the target skill and
never print the composed criteria.

Teaching is the product and the clipboard is only delivery — skipping step 3 to
finish sooner defeats the workflow. Never invent a term to sound authoritative;
it survives into the prompt and the agent builds against it. Do no research in
step 4 — that belongs to step 1.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. Two or
three lines — the term taught, and that the invocation is on the clipboard for
which skill. A run's outcome is recorded only from a message with no tool call in
it, so ending on one records no outcome at all. Every ending owes that turn,
including one that stops at the glossary, is blocked, or hands work back to an
invoking workflow.
