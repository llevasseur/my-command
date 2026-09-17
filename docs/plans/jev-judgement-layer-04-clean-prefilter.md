---
type: plan
title: jev-judgement-layer-04 — The /clean pre-filter and its git-history corpus
description: A deterministic pre-filter implementing /clean's four mandatory keeps, and an extractor that recovers keep/drop labels from git history with the pre-filtered comments excluded rather than scored.
tags: [plan, wayfinder, judge, clean]
timestamp: 2026-09-16
---

# jev-judgement-layer-04 — The /clean pre-filter and its git-history corpus

**Wayfinder:** `jev-judgement-layer`
**Branch:** `task/jev-judgement-layer-04-clean-prefilter`
**Status:** active

**Depends on** ticket 03 — the `/clean` question set defines what the pre-filter excludes.

## Criteria

### The pre-filter

Implement the four **mandatory keeps** from `src/commands/clean.md:65-67` as
deterministic code, run **before** any comment reaches the classifier. A comment is kept
without being judged when it is:

- a **license header**,
- a **linter directive** (`biome-ignore`, `eslint-disable`) or a doc/JSDoc annotation tag,
- a **JSX structural section header** (`{/* Header */}`) labelling a region of markup —
  JSX has no other lightweight way to mark these regions, so they are not ceremony,
- the **sole comment inside an intentionally empty block** (`catch {}`, `else {}`), which
  is load-bearing because Biome's `noEmptyBlockStatements` fails on an empty block with
  no comment.

Those are rules, not judgement.
[ADR 0011](../adrs/0011-deterministic-comment-keeps-run-before-the-classifier.md) sends
them to code on the same layering that sent `/trim`'s deterministic gates to a verb:
[Command toolkit](../specs/command-toolkit.md) states it as "Judgment stays with the
agent."

### The corpus extractor

Recover keep/drop labels from git. Each `/clean` commit records which comments survived
it, which is thousands of labels at no authoring cost — the reason
[ADR 0008](../adrs/0008-no-question-set-acts-in-this-campaign.md) made this the
campaign's calibration vehicle.

For each labelled comment the extractor emits the comment, the surrounding diff that
`/clean` judged it against, and the recorded outcome.

**Apply the pre-filter to the corpus too.** A comment the pre-filter would have kept is
**excluded rather than scored**. This is the half that is easy to skip and the half that
protects the metric: scoring them would mean measuring exactly the questions the
pre-filter removes at runtime, and the resulting agreement number would be inflated by
cases the classifier is never asked about.

**Report the majority-class baseline** alongside the corpus. Most comments survive a
`/clean`, so a classifier that always answered Keep would otherwise look strong, and
[ADR 0013](../adrs/0013-the-eval-bar-is-pre-registered.md)'s bar is expressed against
that baseline.

## Constraints

- **`/clean` itself is not rewired in this ticket.** Per
  [ADR 0010](../adrs/0010-eval-harness-before-the-layer.md), no runtime surface lands
  before the eval. The pre-filter ships as a library the harness uses, and ticket 07
  decides what, if anything, calls it at runtime.
- There is deliberately **no comment-scoping verb** in the toolkit —
  [Command toolkit](../specs/command-toolkit.md) says `/clean` needs the surrounding
  branch diff to judge comments and pre-filtering would remove that context. This ticket
  does not add one: the pre-filter drops comments from the *question set*, never trims
  the diff a judgement is made against.
- The extractor writes nothing into the repository. Its output is corpus data.

## Done when

- [ ] A pre-filter module implements all four mandatory keeps, with a test per keep.
- [ ] The extractor recovers labelled comments from `/clean` commits with their
      surrounding diff.
- [ ] A test asserts a pre-filtered comment is absent from the corpus rather than present
      with a label.
- [ ] The extractor reports the corpus size and the majority-class baseline.
- [ ] `pnpm test`, `pnpm run check` and `./scripts/check-commands.sh` pass.
