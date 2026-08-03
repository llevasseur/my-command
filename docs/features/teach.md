---
type: feature
title: teach
description: Learn the real name for something you can only describe, and leave with one Simplified Technical English sentence you can say back to any agent.
tags: [command, vocabulary, learning]
timestamp: 2026-08-02
dirty: true
---

# teach

## Summary

Turns a handwave into one sentence. You arrive able to describe something but not
name it; you leave with the term and a sentence short enough to repeat from
memory, printed in the reply and copied to the clipboard. It teaches a human — it
does not implement, open a PR, or invoke another command on your behalf.

The unit of value is the sentence, not the explanation around it. A run that
produces something longer, hedged, or more precise than you can say back has
failed, however accurate it is.

## Flags / Parameters

- `--here` / `-h` — read the current repo so the sentence can name real
  components, files, and existing patterns. **Default is context-only**: no file
  reads, so `/teach` runs from any directory, including one with no repo.
- Everything else — your description of the thing you cannot name.

## Behavior

Places the description in a field, then names it from the first source that
covers that field: an installed skill (`animation-vocabulary` for web motion,
`domain-modeling` for ubiquitous language, `apple-design` and `emil-design-eng`
for design vocabulary), the repo itself under `--here`, or model knowledge. It
never invents a term — an invented one survives into every later prompt and the
agent builds against it.

It then asks **one question at a time**, each with a recommended answer, and only
where the answer changes which concept this is or how you would ask for it. Each
question strips a layer instead of adding detail; parameters and edge cases
belong to whoever builds the thing. It stops as soon as you can say the sentence
back — not at a fixed count, and not on your sign-off.

The sentence follows [ASD-STE100](https://asd-ste100.org) Simplified Technical
English: one word one meaning, one term per concept, active voice, simple present
tense, no gerunds-as-nouns, 25 words maximum, and the term being taught as the
only hard word in it. Finally it points at public skills via `find-skills` — you
inherit someone's tuning rather than relearning the field one term at a time —
and offers to save the concept.

### The STE overlap with `/truncate`

`/truncate` and `/docs` take their **Rewrite toward** rules from the same
standard, and deliberately exclude STE's length cap, simple-tense restriction,
and closed dictionary — those serve a reader with a limited vocabulary in the
subject, which is not the reader a command file has. `/teach` writes for exactly
that reader, so it adopts the excluded parts. The two are not in conflict and
`/teach` deliberately does not load `src/shared/rewrite-toward.md`, whose
exclusion clause is right for a command file and wrong here.

### Saving a concept

On yes, one JSON object is appended to `concepts.jsonl` in claude-proxy's log
directory, resolved from `CLAUDE_PROXY_STORE` exactly as [improve](improve.md)
does. The append runs through `node` with every value passed as an argument, so a
sentence containing quotes or backslashes cannot corrupt the record, and the file
is append-only so concurrent runs cannot truncate each other.

Five fields are always written: `term`, `sentence`, `field`, `skills` (the skills
the run **applied**), and `savedAt`. Four are optional and written only when the
run produced them:

- `notes` — Markdown of the research behind the term.
- `tips` — short practical pointers.
- `sources` — URLs, specs, skill names, repo paths; an `http`/`https` entry is
  rendered as a link.
- `surfacedSkills` — the skills the run **discovered** rather than applied. A
  `shadcn/ui` concept that turns up `radix-primitives` and `tailwind-tokens`
  surfaced both and applied neither; those names used to be dropped on the floor.

**`find-skills` is never recorded in either list.** It is a meta-skill about
finding skills, not a skill the concept applied; recording it says the concept is
about skill discovery. claude-proxy filters it out on the read side too, so this
is belt and braces.

**An optional field with nothing in it is omitted, never written as `""` or
`[]`.** claude-proxy's detail page distinguishes absent from empty, and absence is
what makes it show its "nothing more to show" fallback. Records written before
these fields existed carry none of them and stay valid; nothing in
`concepts.jsonl` is rewritten or migrated. Lists are passed newline-separated
because a tip reliably contains a comma and never contains a newline.

**An unresolvable store is not fatal.** `/improve` hard-stops without the proxy
because the suggestions are its input; `/teach`'s input is you. With
`CLAUDE_PROXY_STORE` unset or missing, the sentence and the clipboard still land
and only the save is skipped, with the reason stated.

**Why a file and not the database.** claude-proxy's SQLite database is a
disposable materialized view over `logs/`, with `rm logs/claude-proxy.db &&
ingest` as a supported recovery — so nothing authored may live only there, which
is why `suggestion-status.json` is also a file. The precedent for authored data
that stays queryable is `command_run`: its source of truth is
`commands/runs.jsonl` and its table is rebuilt from that file under a watermark.

**The reading side lives in the claude-proxy repo**, which parses the file into a
browsable index and a per-concept detail page; its record contract is
`packages/core/src/concepts.ts`. The file format is the contract between the two
repos, so a field added on one side does not block the other — an older record
missing the optional fields still reads, and a newer record carrying them still
appends.

## Related

- Command source: `src/commands/teach.md`
- Reads the same store as [improve](improve.md) and [revive](revive.md)
- Shares a source standard with [truncate](truncate.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
