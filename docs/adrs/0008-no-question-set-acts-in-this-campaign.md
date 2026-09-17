---
type: adr
title: No Jev question set acts in the campaign that introduces the layer
description: Every question set ships in shadow and promotion to acting becomes a follow-up gated on eval numbers, because the set nominated to act first turned out to be either redundant with deterministic facts or starved of the evidence its own payload forbids.
tags: [process, toolkit, commands, decisions, judge]
timestamp: 2026-09-16
dirty: true
decided-by: /dev
ratified: false
wayfinder: jev-judgement-layer
grill-round: 2
needs-human: true
---

# No Jev question set acts in the campaign that introduces the layer

## Status

Accepted, and **proposed by `/dev` rather than ratified by a human**. Written by an
unattended run under [ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s
convention: `decided-by: /dev`, `ratified: false`, `needs-human: true`.

It carries `needs-human: true` because it **overrides an explicit instruction the run
was given**. The instruction nominated `/trim`'s rubric as "the FIRST set allowed to
act for real"; this decision says no set acts at all. Reversing an instruction is the
clearest case ADR 0005 describes for marking a decision as one a human still owes.

## Context

The campaign adds an optional judgement layer over TypeSafe's Jev classifier. The ship
order it was handed put [trim](../features/trim.md) first, on this reasoning: `/trim`
is read-only, so a wrong answer costs nothing, which makes it the safe place to
calibrate the confidence thresholds every later set depends on.

The grill's second round asked this, verbatim:

> Your own answer dissolves target (1).
>
> You derived C1, C3, N1 and N2 from `timeline()`, `watchedOutputs()`, `state`'s
> `hasWork`/`diffStat`, and `git diff --diff-filter=U`. Those are **facts**, computed
> deterministically on this device. [...] Four deterministic booleans do not need a
> probabilistic classifier, and routing them through one strictly loses [...]
>
> You then conceded C2 and N3 are the weak two from a shape-only digest — and
> shape-only is now a commitment rather than a default, because the egress ADR you are
> writing forbids prose and file contents. So C2 ("could a replacement summary
> preserve the goal, the user decisions, the relevant failed approaches, the exact next
> action" — `src/commands/trim.md:28`) is being asked of a payload that by construction
> contains no goal, no decisions, no approaches and no next action. Jev would not be
> judging recoverability; it would be guessing it from tool-call counts.
>
> [...]
>
> And if the answer is "it buys threshold calibration for targets (2)-(5)": calibrating
> on the one set where Jev's answers are either redundant or evidence-starved teaches
> the thresholds nothing transferable. In that case name the set that should be first
> instead, and say what makes *its* judgement irreducibly probabilistic rather than a
> fact nobody has written the extractor for yet.

The reasoning behind the original order is sound and survives untouched: a read-only
command is the cheap place to be wrong. What it does not survive is the discovery that
the set has little for a classifier to do. Four of the six gates are deterministic and
leave for a facts verb under [ADR 0007](0007-deterministic-trim-gates-stay-a-facts-verb.md).
The remaining clauses need prose the payload was committed to excluding, which is
[ADR 0009](0009-conversation-derived-state-leaves-the-device.md)'s subject.

Calibration was the other half of the argument, and it fails for a separate reason.
`/trim` produces six answers per run against no recorded ground truth, so there is
nothing to measure agreement against.

## Decision

**Every question set ships in shadow. Nothing acts on a Jev answer in this campaign,
and promotion to acting is a follow-up gated on the eval numbers.**

Three consequences follow directly and are part of the decision rather than results of
it:

- **`/trim` is demoted to shadow**, on the residual gates alone.
- **`/clean`'s comment keep/drop becomes the calibration vehicle.** Its rubric at
  `src/commands/clean.md:63-65` asks whether a comment "restate[s] what the code
  plainly says" and whether it documents "something non-obvious the code can't
  express" — comparisons between a sentence and the code beside it, which no extractor
  answers and none is going to. And the labels are thousands and free: git records
  which comments survived each `/clean` commit, so agreement is measurable against
  recorded ground truth rather than against nothing.
- **The cost of a wrong answer stays bounded** the way the original argument wanted.
  `src/commands/clean.md:74` leaves every edit uncommitted, so a wrong keep/drop is
  visible in a diff before it lands — and in shadow it is not applied at all.

**Shadow mode is not what makes this safe.** Nothing acting is. That distinction
matters because the proposal presented shadow as the safety mechanism, and a mechanism
credited with safety it does not provide is the kind of thing a later change removes
as redundant.

## Consequences

The campaign lands a judgement layer that changes no run's outcome. Every command
behaves exactly as it does today, whether or not a key is present and whether or not
the layer is enabled — which was already the stated requirement for the no-key case
and now holds unconditionally.

A human reviewing the campaign is reviewing a measurement apparatus and a body of
evidence, not a behaviour change. That is a smaller review and a reversible one.

The cost is that the layer delivers no value in this campaign. Nothing it decides is
acted on, so the only return is the eval numbers — which is the honest position when
no number yet says any set is good enough to act on.

If a human ratifies this, the follow-up's job is promotion: take one set, read its
agreement by confidence band, and let it act behind a threshold. If a human overrules
it, the superseding ADR should say which set acts and what number justified it.

## Related

- ADR: [0005 Agent-authored decisions are marked in frontmatter](0005-agent-authored-decisions-are-marked-in-frontmatter.md)
- ADR: [0007 The deterministic trim gates stay a facts verb](0007-deterministic-trim-gates-stay-a-facts-verb.md)
- ADR: [0009 Conversation-derived state leaves the device](0009-conversation-derived-state-leaves-the-device.md)
- ADR: [0010 The campaign builds the eval before the layer](0010-eval-harness-before-the-layer.md)
