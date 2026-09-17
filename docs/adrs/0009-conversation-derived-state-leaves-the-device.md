---
type: adr
title: Conversation-derived state leaves the device when the judgement layer runs
description: The Jev layer POSTs state to a third-party API, and for the trim question set that state must carry agent-written prose rather than tool-call shape alone, so the egress is stated outright, gated twice, defaulted off, and made inspectable with --dry-run before anything is sent.
tags: [process, toolkit, security, decisions, judge]
timestamp: 2026-09-16
dirty: true
decided-by: /dev
ratified: false
wayfinder: jev-judgement-layer
grill-round: 2
needs-human: true
---

# Conversation-derived state leaves the device when the judgement layer runs

## Status

Accepted, and **proposed by `/dev` rather than ratified by a human**. Written by an
unattended run under [ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s
convention: `decided-by: /dev`, `ratified: false`, `needs-human: true`.

It carries `needs-human: true` for the plainest reason in ADR 0005's list: sending a
user's working material to a third party is a call a human makes. The run made it
because it could not proceed without making it, and it is marked so the human's review
of the campaign is where it actually gets decided.

## Context

The campaign was given one security constraint, and it was about credentials:
MyCommand is a published npm package whose `files` list includes `src`, so the
`TYPESAFE_API_KEY` must live in the process environment only and must never be written
into any file in the repository.

That constraint is correct and is honoured. It is also not the only one that applies,
and nothing in the repository documented the other one. The grill's first round put it
this way, verbatim:

> So: **for target (1), what exactly is in the state file, who produces it, and if the
> answer is "the agent composes it," what generative work does Jev displace that
> composing the state did not already cost?** If the answer is instead "raw transcript
> bytes read from a store," name the path it comes from and say plainly that the whole
> live conversation is being POSTed to `api.typesafe.ai` — because the proposal's
> SECURITY section governs only the API key, and nothing in the repository documents
> shipping transcript contents off-device.

The first answer given was that the state is machine-derived shape — tool names,
per-turn ok/error flags, timestamps, turn boundaries, counts — carrying no prose, no
file contents and no command strings. The grill's second round showed that answer
guts the set it was defending:

> So C2 ("could a replacement summary preserve the goal, the user decisions, the
> relevant failed approaches, the exact next action" — `src/commands/trim.md:28`) is
> being asked of a payload that by construction contains no goal, no decisions, no
> approaches and no next action. Jev would not be judging recoverability; it would be
> guessing it from tool-call counts.

Both halves cannot be had. Shape-only sends almost nothing and answers almost nothing.
Prose answers the question and ships the user's working material to a third party.

## Decision

**State the egress outright, choose prose where the question requires it, and make
the choice inspectable and revocable rather than implicit.**

- **The `/trim` question set's state carries the facts-verb JSON from
  [ADR 0007](0007-deterministic-trim-gates-stay-a-facts-verb.md) plus a bounded,
  agent-written recoverability précis.** Prose, deliberately. C2 RECOVERABLE, N3
  VERIFIED, C1's "mid-tool sequence" clause and N1's "would hide useful negative
  evidence" clause are unanswerable without it, and a payload that cannot answer its
  own questions is worse than no payload.
- **`--dry-run` prints the exact request body and makes no network call.** This is the
  load-bearing part. It means what would be sent can be read before it is sent, by a
  human or by a run assembling an eval corpus, and it makes the egress a thing that is
  looked at rather than a thing that is described.
- **Two gates, and the default is off.** `TYPESAFE_API_KEY` present means the layer
  *can* run; an explicit per-invocation opt-in means it *does*. Neither alone is
  enough, which mirrors the `MY_COMMAND_HOOKS=0` disarm precedent in
  [Workflow gates](../specs/workflow-gates.md) — with the polarity reversed, because a
  gate that refuses a call is safe by default and a call that leaves the device is not.
- **With no key, every command behaves exactly as it does today**, with no error and no
  mention. A user who never opts in never learns this layer exists, and nothing of
  theirs is sent.
- **The key stays in the environment only.** The original constraint is unchanged: no
  config file, no committed `.env`, no fixture carrying a real key, and nothing written
  under `src/` or anywhere else in the repository.
- **Shadow records are data, not source.** They land under `~/.my-command/judge/`,
  beside the existing `shots/` keep and outside the checkout, so a record of what was
  sent can never be committed to a repository by accident.

## Consequences

The project has a documented position on a thing it was doing undocumented. Anyone can
find out what leaves the device by reading this ADR or by running the verb with
`--dry-run`.

The `/trim` set becomes answerable, which is what makes its shadow numbers worth
collecting at all.

The cost is real and is not softened here. A user who opts in sends a description of
their working session to a third party, and this ADR is the whole of their notice.
`--dry-run` and the two gates reduce the chance of that happening unknowingly; they do
not change what happens once someone opts in.

Two things a human ratifying this should consider settling, because the run did not:
whether the précis needs a redaction pass over paths and identifiers before it is sent,
and whether an opt-in should be per-invocation forever or may become a recorded
preference. The run chose per-invocation, which is the conservative reading.

## Related

- ADR: [0005 Agent-authored decisions are marked in frontmatter](0005-agent-authored-decisions-are-marked-in-frontmatter.md)
- ADR: [0007 The deterministic trim gates stay a facts verb](0007-deterministic-trim-gates-stay-a-facts-verb.md)
- ADR: [0008 No question set acts in this campaign](0008-no-question-set-acts-in-this-campaign.md)
- Spec: [Workflow gates](../specs/workflow-gates.md)
