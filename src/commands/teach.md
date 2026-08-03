---
description: Learn the real terminology for a technique you can only describe, grill the plan into a spec, then copy a /god invocation written in that vocabulary
argument-hint: "[--to <command>] [--no-grill] [--glossary|-g] <description of the technique you want>"
allowed-tools: Bash, Read, Grep, Glob, WebSearch, WebFetch, Skill
---

You can describe the outcome but not name it, so an agent handed the raw description builds the cousin of the thing you meant. This command supplies the missing vocabulary: it identifies the technique, teaches you the terms practitioners use, grills the plan until the decisions are settled, and hands you a ready-to-paste `/god` invocation written in that vocabulary.

Input is the text in the `<command-args>` block above — a description of the technique, however vague. Parse leading flags off the front; everything else is the description.

**Never implement anything here, and never run the target command.** The deliverable is vocabulary plus a composed invocation on the clipboard.

## Flags

- `--to <command>` — target command for the hand-off. Default `god`. Passed to `/cp` as its first token.
- `--no-grill` — skip Step 2. Name the technique, then compose from the description as it stands.
- `--glossary` / `-g` — teach only: Steps 1 and 3, no grill and no hand-off. Nothing is copied.
- Anything not a recognized flag is part of the description.

## Step 1 — Name the technique

Turn the description into the term a practitioner would use. Look facts up rather than asking:

1. **This repo first.** If the description points at code that exists here, read it — a codebase's own name for a thing beats a general one, and `AGENTS.md` plus `docs/` may already fix the vocabulary.
2. **Installed skills.** A reverse-lookup glossary skill covering the domain (for motion and UI, `animation-vocabulary`) resolves "the bouncy thing when a popover opens" faster than a search. Load it with the `Skill` tool when the domain matches.
3. **The web**, when the term is not local. Prefer primary sources — spec text, the library's own docs, the paper that named it.

Report, compactly:

- **The term**, and a one-line definition in the user's own scenario.
- **Near neighbors** it gets confused with, and the distinction that separates them — this is what stops an agent from building the cousin.
- **The agent-facing phrasing**: the two or three words that actually change what gets built.

Ambiguous between two techniques → name both and let Step 2's first question settle it. Nothing recognizable → say plainly that the description doesn't match a named technique, and treat the user's own words as the vocabulary rather than inventing a term.

## Step 2 — Grill it into a spec

Invoke the `grilling` skill with the `Skill` tool, scoped to this technique. Its rules govern: one question at a time, wait for the answer, a recommended answer with every question, facts looked up rather than asked, decisions left to the user.

Grill the terminology as well as the plan — a variant, a default the user didn't pick, or a name that means different things in two ecosystems is a question, not an assumption. Stop when the remaining questions no longer change what an agent would build.

## Step 3 — Teach back

Restate in a handful of lines: the term settled on, each decision from Step 2 in one clause, and any term deliberately rejected with why. This is what the user keeps after the clipboard is overwritten.

Under `--glossary` / `-g`, stop here.

## Step 4 — Hand off to `/cp`

One `Skill` call: `skill: "cp"`, `args:` the target command (default `god`) followed by the criteria.

Write the criteria in the learned vocabulary — the term from Step 1, the decisions from Step 2, and the constraints the user stated. It has to stand alone for an agent that never saw this conversation. Don't pass `--verbatim`; `/cp` shaping on top of it is fine.

`/cp` owns the clipboard write and never runs the target. **Never invoke `/god` (or whatever `--to` names) yourself, and never print the composed criteria** — printing it is the cost `/cp` exists to avoid.

## Step 5 — Close the run in a text-only turn

Two or three lines: the term taught, and that the invocation is on the clipboard for which command. <!-- include: shared/text-only-turn.md -->Deliver that report in a **text-only turn** — a final message carrying text and **zero tool calls**, sent after the last tool call returns rather than alongside it, because a run's outcome is recorded only from a message with no tool call in it: end on (or bundle the report into) a tool call and the run reads as unfinished even though the work landed. Every ending owes that turn — shipped, nothing-to-do, blocked, failed, refused, cut short, or a question back to me — and a subagent's report is never it, because the outcome belongs to the session the run started in.<!-- /include -->

## Notes

- **Teaching is the product; the clipboard is the delivery.** Skipping Step 3 to reach the hand-off faster defeats the command — the user came for the word.
- Never invent a term to sound authoritative. An invented term is worse than the user's own description, because it survives into the prompt and the agent builds against it.
- Never read files, grep, or search in Step 4 — that research belongs in Step 1, and `/cp` does none of its own.
