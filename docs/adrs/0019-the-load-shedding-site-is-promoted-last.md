---
type: adr
title: The first wired Jev site sheds work rather than adding it, so it is the last one that may ever be promoted
description: /task Step 2.6's second skip condition becomes the campaign's first question site because its label — the verifier's own verdict — is the cleanest and highest-volume one available and costs nothing to collect; but a wrong answer there silently loses a verification nobody notices, so the site records only, and any later promotion sits behind a passed ADR 0013 bar and its own ADR superseding 0008.
tags: [process, toolkit, commands, decisions, judge, eval]
timestamp: 2026-09-17
dirty: true
decided-by: /god
ratified: false
wayfinder: jev-judgement-layer
needs-human: true
---

# The first wired Jev site sheds work rather than adding it, so it is the last one that may ever be promoted

## Status

Accepted, and **proposed by `/god` rather than ratified by a human**. Written by an
unattended run under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s convention:
`decided-by: /god`, `ratified: false`, `needs-human: true`.

It carries `needs-human: true` because it is the first question site the layer has
ever had. [ADR 0018](0018-task-records-jev-answers-against-its-own-outcomes.md) shipped
`--jev` with `SITES` empty and said the sites would land one at a time, each reviewable
on its own. This is that review, and what a human is being asked about is the question
rather than the runtime.

**This ADR does not supersede
[ADR 0008](0008-no-question-set-acts-in-this-campaign.md).** That decision holds
unchanged: nothing acts on a Jev answer in this campaign. The site ships `acts: false`
like every other, and `actingSites()` stays the one door. What this ADR adds is a
question, a recorded answer, and a rule about the order in which promotion may ever
happen.

## Context

[ADR 0014](0014-the-eval-returned-no.md) returned `ABANDON` on Subject B against bar
`B.corpus`: 1,923 candidates yielded **3** labelled commands against a floor of 200.
[ADR 0018](0018-task-records-jev-answers-against-its-own-outcomes.md) diagnosed that as
a fact about the store rather than the classifier — the proxy transcript store records
calls and no outcomes — and moved the collection point to `/task`, which computes
outcomes itself. It then deliberately wired no site, so the first one could be argued
about on its own terms.

Two questions decide which site goes first: where is the label cleanest and cheapest,
and what does a wrong answer cost.

**On the label, Step 2.6 is the best site in the campaign and it is not close.** The
step ends by recording its own outcome —
`my-command-tools shots record --tier <tier> --verdict <verdict> --rounds <n>`, run
whatever the verdict is. That verdict is the label. A run that went on to exercise a
surface, green or red, is a run where the diff reached one. A run that came back
`skipped` or `unverified` for want of a surface is the other pole. Nothing is inferred
from prose, nothing is paired against a separate store, and nothing has to be replayed:
the row and its label are produced by the same run, on the same branch, minutes apart.
It is also the highest-volume label available, because every `/task` run reaches Step
2.6 — the corpus grows with ordinary use rather than with a spend nobody has authorised.
And it is **free**: the verdict is recorded whether or not `--jev` was ever passed, so
the label costs nothing beyond the question itself.

**On the cost of being wrong, the same site is the worst in the campaign.** The
question decides a skip. That makes the two error directions wildly asymmetric:

- A wrong **high** answer says a surface is reachable when it is not. The cost is one
  wasted verification round, visible in the run report, on a step that is already
  advisory.
- A wrong **low** answer says nothing is served when something is. The verification of
  a change that did reach a served surface is silently not performed. The run reports
  `skipped`, the PR opens, `/god` merges it, and the missing check leaves no artefact
  anywhere — no red gate, no failed assertion, no line in a log. **Nothing downstream
  notices.**

That is load-shedding: a decision whose failure mode is work quietly not happening.
Every other site the campaign has considered adds work — `/clean` proposes an edit a
diff shows, `/trim` proposes a compaction a human sees, `verify-regression` proposes a
provenance a person can check. This one subtracts it.

## Decision

**The `verify-surface` question set is wired as the campaign's first question site, at
`/task` Step 2.6's second skip condition, and it records only. The glob still decides.**

And, as the design rule governing any promotion this campaign or a successor ever
makes:

> **Jev may add work, Jev may never skip work.**

Which carries these consequences, each part of the decision rather than a reading of it:

- **The glob is unchanged and stays in charge.** Step 2.6 skips when no changed file
  matches a `routes` glob and nothing else in the diff reaches a served surface. That
  check runs first and its answer is the one the run acts on. The Jev answer is written
  into the report beside it and read by nothing — no branch consults it, no skip is
  taken or withheld because of it.
