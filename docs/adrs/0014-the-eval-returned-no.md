---
type: adr
title: The eval returned no, and the layer ships measured rather than working
description: Subject B abandoned on a labelled corpus of 3 against a floor of 200 because the transcript store records no outcomes, and Subject A was never replayed for want of a key — so the campaign ships a measurement apparatus and a negative result rather than a working layer.
tags: [process, toolkit, decisions, judge, eval]
timestamp: 2026-09-17
dirty: true
decided-by: /dev
ratified: false
wayfinder: jev-judgement-layer
grill-round: 6
needs-human: true
---

# The eval returned no, and the layer ships measured rather than working

## Status

Accepted, and **proposed by `/dev` rather than ratified by a human**. Written by an
unattended run under [ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s
convention: `decided-by: /dev`, `ratified: false`, `needs-human: true`.

It carries `needs-human: true` because it records a **negative result** and what follows
from it. Whether to spend on the one subject still measurable, and whether to keep or
remove the layer, are calls a human makes.

## Context

[ADR 0013](0013-the-eval-bar-is-pre-registered.md) fixed every threshold before the
harness existed, so that the eval could conclude *no*. It has, and this ADR records what
it concluded. The harness ran on 2026-09-17 as ticket 05 of the campaign.

### Subject B abandoned, and the reason invalidates a premise

[ADR 0012](0012-two-eval-subjects-not-five.md) claimed the blind-spot label was "a natural
experiment already recorded in those transcripts, and it is not a counterfactual": a
fall-through that ran and returned content is *allow*; one refused or failed and then
reissued smaller is *should have been refused*.

**That premise is false, and the harness is what established it.** Measured over the
store:

| Quantity | Count |
|---|---|
| Transcripts | 1,090 |
| Recorded Bash calls | 24,402 |
| `UNJUDGEABLE` candidates | 1,923 across 527 sessions |
| **Labelled after outcome-pairing** | **3** |

**Verdict: ABANDON, failing bar `B.corpus`** — fewer than 200 labelled commands.

The store records tool **calls** and assistant prose. It records no results, no exit
codes, and no error text, so the outcome half of the pairing rule is not on disk
anywhere. 1,537 of the 1,923 candidates had no recorded outcome at all; 347 were reissued
smaller with nothing recording a failure; 36 read as a failure with no reissue. 1,730 are
stored truncated to roughly a 50-character prefix.

**The labeller deliberately refuses to default to `allow`.** Doing so would have labelled
the entire corpus and produced a large, meaningless agreement number — the same
circularity the grill removed three times before this.

The candidate count also moved: ADR 0012 recorded 1,054 across 313 sessions and the
harness measured 1,923 across 527. That is the store growing, not an error in either
figure, and it changes nothing about the verdict.

### Subject A was never replayed

`TYPESAFE_API_KEY` is unset on this device, so **no request was ever sent**. The corpus
half needs no network and is real — 1,911 labelled rows from 24 `/clean` commits, keep
1,653, delete 168, tighten 90, at an 86.5% majority-class baseline, with 584 comments
excluded by the [ADR 0011](0011-deterministic-comment-keeps-run-before-the-classifier.md)
pre-filter.

**Verdict: INCOMPLETE.** All four bars report `not-measured` rather than passing, because
a run without a key cannot report a pass it did not earn.

## Decision

**Subject B drops to question-set-only**, which is [ADR 0012](0012-two-eval-subjects-not-five.md)'s
own stated consequence rather than a new decision. `bash-shape.json` ships as a versioned,
inspectable question set carrying no numbers, exactly as `trim`, `dispatch-route` and
`verify-regression` already do.

**The campaign therefore ships with zero measured subjects**, and the docs say so
outright rather than letting a target list imply otherwise. What ships is a measurement
apparatus, a corpus, and a negative result.

**The layer is not removed.** [ADR 0013](0013-the-eval-bar-is-pre-registered.md) says to
remove it rather than leave it dormant **if both subjects fail** — and Subject A has not
failed. It was not measured. Removing a layer on an unmeasured subject would discard the
apparatus that is the only way to measure it.

**Nothing is promoted.** [ADR 0008](0008-no-question-set-acts-in-this-campaign.md) already
held that nothing acts in this campaign, and no number now exists that would justify
changing it.

**The spend was never incurred and is not authorised here.** With a key present the
harness would issue one batched call per file across 24 commits. That is a human's call
to make, and this run did not make it.

### Two defects in ADR 0013 that implementation exposed

- **Subject A's price bar cannot be measured as written.** It is a ratio against the
  generative pass `/clean` replaces, and that pass's token count is measured nowhere.
  Measuring it needs an instrumented generative `/clean` run, which no ticket owned. It
  is flagged rather than estimated, because ADR 0013 forbids estimating price.
- **Subject B's corpus bar was the right bar and fired on the wrong cause.** It was
  written to catch a thin outcome-pairing yield. It caught a store that records no
  outcomes at all, which is a stronger result than the bar was aimed at.

## Consequences

**The bar worked, and that is the campaign's real return.** An eval whose thresholds were
set after the numbers landed would have reported 3 labelled commands as "early days" and
promoted on the strength of the apparatus existing. Fixing the floor at 200 in advance
turned the same 3 into an abandonment.

The project learns something durable and cheap: **the proxy transcript store cannot
support any outcome-labelled eval**, for this question or any other. That constrains
every future eval built on it, and nobody has to rediscover it.

The 8.6% blind-spot measurement from ADR 0012 stands and is still useful on its own.

What a human now owns: whether to spend on replaying Subject A, whether to instrument a
generative `/clean` so its price bar becomes measurable, and whether recording outcomes
in the proxy store is worth doing so an outcome-labelled eval becomes possible at all.

## Related

- ADR: [0008 No question set acts in this campaign](0008-no-question-set-acts-in-this-campaign.md)
- ADR: [0011 The deterministic comment keeps run before the classifier](0011-deterministic-comment-keeps-run-before-the-classifier.md)
- ADR: [0012 The judgement layer ships with two eval subjects, not five](0012-two-eval-subjects-not-five.md)
- ADR: [0013 The numbers that abandon the judgement layer are fixed before the eval runs](0013-the-eval-bar-is-pre-registered.md)
