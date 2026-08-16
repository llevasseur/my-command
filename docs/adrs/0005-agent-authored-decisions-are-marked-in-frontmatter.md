---
type: adr
title: Agent-authored decisions are marked in frontmatter
description: Record a decision an unattended run made for a human as a real ADR carrying decided-by, ratified:false, and needs-human, so the calls a human still owes are queryable rather than buried.
tags: [process, docs, commands, decisions]
timestamp: 2026-08-16
dirty: true
---

# Agent-authored decisions are marked in frontmatter

## Status

Accepted.

## Context

[dev](../features/dev.md) drives one complex idea to merged with no human in the
loop. Its first phase grills the idea, and every answer is supposed to be grounded
in an existing okq spec or ADR. The answers that **cannot** be grounded are the
interesting ones: those are decisions the run made itself, on the human's behalf,
in a session the human never watched.

A run like that has only bad options if there is nowhere to put such a decision.
It can **block and ask**, which costs the command the unattendedness that is its
whole point, and stalls a campaign of eight tickets on one question. It can
**decide silently**, which ships a product call nobody chose and leaves no trace
of the reasoning. Or it can write the decision into the wayfinder map — which
looks right and is the worst of the three, because
[wayfinder](../features/wayfinder.md) deletes the map and every plan beside it
when the campaign closes. A decision recorded only there is deleted at exactly the
moment the code that depends on it lands, which is the first moment anyone needs
it.

So the decision needs a durable home, and the durable home for a decision in this
repo is already an ADR ([ADR 0001](0001-record-architecture-decisions.md)). What
an ADR did not yet carry is **who decided it and whether a human ever agreed**.
Read as a plain ADR, an agent's call is indistinguishable from a call a person
made and reviewed — and the two want opposite treatment on review.

Nothing in the existing corpus separates them, and a naming convention (a prefix,
a separate directory) would separate them only for a reader who already knows to
look. What is needed is something a query can select on.

## Decision

**A decision an agent made in place of a human is a real ADR in `docs/adrs/`,
distinguished by frontmatter rather than by location or naming.**

The keys:

- `decided-by: /dev` — the command that made the call. Not "an agent": the
  command, so the decision can be traced back to the run shape that produced it.
- `ratified: false` — no human has agreed to this yet. It flips to `true` when one
  does, and that flip is the ratification.
- `needs-human: true` — set additionally where the decision **also looks like a
  human's call to make**: a product choice, a naming or interface commitment,
  anything irreversible, as opposed to an implementation detail the run was right
  to settle. Marked when in doubt: over-marking costs a line in a PR body,
  under-marking ships a product call nobody chose.
- The campaign's wayfinder slug and the grill round the decision came from, so the
  ADR points back at the conversation that forced it.

The **Status** section states in prose that the decision was proposed by the
command and not ratified by a human — the frontmatter is for queries, the prose is
for the reader who opened the file. The **Context** section quotes the griller's
question **verbatim**, because a paraphrase of the question quietly repairs the
ambiguity the question exposed.

**The run never blocks and never asks.** It decides, marks the ADR, and carries
on. The campaign PR body then **leads** with the `needs-human` list, so the
human's review of the campaign is where those calls actually get made. That is
what makes deciding-and-recording safe rather than presumptuous: the decision is
provisional, visible, and sitting at the top of the one artifact a human is
already going to read.

**okq needs no change**, exactly as
[ADR 0003](0003-dirty-flag-for-doc-density.md) established for the `dirty` flag:
`okq validate` accepts frontmatter keys beyond the OKF core, and
`okq --bundle docs find --where <KEY=VALUE>` matches arbitrary keys, with an unset
key matching nothing rather than erroring. So
`okq --bundle docs find --where ratified=false` lists everything the agents have
decided, and `--where needs-human=true` narrows it to the calls a human still owes.

## Consequences

The decisions an unattended run made are queryable, durable, and separable from
the ones a human made — and they survive the scaffolding that produced them,
because they never lived in it.

Review gets a worklist instead of a diff to infer intent from. A human ratifying a
decision edits one key; a human overruling one writes the superseding ADR the
existing process already prescribes.

The cost is the same one ADR 0003 named: a convention stays honest only while the
command sets it. An agent-authored decision written without the keys is invisible
to both queries, and the only symptom is a decision nobody ever ratified. The
recovery path is the same query run with the keys inverted — an ADR in
`docs/adrs/` carrying no `decided-by` is presumed human, and one carrying it and
no `ratified` is a bug in the run that wrote it.

`ratified: false` will also accumulate in the default branch between a campaign
merging and a human working through the list. That is intended: like `dirty`, the
flag is a queue, not a defect.
