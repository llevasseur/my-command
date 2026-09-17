---
type: adr
title: The numbers that abandon the judgement layer are fixed before the eval runs
description: Pre-register the agreement, coverage, price and latency thresholds at which each eval subject is abandoned rather than promoted, so the eval can conclude no — an eval whose bar is set after the first results is a measurement whose interpretation was reserved.
tags: [process, toolkit, decisions, judge]
timestamp: 2026-09-16
dirty: true
decided-by: /dev
ratified: false
wayfinder: jev-judgement-layer
grill-round: 6
needs-human: true
---

# The numbers that abandon the judgement layer are fixed before the eval runs

## Status

Accepted, and **proposed by `/dev` rather than ratified by a human**. Written by an
unattended run under [ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s
convention: `decided-by: /dev`, `ratified: false`, `needs-human: true`.

It carries `needs-human: true` because the bar decides whether a piece of work is
abandoned. Every number below is a judgement call made without a human present, and each
is the kind a human would want to set themselves.

## Context

[ADR 0010](0010-eval-harness-before-the-layer.md) made the eval the campaign's
deliverable, and [ADR 0012](0012-two-eval-subjects-not-five.md) cut it to two subjects
with recoverable labels. The grill's sixth and final round found what was still missing:

> The campaign's entire justification is "the eval produces numbers." But no number has
> been named that would make the answer **no**. The proposal carries a 0.5 abstention
> floor and a 0.9 destructive threshold — those are per-call confidence gates governing
> when Jev's answer is *used at runtime*. They are not a promotion bar. Nothing states
> what agreement at high confidence, what price per call, or what p95 latency would mean
> "this layer does not work, do not promote it, and the follow-up does not happen."
>
> An eval with no pre-registered bar cannot conclude no. It produces numbers, and
> whoever reads them decides afterwards whether they were good — the same circularity
> this grill has already removed twice, relocated one last time from the ground truth to
> the decision rule. The pressure to read them favourably will be highest precisely
> because a client, five question sets, a harness and four ADRs will already exist by
> then.

The distinction it draws is real and was being elided. The 0.5 abstention floor and the
0.9 destructive threshold are **runtime** gates: they decide when one answer is used.
A **promotion** bar decides whether a question set is worth using at all. The campaign
had the first and not the second.

## Decision

**Every threshold is fixed here, before the harness runs and before any result is
visible.**

**Coverage is half of every bar.** A classifier that abstains on almost everything can
post a perfect agreement number and be worthless, so each bar is a pair — agreement
*at* a confidence band, and the share of the corpus that reaches that band. Either one
failing is a failure.

### Subject A — `/clean` comment keep/drop (`choice`), measured after the ADR 0011 pre-filter

| Metric | Abandon if |
|---|---|
| Agreement | at confidence ≥ 0.9, it fails to beat the majority-class baseline by 10 percentage points, or is below 0.90 absolute |
| Coverage | under 20% of the corpus lands at confidence ≥ 0.9 |
| Price | judging one file's comments costs more than 10% of the generative pass it replaces |
| Latency | p95 for one batched call covering a file's comments exceeds 5s |

The harness reports the **majority-class baseline first**, computed from the corpus.
Most comments survive a `/clean`, so a classifier that always answered Keep would
otherwise look strong. Price is expressed against what it displaces rather than in
dollars, computed from the returned `usage.input_tokens` and `usage.output_tokens`
rather than estimated. The latency bar is loose because `/clean`'s existing pass is
itself a model call.

### Subject B — the hook `UNJUDGEABLE` blind spot (`noul`)

A `noul` carries no confidence field, so the band is the value's own distance from the
middle: **high confidence means `|noul − 0.5| ≥ 0.4`**, at or beyond 0.1 and 0.9.

| Metric | Abandon if |
|---|---|
| Agreement | at that band, it is below 0.95 |
| Coverage | under 25% of the labelled corpus lands at that band |
| Latency | p95 end-to-end exceeds 200ms |
| Corpus | outcome-pairing yields fewer than 200 labelled commands |

The agreement bar is higher than Subject A's, and
[Workflow gates](../specs/workflow-gates.md) gives the reason in its own words: "a false
denial is worse than a missed violation." A wrong refusal costs a turn on somebody's
Bash call.

**The latency bar is expected to fail, and that is why it is written down.** A
`PreToolUse` gate runs on every tool call, and a network round trip is unlikely to clear
200ms. Fixing the number now is the difference between measuring it and discovering
afterwards that 400ms felt acceptable because a harness and several ADRs already existed.

The corpus bar replaces the vaguer "if it lands in the dozens" from
[ADR 0012](0012-two-eval-subjects-not-five.md) with a number.

### One bar that is a constraint rather than a number

If the client cannot be built as a raw `fetch` against Node 22's global fetch with
nothing added to `package.json` dependencies, the layer is abandoned rather than given a
dependency.

### What failing means

A subject that fails any bar is **not promoted**, and no runtime surface is built for it.

**If both subjects fail, the layer is removed rather than left dormant.** What the
campaign keeps is the facts verb from
[ADR 0007](0007-deterministic-trim-gates-stay-a-facts-verb.md), the measurement that
8.6% of recorded Bash calls fall through `UNJUDGEABLE` unjudged, and a documented
negative result. A dormant layer left in a published package is a thing someone enables
later without re-reading why it was switched off.

## Consequences

The eval can conclude **no**. That is the whole point, and it is not available to an
eval whose bar is set after the first numbers land.

A human reviewing the campaign can disagree with a threshold while the disagreement is
still cheap, because none of them has been tested against a result yet.

The cost is that some of these numbers are guesses. The 10-percentage-point margin, the
20% and 25% coverage floors, and the 10% price ratio are judgement calls with no prior
in this repository to anchor them. They are deliberately conservative, per the
instruction to begin conservative and loosen only as results justify it — and a bar set
slightly wrong in advance is worth more than a correct bar set afterwards.

Changing a threshold after a result is visible is not forbidden, but it is a
**superseding ADR** that states the number, the result that prompted the change, and the
argument — never an edit to this file.

## Related

- ADR: [0008 No question set acts in this campaign](0008-no-question-set-acts-in-this-campaign.md)
- ADR: [0010 The campaign builds the eval before the layer](0010-eval-harness-before-the-layer.md)
- ADR: [0011 The deterministic comment keeps run before the classifier](0011-deterministic-comment-keeps-run-before-the-classifier.md)
- ADR: [0012 The judgement layer ships with two eval subjects, not five](0012-two-eval-subjects-not-five.md)
- Spec: [Workflow gates](../specs/workflow-gates.md)
