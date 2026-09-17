---
type: adr
title: The deterministic trim gates stay a facts verb rather than becoming classifier questions
description: Four of /trim's six gates are computable from the transcript machinery the hooks already run, so they get a my-command-tools verb printing booleans instead of being routed through the Jev judgement layer, which could only add a failure mode to a computation that has none.
tags: [process, toolkit, commands, decisions, judge]
timestamp: 2026-09-16
dirty: true
decided-by: /dev
ratified: false
wayfinder: jev-judgement-layer
grill-round: 2
---

# The deterministic trim gates stay a facts verb rather than becoming classifier questions

## Status

Accepted, and **proposed by `/dev` rather than ratified by a human**. Written by an
unattended run under [ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s
convention: `decided-by: /dev`, `ratified: false`. It carries no `needs-human` flag,
because it settles where a computation lives rather than committing the project to a
product or interface choice — the kind of implementation detail an unattended run is
right to decide.

## Context

The campaign that produced this ADR adds an optional judgement layer over TypeSafe's
Jev classifier, and the run was handed an explicit ship order whose first target was
[trim](../features/trim.md)'s six-gate rubric: "its six gates C1 CLOSED, C2
RECOVERABLE, C3 PROGRESS, N1 STUCK, N2 LIVE, N3 VERIFIED are six nouls in one call
plus a boolean AND in code".

The grill's second round asked this, verbatim:

> Your own answer dissolves target (1).
>
> You derived C1, C3, N1 and N2 from `timeline()`, `watchedOutputs()`, `state`'s
> `hasWork`/`diffStat`, and `git diff --diff-filter=U`. Those are **facts**, computed
> deterministically on this device. A fact printed as JSON by a verb is layer one of
> the three the proposal already names — "read the fields rather than re-deriving
> them." Four deterministic booleans do not need a probabilistic classifier, and
> routing them through one strictly loses: it adds a network round trip, a confidence
> band, and a failure mode to a computation that currently has none and cannot be
> wrong.
>
> [...]
>
> **If C1/C3/N1/N2 are deterministic facts and C2/N3 are unanswerable from a
> shape-only digest, what does target (1) buy that a plain facts verb does not?**

The question is grounded in a rule this repo already wrote down.
[Command toolkit](../specs/command-toolkit.md) states it in the negative — "Judgment
stays with the agent. The toolkit never decides whether a comment is noise" — and the
same spec's layering states it in the positive: a deterministic derivation several
commands repeat becomes a verb that prints JSON, so callers "read the fields rather
than re-deriving them."

What made the question answerable is that the machinery is already here for another
purpose. [Workflow gates](../specs/workflow-gates.md) documents `src/hooks/lib/`
reading the session transcript at `transcript_path`, and documents `timeline()`
grouping JSONL records by `message.id` because "One assistant message is one turn, and
the transcript does not say so." Beside it sit `read-only.mjs`, which classifies
whether a call only reads, and `watchedOutputs()`, which names the file a live
`Monitor` or backgrounded Bash call is following.

## Decision

**The gates a deterministic extractor can answer are answered by a `my-command-tools`
verb, and never sent to the classifier.**

Four of the six fall that way:

- **C1 CLOSED**, in its returned-calls half — the last turn's calls all returned, none
  came back `is_error`, and no `Monitor` or backgrounded call is still live.
- **C3 PROGRESS** — turns since the last compaction boundary carrying a call that is
  not read-only, plus `hasWork` and `diffStat` from `state`.
- **N1 STUCK**, in its arithmetic half — the repeat-identical-probe and repeat-error
  counts the existing gates already derive.
- **N2 LIVE** — an unreturned `Agent` dispatch, a live watch, or an unmerged path from
  `git diff --diff-filter=U`.

The verb needs no API key, performs no network call, has no confidence band, and needs
no fail-open path, because a computation that cannot be wrong has nothing to fail open
from. It is useful to `/trim` whether or not the judgement layer ever ships, and it is
cheaper to build than the classifier call it replaces.

**The residue is not empty, and it is not this ADR's subject.** Two gates carry a
clause no extractor reaches — C1's "mid-tool sequence", which every call returning
cleanly is compatible with, and N1's "would hide useful negative evidence", where the
repeat count is arithmetic and the worth of the evidence is not — alongside C2
RECOVERABLE and N3 VERIFIED. Those stay with the judgement layer, in shadow, under
[ADR 0008](0008-no-question-set-acts-in-this-campaign.md).

## Consequences

`/trim` gains a deterministic answer to four of its gates on every device, with or
without a key and with or without the judgement layer enabled, and the run stops
re-deriving them in prose each time.

The judgement layer gets smaller and more honest. What reaches the classifier is only
what no extractor could have answered, which is also what makes the eval numbers mean
something: agreement measured on a question code already answers measures nothing.

`src/commands/trim.md` must widen its `allowed-tools`, which today reads
`Read, Grep, Glob, Bash(git:*)` and cannot call the toolkit at all.

The cost is a second surface that reads the transcript. The hooks read it to refuse a
call; this verb reads it to report state. They share `src/hooks/lib/`, so a change to
`timeline()` moves both, and a future divergence between them would be the failure to
watch for — the same shape [Command toolkit](../specs/command-toolkit.md) already
guards for hook-arming detection by insisting on "One detector, not two."

## Related

- ADR: [0005 Agent-authored decisions are marked in frontmatter](0005-agent-authored-decisions-are-marked-in-frontmatter.md)
- ADR: [0008 No question set acts in this campaign](0008-no-question-set-acts-in-this-campaign.md)
- Spec: [Command toolkit](../specs/command-toolkit.md)
- Spec: [Workflow gates](../specs/workflow-gates.md)
