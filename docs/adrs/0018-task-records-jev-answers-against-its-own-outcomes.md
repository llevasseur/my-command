---
type: adr
title: /task records Jev answers against the outcomes it already watches, and acts on none of them
description: The proxy transcript store holds calls without outcomes, which is what abandoned the eval's Subject B at 3 labels against a floor of 200 — so the outcome-labelled corpus is collected where the outcome is already known, by a record-only --jev flag on /task that asks, writes the answer down beside what the run did, and changes nothing.
tags: [process, toolkit, commands, decisions, judge, eval]
timestamp: 2026-09-17
dirty: true
decided-by: /god
ratified: false
wayfinder: jev-judgement-layer
needs-human: true
---

# /task records Jev answers against the outcomes it already watches, and acts on none of them

## Status

Accepted, and **proposed by `/god` rather than ratified by a human**. Written by an
unattended run under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s convention:
`decided-by: /god`, `ratified: false`, `needs-human: true`.

It carries `needs-human: true` because it wires the judgement layer into a **command**
for the first time. Every earlier surface was reached by hand: the `judge` verb is
typed, the `jev-record` proxy is started deliberately, and the eval harness is run on
purpose. This puts a flag on `/task`, which is the command the other workflow commands
delegate to — so it is the first place where a future change could make egress
ordinary. The flag ships default-off behind both gates and asks nothing today, and the
decision is marked anyway, because the surface is the thing a human is being asked
about rather than this run's use of it.

**This ADR does not supersede
[ADR 0008](0008-no-question-set-acts-in-this-campaign.md).** That decision holds
unchanged: no question set acts on a Jev answer in this campaign, and nothing here
promotes one. What follows adds a recording surface and no behaviour.

## Context

[ADR 0014](0014-the-eval-returned-no.md) recorded an `ABANDON` on Subject B against bar
`B.corpus`: 1,923 candidates across 527 sessions yielded **3** labelled commands
against a floor of 200. The verdict is not the interesting part, and
[ADR 0015](0015-jev-traffic-is-recorded-outside-the-client.md) already noted that it is
a fact about the store rather than about the classifier. The cause is this: the proxy
transcript store records tool **calls** and assistant prose, and records no results, no
exit codes and no error text. 1,537 of the 1,923 candidates had no recorded outcome at
all.

So the pairing rule [ADR 0012](0012-two-eval-subjects-not-five.md) was built on — that
the label already exists on disk as a natural experiment — has nothing on disk to pair
with. That constrains **every** future eval built on that store, for this question or
any other, and no amount of re-querying it fixes a field that was never written.

An outcome-labelled corpus therefore has to be collected somewhere that knows outcomes.
`/task` does. It takes criteria to a merged PR: it runs the repo's own gates and reads
the verdict, it carries a woven-in `/review` and sees what it found, it boots the app
and reads a verifier's `green` or `red`, and it does all of that minutes after the
point where a question could have been asked, on the same branch, in the same run. The
outcome is not inferred there. It is the thing the command exists to produce.

The alternative considered and rejected was instrumenting the proxy store to record
outcomes. [ADR 0014](0014-the-eval-returned-no.md) already lists that as one of three
things a human owns, and it remains the better long-term answer for *other* questions.
It is the wrong answer for this one: it is a change to a separate system, it produces
no corpus until it has run for months, and it would still be recording an outcome
inferred from a tool result rather than the verdict a command computed.

## Decision

**`/task` takes a `--jev` flag that asks question sets at chosen points in a run,
writes the answers into the run report beside what the run actually did, and acts on
none of them.**

- **Record-only, and the flag is not what holds that.** Promotion stays **per question
  set**. Each site declares `acts`, every shipped site declares it false, and
  `actingSites()` is the one door. A set let through later is that set's change and the
  superseding ADR's, not this flag's — `--jev` would neither grant it nor need to
  change for it. Expressing promotion per flag would have made "turn on recording" and
  "let the layer decide" the same switch, which is the confusion ADR 0008 exists to
  prevent.
- **No question site is wired in the unit that adds the flag.** What ships is the flag,
  the session, the budget, the report-writing path, and an empty site list. Sites land
  in follow-ups, one at a time, each reviewable on its own. An empty list is a working
  run that asks nothing, and it makes the no-key path and the wired path the same path
  — both send nothing — which is the state the byte-identical test is easiest to trust
  in.
