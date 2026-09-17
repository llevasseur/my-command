---
type: adr
title: Jev traffic is recorded outside the client, by a local proxy
description: The Jev client is written never to throw and to answer every failure with an empty answer map, so a 401, a 422 and a partial answer are one observation at the call site — the recorder therefore sits outside it as a loopback proxy a caller points at through the endpoint parameter ask() already takes.
tags: [process, toolkit, security, decisions, judge, eval]
timestamp: 2026-09-17
dirty: true
decided-by: /god
ratified: false
wayfinder: jev-judgement-layer
needs-human: true
---

# Jev traffic is recorded outside the client, by a local proxy

## Status

Accepted, and **proposed by `/god` rather than ratified by a human**. Written by an
unattended run under [ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s
convention: `decided-by: /god`, `ratified: false`, `needs-human: true`.

It carries `needs-human: true` for two reasons. It commits the project to a **recorded
format** that a separate repository will parse, which is an interface commitment and
therefore hard to take back. And it adds a surface that writes the *contents* of Jev
requests and responses to disk — adjacent to the egress question
[ADR 0009](0009-conversation-derived-state-leaves-the-device.md) already marked as a
human's to settle.

## Context

[ADR 0013](0013-the-eval-bar-is-pre-registered.md) fixed the client's contract: it
never throws, and every failure resolves to a result carrying an empty answer map. The
reasoning is sound and is not reopened here — a caller that must wrap the client in
`try` to stay correct is a caller that breaks the first time someone forgets to.

The cost is that the client is engineered to swallow exactly what an eval needs to
see. At the call site, these are one observation:

- a key the endpoint refused (401),
- a question map the endpoint rejected, and the field it named (422),
- a call that reached the model and came back with 7 answers to 125 questions,
- a call that never reached the endpoint at all.

Each arrives as `answers: {}`. `reason` distinguishes some of them in memory and is
written nowhere, and the endpoint's own error body — the field a 422 named, the
sentence a 401 gave — is discarded before any caller sees it. So a call that failed
silently surfaces as a verdict.

[ADR 0014](0014-the-eval-returned-no.md) is the reason this matters now rather than in
the abstract. Its Subject A was never replayed, because no key was set on the device,
and all four of its bars report `not-measured`. When a human does authorise that
spend, the run has to produce evidence rather than a row of empty answer maps — and
whatever is recorded then is the only thing anyone will have.

**Nothing in that ADR is a measurement of Jev's quality**, and this one does not treat
it as one. The `ABANDON` on Subject B fired on `B.corpus`: the transcript store records
no outcomes, so the labels could not be built. That is a fact about the store, not
about the classifier. Subject A's verdict is `INCOMPLETE`, not a failure.

## Decision

**What crossed the wire is recorded by something outside the Jev client: a local
loopback proxy, reachable as the `jev-record` toolkit verb.**

- **Outside, not inside.** `src/toolkit/lib/jev.mjs` is not modified. A client that
  reported on its own failures would be a client with opinions about them, and the
  contract ADR 0013 fixed is exactly the one worth keeping intact while it is being
  measured.
- **Pointing Jev at it is a parameter.** `ask()` already takes an `endpoint`
  defaulting to the exported `ENDPOINT`, so a caller records by passing
  `ask({ endpoint: <the proxy url> })` and changing nothing else. That the seam
  already existed is most of why this shape was chosen over the alternatives.
- **The record is the whole exchange**: the outgoing question map, the answer map that
  came back, the usage counts, the HTTP status, and any error body. A record is enough
  to tell 7-of-125 from 125-of-125, and enough to read a 401 or a 422 the client
  turned into an empty answer map.
- **The proxy synthesises nothing.** It does not parse a question set, read an answer,
  or retry a 429. An upstream that never answered is recorded as `status: null` with
  an error and relayed as a 502 — inventing an empty answer map there would be the
  exact lie the recorder exists to expose.
- **Zero runtime dependencies**, as ADR 0013 requires: `node:http` and global `fetch`,
  nothing added to `package.json`.
- **The key is forwarded and never written.** It is read from `TYPESAFE_API_KEY` in
  the environment and nowhere else, supplied upstream only when the caller sent no
  `Authorization` of its own, and redacted from every record twice over — by header
  name, and by a literal scan of each decoded body, the second being what catches an
  endpoint echoing a rejected key back inside its 401. `package.json` ships `src`, so
  a key written into a file here is a key published to npm.
- **The format is specified in prose**, in
  [Command toolkit](../specs/command-toolkit.md), naming the path layout, every field
  and its type. Two readers parse it and neither can ask: an eval harness in this repo
  and an ingest pass in a separate repository, where the reader cannot be changed in
  the same commit as the writer.
- **Records land outside any checkout**, under `~/.my-command/jev-record/`, beside the
  `shots/` and `judge/` keeps. ADR 0009's reason carries over unchanged: a record that
  cannot be reached from a working tree cannot be committed by accident.

**Nothing is promoted, and the verb is wired into nothing.**
[ADR 0008](0008-no-question-set-acts-in-this-campaign.md) holds that no question set
acts, and no number yet exists that would justify changing it. The judgement gates
stay off. This adds evidence-gathering, not behaviour.

**The two judgement gates deliberately do not apply to this verb.** `--judge` and
`MY_COMMAND_JUDGE=1` gate *asking Jev a question* — sending conversation-derived state
to a third party. This verb asks nothing: it forwards what a caller already decided to
send, and with no caller running it sends nothing at all. Gating it would mean a
caller could send state with the gate satisfied and be unable to record what it sent,
which inverts what the gate is for.

## Consequences

When a human authorises the spend ADR 0014 left open, Subject A can be replayed and
the run produces evidence instead of a row of empty answer maps. That is the only
reason this exists, and it is worth building before the spend rather than after it.

The failure modes the client is designed to hide become readable without the client
changing. `reason` stops being the only account of a failed call, and the endpoint's
own error text — the 422's field, the 401's sentence — survives to where someone can
read it.

The costs, stated rather than softened:

- **A second artifact now holds request and response contents.** It sits outside every
  checkout and carries no key, but it is a fuller record than anything this project
  wrote before. A human ratifying this may reasonably want a retention bound on the
  keep, the way [Command toolkit](../specs/command-toolkit.md) ages the screenshot keep
  out after 7 days. The run did not set one, because a record's value is exactly its
  durability and picking a number without a reader's needs would be a guess.
- **The format is an interface as soon as another repository parses it.** `v: 1` on
  every record is the whole of the versioning, and a change after the ingest pass ships
  is a `v: 2` and a superseding ADR, never an edit to the fields.
- **The proxy is a surface that could be pointed anywhere.** `--endpoint` takes any
  URL, which is what makes it testable against a loopback upstream and also means it
  is not, by itself, a guarantee about where traffic went. The record names the
  endpoint on every exchange, which is the honest answer: it is auditable rather than
  constrained.

What a human now owns: whether to spend on replaying Subject A through this recorder,
whether the keep needs a retention bound, and whether recording request and response
contents on disk is acceptable given the same material is what ADR 0009 sends off the
device.

## Related

- ADR: [0005 Agent-authored decisions are marked in frontmatter](0005-agent-authored-decisions-are-marked-in-frontmatter.md)
- ADR: [0008 No question set acts in this campaign](0008-no-question-set-acts-in-this-campaign.md)
- ADR: [0009 Conversation-derived state leaves the device](0009-conversation-derived-state-leaves-the-device.md)
- ADR: [0013 The numbers that abandon the judgement layer are fixed before the eval runs](0013-the-eval-bar-is-pre-registered.md)
- ADR: [0014 The eval returned no, and the layer ships measured rather than working](0014-the-eval-returned-no.md)
- Spec: [Command toolkit](../specs/command-toolkit.md)
