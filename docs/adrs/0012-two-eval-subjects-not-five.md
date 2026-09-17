---
type: adr
title: The judgement layer ships with two eval subjects, not five
description: Only /clean comment keep/drop and the hook gate's UNJUDGEABLE blind spot have labels recoverable from recorded history, so the other three targets ship as inspectable question sets carrying no eval numbers and the campaign says so rather than letting its target list imply otherwise.
tags: [process, toolkit, commands, decisions, judge]
timestamp: 2026-09-16
dirty: true
decided-by: /dev
ratified: false
wayfinder: jev-judgement-layer
grill-round: 4
needs-human: true
---

# The judgement layer ships with two eval subjects, not five

## Status

Accepted, and **proposed by `/dev` rather than ratified by a human**. Written by an
unattended run under [ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s
convention: `decided-by: /dev`, `ratified: false`, `needs-human: true`.

It carries `needs-human: true` because it narrows the campaign's claims well below what
was asked for. Three of five named targets ship with no evidence attached, and a human
may reasonably want a different trade — fewer targets shipped, or the campaign held
until more corpora exist.

## Context

[ADR 0010](0010-eval-harness-before-the-layer.md) made the eval the campaign's
deliverable. That put the campaign's whole credibility on one claim from the proposal:
"The labels are RECOVERABLE FROM HISTORY rather than hand-made, which is the point."

The grill's fourth round asked the claim to be demonstrated rather than repeated:

> **For each of targets (1), (3), (4) and (5): name the artifact on disk the labels come
> from and what field in it is the label — or say plainly that they have none, in which
> case they are not eval subjects this campaign, and the honest scope is one set with
> real labels plus a client, question sets, and a harness built to take more sets later.**

Three of the four have none:

- **Target (1), `/trim`.** The six gates are answered inside a live conversation and
  the verdict is written nowhere — no commit, no artifact, no `verdict.json` field.
- **Target (3), subagent dispatch routing.** History records which `subagent_type` a
  site *named*, never which was right. Agreement with it would measure reproduction of
  the status quo including its mistakes, which is precisely the number that would
  justify promotion. The one genuine label — a recorded `/god` run where a
  `mycommand-finisher` declined `/review` and a second reviewer dispatch followed — is a
  correction, and corrections are rare by construction.
- **Target (4), pre-existing-vs-regression.** [Command toolkit](../specs/command-toolkit.md)
  bounds the screenshot keep at 7 days, so the corpus is a few dozen on one device; and
  `verdict.json` records `red`/`green` for a **run**, not the provenance of a specific
  failure, so even the survivors do not contain the label. The instruction already
  pointed away from this target: the expensive half is acquiring the baseline state,
  which wants a caching verb rather than a classifier.

**Target (5) was defended twice, and the first defence was wrong.** It cited 332
transcripts matching `refused wholesale inside an isolated worktree`. The grill's fifth
round showed that string is this repo's own gate refusal text, so a transcript carrying
it is one where the gate **fired** — meaning `UNJUDGEABLE` did not match, because it is
the early-out that stops the gate judging at all:

> The probe measured the population the gate already catches, which is the complement of
> the blind spot it is meant to label. 332 is not an understated corpus; it is close to
> an anti-corpus.

Re-measured with the actual regex from `src/hooks/lib/bash-shapes.mjs:15`, over the
recorded Bash calls, excluding sessions carrying the hook source as file content:

| Quantity | Count |
|---|---|
| Session transcripts scanned | 1090 |
| Excluded as editing this repo | 9 |
| Recorded Bash calls | 12226 |
| Calls matching `UNJUDGEABLE` | 1054 |
| Distinct sessions containing one | 313 |

Roughly **8.6% of every recorded Bash call falls through the regex unjudged**, and the
fall-throughs include shapes other gates in this repo target on purpose — a
`for … do` shell program, a `pbcopy <<'CPEOF'` heredoc, a `node -e` one-liner naming
files — reaching the tool unjudged because a `$`, a brace or a tilde appeared anywhere
in the string.

## Decision

**Two eval subjects, and the campaign says so in those words.**

- **`/clean` comment keep/drop** — labels from git, which records which comments
  survived each `/clean` commit, filtered by the pre-filter in
  [ADR 0011](0011-deterministic-comment-keeps-run-before-the-classifier.md).
- **The hook gate's `UNJUDGEABLE` blind spot** — a candidate population of 1054
  commands, labelled by outcome: a fall-through that ran and returned content is
  *allow*; one that was refused or failed and was then **reissued in a smaller form
  that succeeded** is *should have been refused*, with the reissued form recorded beside
  it as its own evidence.

**1054 is the candidate count, not the labelled count.** The outcome-pairing rule has
not been run, and a reissue can happen for an unrelated reason. So the first eval
ticket's first output is the **labelled** count, reported before any agreement number.
**If it lands in the dozens, target (5) drops to question-set-only** like the other
three, and the campaign has one eval subject.

**Targets (1), (3) and (4) ship as question sets with `--dry-run`-inspectable requests
and no eval numbers attached.** They are built, versioned and reviewable; they are not
measured. Their corpora accrue later — `/trim`'s prospectively from shadow records
paired with what the session did next, routing's from corrections as they occur.

## Consequences

The campaign that lands is materially different from the five-target judgement layer it
started as: smaller in runtime surface, narrower in claims, carrying evidence for two of
its five targets and none for the other three. Recording that here is the point of this
ADR — a target list alone would imply five measured targets, and that would be the
campaign's most misleading artifact.

What the project gains is a measurement apparatus whose numbers mean what they say, and
a first-hand count of a blind spot that was previously a line of code nobody had sized.
That 8.6% figure is useful on its own, independent of whether a classifier ever fills
the hole.

The cost is that three targets ship unmeasured and could sit that way indefinitely if
their corpora never accrue. The recovery is the same query the convention already
provides: these sets are visible in `src/toolkit/judge/`, and this ADR names why each
one has no number.

## Related

- ADR: [0008 No question set acts in this campaign](0008-no-question-set-acts-in-this-campaign.md)
- ADR: [0010 The campaign builds the eval before the layer](0010-eval-harness-before-the-layer.md)
- ADR: [0011 The deterministic comment keeps run before the classifier](0011-deterministic-comment-keeps-run-before-the-classifier.md)
- Spec: [Workflow gates](../specs/workflow-gates.md)
- Spec: [Command toolkit](../specs/command-toolkit.md)