- **Both gates from [ADR 0009](0009-conversation-derived-state-leaves-the-device.md),
  unchanged, and no third.** A `TYPESAFE_API_KEY` present means the layer can run; the
  explicit `--jev` means it does. With no key the run is byte-identical to one on a
  device where this was never written, including its report: that is `gate()`'s
  existing `silent` contract reused, not a new promise, and it is asserted rather than
  described.
- **`--jev` implies recording.** The run opens a `jev-record` session and routes every
  call through it via the `endpoint` parameter `ask()` already takes — the seam
  [ADR 0015](0015-jev-traffic-is-recorded-outside-the-client.md) chose, used as
  intended, with `src/toolkit/lib/jev.mjs` unmodified. A run that asked without
  recording would produce the one thing this ADR exists to collect and then discard it,
  so it is refused rather than allowed as a lesser mode. `not-recorded` is that
  refusal, and it is deliberately **not** a tenth entry in `FAILURE_MODES`: those nine
  are ways a call declined to answer, and this is a run declining to make the call.
- **The spend cap is the run's own.** `MY_COMMAND_JUDGE_TOKEN_CAP` bounds a process and
  one process carries many runs; `MY_COMMAND_TASK_JUDGE_TOKEN_CAP` bounds a run, which
  is the unit a person authorises. Both apply, and the run's default is an order below
  the process-wide one because a cap no realistic run reaches is not a cap.
- **`--dry-run` stays ungated**, as the verb's already is, and composes through the same
  `buildRequest` the live path posts. It names the recorder and the upstream host both,
  since with a proxy in front the body reaches localhost and ends up somewhere else,
  and printing only the first would understate the egress.

## Consequences

When a human authorises the spend [ADR 0014](0014-the-eval-returned-no.md) left open,
there is somewhere for an outcome-labelled corpus to come from that does not depend on
a store which cannot supply one. Every `/task` run made with the flag contributes a row
carrying both halves of ADR 0012's pairing rule, because the command computes the
second half itself.

Nothing else changes. No run's outcome moves, no gate is affected, and a device without
a key cannot tell this shipped.

The costs, stated rather than softened:

- **The layer now has a surface on a command rather than only on a verb.** Every
  earlier surface was reached by typing it. This one is a flag on the command
  `/god`, `/manage`, `/dev` and `/work` all delegate to, so the distance between "off
  by default behind two gates" and "on for everything" is one future edit. The gates
  and the default are the whole of what prevents that, and they are the same two gates
  that already governed the verb.
- **The corpus is only as good as the outcomes, and `/task`'s outcomes are mixed.** A
  gate verdict is crisp. A verifier's `green` is advisory and, by its own spec, a
  judgement. A row is labelled with whichever the site chose, and a later eval reading
  these rows has to know which — which is a burden on the site definitions the
  follow-ups write, not something this ADR settles.
- **No site is wired, so the flag collects nothing yet.** This is a surface with no
  users, deliberately, and it stays that way until a follow-up adds the first site. A
  human may reasonably say the flag should have waited for that site. The run split
  them so the first site could be reviewed as a question rather than as a question plus
  a runtime.

What a human now owns: whether a workflow command is an acceptable place for this
surface at all, which question sites are worth the first egress, and whether the
corpus this would build is worth the spend [ADR 0014](0014-the-eval-returned-no.md)
already left them.

## Related

- ADR: [0005 Agent-authored decisions are marked in frontmatter](0005-agent-authored-decisions-are-marked-in-frontmatter.md)
- ADR: [0008 No question set acts in this campaign](0008-no-question-set-acts-in-this-campaign.md) — not superseded
- ADR: [0009 Conversation-derived state leaves the device](0009-conversation-derived-state-leaves-the-device.md)
- ADR: [0012 The judgement layer ships with two eval subjects, not five](0012-two-eval-subjects-not-five.md)
- ADR: [0014 The eval returned no](0014-the-eval-returned-no.md)
- ADR: [0015 Jev traffic is recorded outside the client](0015-jev-traffic-is-recorded-outside-the-client.md)
- Feature: [judge-verb](../features/judge-verb.md)
- Feature: [task](../features/task.md)