- **This site is the LAST thing in the campaign that may ever be promoted**, behind
  every site that adds work. Promoting the cheapest-to-be-wrong sites first is the
  ordering the asymmetry above dictates, and going first on the label does not earn
  going first on promotion. They are separate orders and this ADR separates them
  deliberately.
- **Any promotion of this set needs three things, not one**: a pre-registered bar under
  [ADR 0013](0013-the-eval-bar-is-pre-registered.md) — it has none today, since 0013
  fixed bars for Subject A and Subject B and this is neither — a result that clears it,
  and its own ADR superseding [ADR 0008](0008-no-question-set-acts-in-this-campaign.md).
- **Even a promoted version may only act in one direction.** A high answer may ADD a
  verification round the glob would have skipped. A low answer may never withhold one
  the glob would have run. That is the rule above applied to this site, and it means the
  worst case of a promoted `verify-surface` is wasted work rather than lost work.
- **The ambiguous label is dropped, not scored.** Step 2.6 has two skip conditions and
  only the second is about surfaces; the first fires when the repo has no run contract
  at all. A row labelled from a bare `skipped` is unusable, so a row whose recorded skip
  was condition 1 — or whose skip reason was not recorded — leaves the corpus rather
  than being scored. That is the treatment
  [ADR 0011](0011-deterministic-comment-keeps-run-before-the-classifier.md) gives a
  pre-filtered comment, for the same reason: scoring cases the question was never about
  inflates the number. The step's own instruction to "record whichever fired" is what
  makes the drop decidable.
- **The number is recorded now precisely so it exists when the decision is made.** The
  argument for promoting this site one day is an agreement figure, and an agreement
  figure takes a corpus, and a corpus takes runs. Collecting it under `acts: false`
  costs nothing and settles nothing, which is the only honest order.

## Consequences

The campaign has its first question site and its first source of outcome-labelled rows.
A `/task` run made with `--jev` on a device carrying a key now contributes a row whose
label the same run computes, which is the thing
[ADR 0014](0014-the-eval-returned-no.md) found the proxy store could not supply.

No run's outcome moves. Step 2.6 skips exactly the diffs it skipped before, on exactly
the glob it used before, and a device without a `TYPESAFE_API_KEY` cannot tell this
shipped.

The costs, stated rather than softened:

- **A reader may take "first wired" as "first promoted", and that inversion is the
  specific risk this ADR exists to head off.** The site is first because its label is
  cheap and clean, and last in promotion order because its failure is silent. Both
  facts are about the same site and they point opposite ways.
- **No bar exists for this set**, so no result collected here can conclude anything yet.
  Writing the bar is future work and, under the ordering above, the last bar the
  campaign writes.
- **The corpus is empty and stays empty by default.** `--jev` is off unless typed and
  dead without a key, so rows accrue only from deliberate runs. A human may reasonably
  ask what the point of a site with no corpus is; the answer is that the site is what
  makes a corpus possible, and it was cheaper to wire than to argue about twice.
- **One question now leaves the device per `--jev` run**, carrying a changed-file list,
  the repo's route globs, and a shape-only digest of the diff. That is path-shaped and
  diff-shaped rather than conversational, it is gated by the two gates from
  [ADR 0009](0009-conversation-derived-state-leaves-the-device.md), and it is printable
  in full with `--dry-run` before anything is sent.

What a human now owns: whether this is the right first question, whether the
verifier's verdict is a label worth building a corpus on, and whether the
promoted-last rule is strong enough given that the thing it protects against leaves no
trace when it happens.

## Related

- ADR: [0005 Agent-authored decisions are marked in frontmatter](0005-agent-authored-decisions-are-marked-in-frontmatter.md)
- ADR: [0008 No question set acts in this campaign](0008-no-question-set-acts-in-this-campaign.md) — not superseded
- ADR: [0009 Conversation-derived state leaves the device](0009-conversation-derived-state-leaves-the-device.md)
- ADR: [0011 The deterministic comment keeps run before the classifier](0011-deterministic-comment-keeps-run-before-the-classifier.md)
- ADR: [0013 The eval bar is pre-registered](0013-the-eval-bar-is-pre-registered.md)
- ADR: [0014 The eval returned no](0014-the-eval-returned-no.md)
- ADR: [0018 /task records Jev answers against the outcomes it already watches](0018-task-records-jev-answers-against-its-own-outcomes.md)
- Feature: [judge-verb](../features/judge-verb.md)
- Feature: [task](../features/task.md)
