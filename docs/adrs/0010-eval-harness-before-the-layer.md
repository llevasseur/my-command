---
type: adr
title: The campaign builds the eval before the judgement layer it evaluates
description: Invert the handed-down ship order so the client, the question sets and the offline eval harness land before any runtime surface, because the runtime path exists to produce numbers a follow-up uses and shipping it first puts an unmeasured layer into a published package.
tags: [process, toolkit, commands, decisions, judge]
timestamp: 2026-09-16
dirty: true
decided-by: /dev
ratified: false
wayfinder: jev-judgement-layer
grill-round: 3
needs-human: true
---

# The campaign builds the eval before the judgement layer it evaluates

## Status

Accepted, and **proposed by `/dev` rather than ratified by a human**. Written by an
unattended run under [ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s
convention: `decided-by: /dev`, `ratified: false`, `needs-human: true`.

It carries `needs-human: true` because it **inverts an explicit instruction** about
ship order — "SHIP THE TARGETS IN THIS ORDER, riskiest last" — and because it removes
runtime wiring the instruction asked for. Both are calls a human may want back.

## Context

[ADR 0008](0008-no-question-set-acts-in-this-campaign.md) settled that no question set
acts in this campaign. That left the runtime path — the verb, the two gates, the
`fetch` client, the backoff, the spend cap, the shadow store, the fail-open branches —
existing for one purpose: to produce numbers a follow-up campaign uses to decide
whether any of it should act.

The grill's third round asked what that path buys, verbatim:

> But target (2) is now first, and it was justified on labels that are **already on
> disk**: git records which comments survived each `/clean` commit, so the labels are
> thousands and free. Those labels are historical. The states they pair with — source
> plus surrounding diff — are historical too, reconstructable from the same commits.
> None of that needs a live `/clean` run, a shadow flag, an opt-in env var, or a
> fail-open path. An offline harness replaying recorded states against the API answers
> all four metrics [...] with no runtime surface in the product at all.
>
> So the shadow mechanism may be buying nothing this campaign needs. It is the more
> expensive way to collect a smaller sample [...]
>
> **What does shadow mode measure that an offline replay of recorded states does not —
> and is that difference worth shipping the entire runtime path, two gates, and six
> fail-open branches into a published npm package before a single number says the layer
> works?**
>
> [...] If the answer is "the runtime path is the deliverable and the eval is how we
> justify it," then the campaign's honest shape is eval-harness-first, layer-second, and
> the ordering handed down is inverted rather than merely re-sequenced.

The second branch is the true one. Shadow mode does measure two things a replay cannot
— whether the state a verb *composes at runtime* matches the state the replay used, and
displaced context, which is a property of a turn that happened. Neither has to be
measured before a single agreement number exists, and both are properties of a set
about to be promoted, which is already the follow-up's gate.

## Decision

**Build the evidence first. The runtime surface lands last, after the numbers it exists
to produce.**

The order:

1. **The client** — the zero-dependency `fetch` POST, the wire types, `--dry-run`, and
   the error taxonomy. The harness cannot run without it, and at this point it is wired
   into no command and reachable from nothing a user runs.
2. **The question sets**, as versioned JSON lifted from rubrics already written.
3. **The eval harness and the offline corpora**, replaying states reconstructed from
   recorded history. This is where the campaign's evidence comes from, and it is the
   campaign's actual deliverable.
4. **The runtime surface** — the two gates, the shadow store under
   `~/.my-command/judge/`, the spend cap, and the fail-open branches.

The `/trim` facts verb from [ADR 0007](0007-deterministic-trim-gates-stay-a-facts-verb.md)
is independent of all four and runs in parallel: it needs no key and touches no network.

**Targets (3), (4) and (5) ship as question sets and eval subjects only, with no runtime
wiring at all.** This follows from ADR 0008 and from the instruction's own hedge for
target (5) — "if the eval numbers do not justify it, ship the layer without it" — where
no number yet exists. So `src/hooks/` is untouched by this campaign, and the question of
what local timeout a `PreToolUse` classifier would need becomes a follow-up's problem
rather than a hypothetical this campaign has to get right.

**Shadow mode is not the safety mechanism and must not be credited as one.** Nothing
acting is (ADR 0008). Shadow is the last gate before promotion, not the thing that makes
this campaign safe to land.

### A named blocker on target (5)'s promotion

[Workflow gates](../specs/workflow-gates.md) requires that a gate "must fail open and
must never refuse the same subject twice", and `scripts/check-commands.sh` enforces
both. A nondeterministic classifier asked twice about one subject is exactly the shape
the second property forbids, and **nothing in this repository documents how a
probabilistic gate satisfies it.**

This campaign does not violate it, because target (5) wires into nothing. **The
follow-up must answer it before any classifier reaches `PreToolUse`**, and it is
recorded here so that answer is a precondition rather than a discovery made at
promotion time.

## Consequences

The campaign lands evidence rather than behaviour. A human reviewing it reads agreement
numbers, prices computed from returned `usage` counts, and latency distributions —
against a layer that is switched off and wired into nothing that would act on it.

The published package gains a verb and a script. It gains no gate, no hook change, and
no code path that alters any command's outcome.

The cost is that the feature is not usable when the campaign merges, which is the
correct state for a feature nobody has measured. The follow-up's job is promotion, and
it starts with a number instead of a plan to get one.

The risk this accepts is that the runtime surface is specified now and built last, so
the eval could reveal something about the wire protocol that reshapes it. That is the
cheap direction to be wrong in: reshaping an unwired verb costs a diff, where reshaping
a shipped gate costs every user's Bash call.

## Related

- ADR: [0008 No question set acts in this campaign](0008-no-question-set-acts-in-this-campaign.md)
- ADR: [0009 Conversation-derived state leaves the device](0009-conversation-derived-state-leaves-the-device.md)
- Spec: [Workflow gates](../specs/workflow-gates.md)
- Spec: [Command toolkit](../specs/command-toolkit.md)
