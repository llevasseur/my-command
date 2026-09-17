---
type: adr
title: The deterministic comment keeps run before the classifier and leave the eval corpus
description: Four of /clean's rules are mechanical keeps rather than judgement, so they run as a code pre-filter before any comment reaches Jev, and pre-filtered comments are excluded from the recovered corpus so free correct answers cannot inflate the agreement metric.
tags: [process, commands, decisions, judge]
timestamp: 2026-09-16
dirty: true
decided-by: /dev
ratified: false
wayfinder: jev-judgement-layer
grill-round: 3
---

# The deterministic comment keeps run before the classifier and leave the eval corpus

## Status

Accepted, and **proposed by `/dev` rather than ratified by a human**. Written by an
unattended run under [ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s
convention: `decided-by: /dev`, `ratified: false`. No `needs-human` flag: it settles
where a mechanical rule runs, which is the implementation detail an unattended run is
right to decide.

## Context

[ADR 0008](0008-no-question-set-acts-in-this-campaign.md) made
[clean](../features/clean.md)'s comment keep/drop the campaign's calibration vehicle,
on the strength of a rubric already written and labels git already records.

The proposal described that rubric as "a three-option choice (Delete, Tighten, Keep)".
The grill's third round recorded this, verbatim:

> The proposal calls `/clean` "a three-option `choice`," but
> `/Users/llevasseur/Documents/ghub/my-command/src/commands/clean.md:63-68` is
> delete/tighten/keep **plus four mandatory keeps**: license headers, linter directives
> (`biome-ignore`, `eslint-disable`), JSX structural section headers, and the sole
> comment in an intentionally empty block (`catch {}`), which is load-bearing for
> Biome's `noEmptyBlockStatements`. Those four are deterministic rules, not judgement,
> and by the layering just conceded in round 2 they belong in code *before* the
> classifier sees the comment. Lifting the rubric wholesale into criteria would hand Jev
> four questions it cannot get wrong and one it can.

The layering it refers to is [ADR 0007](0007-deterministic-trim-gates-stay-a-facts-verb.md),
which sent `/trim`'s deterministic gates to a facts verb on the rule
[Command toolkit](../specs/command-toolkit.md) already states: judgement stays with the
judging layer, and a fact gets code.

There is a second cost specific to this set. The campaign's whole deliverable is the
eval numbers ([ADR 0010](0010-eval-harness-before-the-layer.md)), and agreement is the
metric promotion will be read off. Four questions a classifier cannot get wrong would
raise that number without any of the raise meaning anything.

## Decision

**The four mandatory keeps are a deterministic pre-filter in code, and they run before
any comment reaches the classifier.**

From `src/commands/clean.md:65-67`, a comment is kept without being judged when it is:

- a license header,
- a linter directive (`biome-ignore`, `eslint-disable`) or a doc/JSDoc annotation tag,
- a JSX structural section header (`{/* Header */}`) labelling a region of markup,
- the sole comment inside an intentionally empty block (`catch {}`, `else {}`), which
  is load-bearing because Biome's `noEmptyBlockStatements` fails on an empty block with
  no comment.

The question set is the three-option choice over the comments that **survive** that
pre-filter.

**The same exclusion applies to the recovered corpus.** A comment the pre-filter would
have kept is dropped from the eval corpus rather than scored. This is the half that is
easy to skip and it is the half that protects the metric: recovering labels from git
without applying the pre-filter would score exactly the questions the pre-filter exists
to remove, and the resulting agreement number would be inflated by the cases the
classifier was never asked about at runtime.

## Consequences

The agreement number measures the judgement, which is the only thing worth measuring.
Runtime and corpus are filtered by one rule, so the number the eval reports is the
number the runtime path would have earned.

Every mandatory keep becomes mechanical, which is stricter than the prose it comes
from. A generative `/clean` run today can talk itself out of one; the pre-filter cannot.
That is a small improvement to `/clean` independent of whether the judgement layer
survives.

The cost is a second place the rubric lives. `src/commands/clean.md` states the keeps in
prose for the agent, and the pre-filter states four of them in code, so a change to
either can drift from the other. The repo's existing answer to that shape is the
`check-commands.sh` invariant, and a future ticket should hold the pre-filter's rule
list against the command's prose the way invariant 16 holds the diff-walking rule
against its copies.

## Related

- ADR: [0007 The deterministic trim gates stay a facts verb](0007-deterministic-trim-gates-stay-a-facts-verb.md)
- ADR: [0008 No question set acts in this campaign](0008-no-question-set-acts-in-this-campaign.md)
- ADR: [0010 The campaign builds the eval before the layer](0010-eval-harness-before-the-layer.md)
