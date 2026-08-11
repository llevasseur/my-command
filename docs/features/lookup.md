---
type: feature
title: lookup
description: A read-only gate over the hosted concept store that answers term hit, field hit, or miss, so a term the corpus already holds is never named a second time.
tags: [command, vocabulary, concepts]
timestamp: 2026-08-09
dirty: true
---

# lookup

## Summary

Reads the hosted concept store and answers with **one of three outcomes**, not
with a result set. `/teach` had been writing to that store since it shipped and
nothing in this repo ever read it back, so a concept settled once could be
settled again months later under a second wording. `/lookup` is the gate that
stops that: it runs before a term is named, and its outcome decides whether a
`/teach` may start at all.

It is **read-only and writes nothing to the store, ever.** Every request is a
`GET`. It never saves, never re-teaches, and never edits a stored record.

## Flags / Parameters

- `--field` / `-f <field>` — the field the concept belongs to. It selects the
  neighbours in the field-hit outcome. Without it, neighbours come from the
  full-text search alone.
- `--limit` / `-l <n>` — how many neighbours to list. Default 10.
- Everything else — the term or the description to look up.

## Behavior

### The three outcomes are the design

A lookup is not a search, and the outcome rather than the row count is what a
caller acts on:

1. **An exact term hit** returns the stored Simplified Technical English sentence
   **verbatim** and stops. That sentence is the entire deliverable `/teach`
   exists to produce, so re-deriving it yields a second wording for one concept —
   what `/teach`'s own one-term-per-concept rule forbids and what nothing
   previously prevented, because `/teach` never checked.
2. **A field hit with no term hit** returns the neighbours **as context for the
   naming step, not as an answer**. A stored concept in the same field is what
   `/teach`'s first naming source — an installed skill covering the field — is
   trying to approximate.
3. **A miss** says so and exits. **A miss is the only outcome that authorizes a
   `/teach`.**

Only an exact term match is outcome 1: the query equal to a stored `term`,
compared trimmed and without case. A search result that merely mentions the query
is a neighbour and belongs to outcome 2. There is no fourth outcome, and a near
miss is never promoted to save a run.

### Store resolution

Every call into the store goes through one toolkit verb,
`my-command-tools concepts lookup`, shared with `/teach` and `/learn` rather than
inlined per command. `Bash(my-command-tools:*)` is allowlisted in
`src/hooks/settings-fragment.json`, so the verb runs without an approval
round-trip; the `node -e` block this replaced was not allowlistable and cost one
on every run.

Both halves of the address come from the environment, exactly as `/teach` reads
them for the save side. `IDEAS_URL` and `IDEAS_TOKEN` are read first, with
`CONCEPTS_URL` and `CONCEPTS_TOKEN` as the documented fallbacks, because ideas
and concepts are one dataset behind one Worker. The base URL addresses the
Worker; the token becomes the `Authorization: Bearer` header. Neither is
hardcoded, written to a file, or put on a command line or in a URL — the verb
reads both from `process.env` inside its own process, so the token stays out of
the command, the transcript, and the shell history.

The store is read in a fixed order, and the first probe that answers decides the
outcome:

1. `GET /api/concepts/concept?term=<query>` — the exact term. `200` is outcome 1
   and the run stops; `404` says only that no concept sits under that exact term.
2. `GET /api/concepts/search?q=<query>` — BM25 full text. A result whose `term`
   equals the query is promoted to outcome 1; every other result is a neighbour.
3. `GET /api/concepts?field=<field>` — the field listing, run only when
   `--field` was given. A row whose `term` equals the query is promoted to
   outcome 1 on the same terms as step 2; every other row joins the neighbours
   from step 2. A concept the term probe missed and BM25 did not rank still is
   the exact term, and reporting it as a neighbour would invite `/teach` to name
   it a second time.

Neighbours at the end of that order is outcome 2; nothing is outcome 3. A `5xx`
or a network error is retried once inside the call, as on the save side.

One call runs that whole order — `my-command-tools concepts lookup "<query>"
[--field <field>] [--limit <n>]`. It always exits `0` and always prints one first
line naming the outcome: `term hit:` followed by a `sentence:` line carrying the
stored sentence unmodified, `field hit:` followed by one `- term [field] sentence`
line per neighbour, or `miss:` with the cause appended when the corpus could not
be read. That line is the outcome. `--json` returns the structured result instead,
for a caller that wants the fields rather than the line.

### An unreachable store is a miss with a stated cause

A store the run could not read is a **miss, not a stop** — the same terms
`/teach` already sets for the save side. The run states the cause in one short
line: which variable was unset, the status code and short reason the store
returned, or the network error. That line is load-bearing rather than
housekeeping, because a corpus that holds nothing and a corpus that was never
read produce the same outcome, and only the second one means a following
`/teach` may duplicate a stored term.

### Output

- **Term hit** — the stored sentence on its own line, exactly as returned, then
  the term, the field, and a note when the store reported older versions. The
  bare sentence also goes on the clipboard, as `/teach` step 6 does, so it is
  usable in the prompt already being written. Then the run stops.
- **Field hit** — the neighbours as a short list, one `term — sentence` per line,
  under one line saying none of them is the term.
- **Miss** — one line, plus the cause when the store could not be read, and
  `/teach <the description>` as the next step.

A stored sentence is never re-worded. A paraphrase is the second wording this
command exists to prevent.

## Related

- Command source: `src/commands/lookup.md`
- Gates [teach](teach.md) at its step 1.5, before the naming step
- Reads the hosted concept store (`CONCEPTS_URL` / `CONCEPTS_TOKEN`) that
  [teach](teach.md) writes, through the shared `my-command-tools concepts` verb
  (`src/toolkit/verbs/concepts.mjs`) and the `src/shared/concepts-store.md`
  include the three store commands carry
- Spec: [Adding a command](../specs/adding-a-command.md)
