---
type: plan
title: jev-judgement-layer-08 — The docs this campaign owes
description: A feature doc for the new verb, a CHANGELOG entry held to the repo's own measured entry shape, README table rows, and a spec update stating plainly that the layer acts on nothing.
tags: [plan, wayfinder, judge, docs]
timestamp: 2026-09-16
---

# jev-judgement-layer-08 — The docs this campaign owes

**Wayfinder:** `jev-judgement-layer`
**Branch:** `task/jev-judgement-layer-08-docs`
**Status:** done · 2026-09-17

**Depends on every code ticket**, because it documents what actually landed rather than
what was planned.

## Criteria

### A feature doc for the verb

`docs/features/judge-verb.md` (or whatever name avoids colliding with the existing
`docs/features/judge.md`, which documents the `/judge` **command** — a different thing).
Fill Summary, Flags / Parameters, Behavior, Related, per
[Adding a command](../specs/adding-a-command.md).

It must say, in its own words and not by implication:

- **The layer acts on nothing.** Every question set is shadow-only, and promotion is a
  follow-up gated on the eval numbers ([ADR 0008](../adrs/0008-no-question-set-acts-in-this-campaign.md)).
- **Conversation-derived state leaves the device** when the layer is opted into, what the
  payload carries, and that `--dry-run` prints the exact body before anything is sent
  ([ADR 0009](../adrs/0009-conversation-derived-state-leaves-the-device.md)).
- **Two gates, default off**, and that with no key every command behaves exactly as today.
- **The verb and `/judge` the command are different surfaces** — the same relationship
  `pr` and `/pr` already have.

### The command toolkit spec

Add the new verbs to the Verbs table in
[Command toolkit](../specs/command-toolkit.md) — the judgement verb and ticket 06's facts
verb — and state the one thing that distinguishes this layer from every other verb: the
others print facts, this one prints judgements, and its answers currently decide nothing.

### CHANGELOG

One `### Added` entry under today's date, **held to the repo's own measured shape** in
`src/shared/changelog-entry-shape.md`: one bullet per user-visible change, a bold lead of
12 words or fewer, 2 to 3 sentences under 60 words, no nested lists.
`scripts/check-changelog.mjs` fails any bullet over 80 words in the newest two dated
sections, and it runs under `pnpm test`.

**Do not claim the layer does anything.** The user-visible change is a verb, a script, and
a measurement — not a behaviour change.

### README

Add the rows both README tables require for a new surface.

## Constraints

- **Every doc written or changed carries `dirty: true`** in its frontmatter. A hand-edit
  that skips the flag silently misses both `/docs` and `/truncate`
  ([Adding a command](../specs/adding-a-command.md)).
- Do not bump `updated` for a pure density pass; do bump it where a claim changed.
- `commands/` is generated and never hand-edited.
- **Do not edit the seven ADRs this campaign already wrote.** They are the record of what
  was decided and when. A decision that changed since is a *superseding* ADR, which is the
  process [ADR 0001](../adrs/0001-record-architecture-decisions.md) already prescribes.
- Run `okq --bundle docs index` after adding a feature doc, then
  `okq --bundle docs validate`.

## Done when

- [ ] A feature doc exists for the verb and states the four points above outright.
- [ ] The Command toolkit spec's Verbs table lists both new verbs.
- [ ] A CHANGELOG `### Added` entry passes `scripts/check-changelog.mjs`.
- [ ] Both README tables carry the new surface.
- [ ] Every touched doc carries `dirty: true`.
- [ ] `okq --bundle docs validate`, `okq --bundle docs index --check`, `pnpm test` and
      `./scripts/check-commands.sh` pass.
