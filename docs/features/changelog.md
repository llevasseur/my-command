---
type: feature
title: changelog
description: Add a concise entry to the current repo's CHANGELOG.md, matching its heading and grouping convention and held to a measured shape.
tags: [command, docs]
timestamp: 2026-07-15
updated: 2026-09-14
---

# changelog

## Summary

Adds a factual changelog entry for the session's work, matching the repo's heading and
grouping convention (dated vs. versioned, Added / Changed / Fixed) and held to the shape in
`src/shared/changelog-entry-shape.md`. A gate in `scripts/check-changelog.mjs` fails a
bullet that outgrows it.

## Flags / Parameters

- Optional **summary / area tag** (the `<command-args>` block) to record; otherwise
  the entry is derived from the actual changes.

## Behavior

Reads the toolkit's `state` verb — branch commits, per-file diffstat, and uncommitted
changes in one call — to base the entry on real changes, finds or creates
`CHANGELOG.md`, and inserts one grouped entry most-recent-first. Never invents a PR
or issue number; includes one only when the arguments or the branch supply it.
Applies the edit directly; does not commit unless the repo's flow expects it.

### The entry's shape is stated in numbers

"Concise and factual" was the whole instruction, and it lost: by September 2026 this repo's
own `CHANGELOG.md` carried single bullets of 400 to 900 words that walked through the
alternatives considered, the plumbing chosen, and the tests that pinned it. Each was a
design doc filed under a date. The cause was two rules working together: the command told a
run to copy existing entries' style exactly, so one long entry became the template for the
next, and nothing measured the result.

The shape lives once in `src/shared/changelog-entry-shape.md` and is included by both
`/changelog` and `/task` Step 2, so the two places an entry gets written read the same
numbers:

- One bullet per user-visible change.
- A bold lead of 12 words or fewer naming the change.
- A body of 2 to 3 sentences, under 60 words.
- At most one "because" clause, and no nested lists.
- Internal wiring stays out unless it changes behavior someone sees.
- The why lives in `docs/features/<cmd>.md`; the entry links it rather than restating it.

Step 3 of the command now matches only a repo's heading and grouping convention. Prose style
is deliberately not copied, because copying it is how one bloated entry sets the style for
every later one.

### The gate

`scripts/check-changelog.mjs` parses the newest two dated (`## YYYY-MM-DD`) sections of
`CHANGELOG.md` and fails any top-level bullet over 80 words, counting a wrapped bullet
whole and an indented sub-bullet against its parent. The limit sits above the 60-word target
so a bullet a sentence over still passes and one that became an essay does not. Only the
two newest sections are read: older entries are history, and rewriting them to a rule that
did not exist when they were written would be its own change.

It runs two ways. `scripts/check-changelog.test.mjs` runs it under `pnpm test`, which is
what `my-command-tools verify` discovers, so `/task` Step 2 catches an oversized entry
before `/pr`. `scripts/check-commands.sh` runs it as invariant 18b beside the doc-snippet
check, so PR CI blocks on it too.

## Related

- Command source: `src/commands/changelog.md`
- Shape: `src/shared/changelog-entry-shape.md`
- Gate: `scripts/check-changelog.mjs`
- Spec: [Adding a command](../specs/adding-a-command.md)
