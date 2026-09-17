---
type: adr
title: A verify failure carries its own provenance, set after the fact rather than guessed at record time
description: /verify's verdict record gains one entry per failure, each with a derived id and a provenance that starts unset, and a shots resolve action writes regression or pre-existing onto that id once a fix or a look at the default branch settles it.
tags: [process, toolkit, commands, decisions, judge]
timestamp: 2026-09-17
dirty: true
decided-by: /god
ratified: false
needs-human: true
wayfinder: jev-judgement-layer
---

# A verify failure carries its own provenance, set after the fact rather than guessed at record time

## Status

Accepted, and **proposed by `/god` rather than ratified by a human**. Written by an
unattended run under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s convention:
`decided-by: /god`, `ratified: false`.

It carries `needs-human: true`. Unlike
[ADR 0007](0007-deterministic-trim-gates-stay-a-facts-verb.md), which settled where a
computation lives, this commits the project to a two-word vocabulary a later corpus
will be counted in and to a new action on a shipped verb. Both are interface
commitments, and the rule is to mark when in doubt.

## Context

[verify-regression](../../src/toolkit/judge/verify-regression.json) asks one noul: is
this failure a regression the branch introduced, or a gate that was already red on the
default branch. It ships with `"labels": "none"`, and its own file said why — not that
nobody had labelled the corpus, but that **no label could exist to find**:

> verdict.json records red/green for a RUN, not the provenance of a specific failure, so
> even the surviving runs do not contain the label.

That is a recording problem rather than a labelling one. `Verdict` in
[shots.mjs](../../src/toolkit/lib/shots.mjs) carried a tier, a verdict, a round count,
the screenshot read-back and the gaps — every field describing the round as a whole. A
branch that introduced two failures and inherited a third recorded the same `red` as a
branch that inherited all three. Nothing in the record could tell them apart afterwards,
and no amount of labelling effort reaches a fact the file never held.

The second constraint is the one that shapes the design. **Provenance is not knowable
when the failure is recorded.** The round knows a gate went red. Whether the branch
caused it is settled later, by one of two events: the fix lands and clears it, or
somebody checks the default branch and finds the gate already red there. A field filled
in at record time would be a guess, and a guess is the exact thing this set exists to
replace.

The third is [ADR 0007](0007-deterministic-trim-gates-stay-a-facts-verb.md)'s rule.
Anything a function can decide exactly belongs in a verb rather than in the classifier.
With both log tails in hand, telling a regression from a pre-existing failure is a
comparison, not a judgement — and the set's own `scope` already says the expensive half
is acquiring the baseline, which "wants a caching verb rather than a classifier". So
nothing here routes through Jev.

## Decision

**A failure is a record of its own, with an identity that outlives the round and a
provenance field that starts unset and is written later.**

Two halves, both deterministic:

- **`shots record --failure "<gate> | <what it said>"`**, repeatable, adds one entry to
  `verdict.json` per failure: `{id, gate, summary, provenance: null}`. There is no flag
  for asserting a provenance here, because nothing at record time knows one.
- **`shots resolve --failure <id> --provenance regression|pre-existing [--note <text>]`**
  writes the answer onto that id, whenever it is established.

**The id is derived from the failure, not assigned to it** — a SHA-256 prefix over the
gate and the summary, with case and run-together whitespace normalized out. Derived
because the two halves are separate commands run on different days, so the second one
has to arrive at the same id from the same failure. A counter would number one surviving
failure differently in each round, and a run directory plus an index would move the
moment the keep was swept. The known limit is that a message carrying a duration, a
timestamp, or a temp path takes a fresh id each round; the normalization errs toward two
ids for one failure rather than one id over two different failures.

**Resolving updates every record on the branch carrying that id, not only the newest.** A
failure that survived four rounds was recorded four times, and leaving three unresolved
would make one failure read as both settled and open depending on which run was opened.
`mergeVerdicts` folds failures by id and lets a provenance outrank recency for the same
reason: the resolution routinely lands in an older record, because the last round
recorded the failure unresolved all over again before anyone fixed it.

**Each rewritten file keeps its modification time.** Two things read it and neither is
about this write — `readVerdicts` orders records by it, where refreshing an old run's
file would promote that run's tier over a newer run's, and the keep's prune ages a run by
it. A note about a round that is over is not a fresh round.

**Nothing is promoted and nothing acts.** `verify-regression` stays non-acting under
[ADR 0008](0008-no-question-set-acts-in-this-campaign.md), its gates stay off, Jev is not
wired into `/verify`, and `"labels"` stays `"none"` — the set's `eval` block now says the
label is recoverable in principle rather than absent by construction, and says outright
that no corpus exists yet.

## Consequences

The question set's stated blocker is gone. A resolved failure is exactly this set's
label, sitting beside the run it came from, and `shots read` reports `unresolved` so the
ones still waiting are visible rather than inferred.

`/verify` records more per round: one `--failure` per failure it hit, alongside the
screenshot read-back it already recorded. That is a real cost in the loop's closing turn,
paid every round whether or not anyone ever resolves anything.

The corpus is still bounded by the 7-day keep, and that bound now cuts differently: a
failure nobody resolves within the week ages out with its run, taking an unresolved entry
with it. Resolving does not extend that window, deliberately. Whether the keep should
hold resolved failures longer than unresolved ones is the question this leaves open, and
it is a question about retention rather than about the record.

Nothing enforces that a failure ever gets resolved. Like `dirty` and `ratified: false`,
the unresolved list is a queue rather than a defect — and, like both, it stays honest
only while something keeps filling it in.

## Related

- ADR: [0005 Agent-authored decisions are marked in frontmatter](0005-agent-authored-decisions-are-marked-in-frontmatter.md)
- ADR: [0007 The deterministic trim gates stay a facts verb](0007-deterministic-trim-gates-stay-a-facts-verb.md)
- ADR: [0008 No question set acts in this campaign](0008-no-question-set-acts-in-this-campaign.md)
- ADR: [0012 Two eval subjects, not five](0012-two-eval-subjects-not-five.md)
- Spec: [Command toolkit](../specs/command-toolkit.md)
