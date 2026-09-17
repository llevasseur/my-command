---
type: adr
title: The site whose wrong answer only wastes work is promoted first, even though its labels are the worse ones
description: /task's pre-verify complexity triage is wired as the second question site and, like every other, acts on nothing — but its answer would add a rework pass rather than skip a verification, so under the rule ADR 0019 fixed it outranks verify-surface in promotion order despite four partial, lagging labels against verify-surface's single clean one.
tags: [process, toolkit, commands, decisions, judge, eval]
timestamp: 2026-09-17
dirty: true
decided-by: /task
ratified: false
wayfinder: jev-judgement-layer
needs-human: true
---

# The site whose wrong answer only wastes work is promoted first, even though its labels are the worse ones

## Status

Accepted, and **proposed by `/task` rather than ratified by a human**. Written by an
unattended run under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s convention:
`decided-by: /task`, `ratified: false`, `needs-human: true`.

It carries `needs-human: true` because it fixes a **promotion order** over the whole
campaign rather than only wiring a site.
[ADR 0019](0019-the-load-shedding-site-is-promoted-last.md) stated one end of that order
from one site. This states the other end, and in doing so commits every site the
campaign ever adds to being ranked by blast radius rather than by evidence quality —
which is a claim about sites nobody has written yet.

**This ADR does not supersede
[ADR 0008](0008-no-question-set-acts-in-this-campaign.md).** Nothing acts on a Jev
answer. The site ships `acts: false`, `actingSites()` stays the one door, and
`judge-run.test.mjs` asserts it rather than trusting it. What this adds is a question, a
recorded answer, and an ordering that takes effect only if ADR 0008 is one day
superseded.

## Context

[ADR 0018](0018-task-records-jev-answers-against-its-own-outcomes.md) shipped `--jev`
with no sites, so each could be argued about on its own.
[ADR 0019](0019-the-load-shedding-site-is-promoted-last.md) wired the first,
`step-2.6/surface`, and fixed the rule that governs any promotion:

> **Jev may add work, Jev may never skip work.**

It applied that rule to a site that sheds work and concluded: promoted last. The rule
has an unexercised other end, and this is the site that exercises it.

`step-2.5/complexity` sits between Step 2.5 and Step 2.6 — after the anti-slop lint is
clear, before anything boots — and asks one `noul` per changed file: is this change
involved enough to warrant a rework pass before it is verified?

**The two sites invert each other on both axes, and the axes point opposite ways.**

On **evidence**, `verify-surface` wins outright, for the reasons ADR 0019 sets out. Its
label is the verifier's own verdict: one value, computed by the run, written down
whatever it is, free because the run records it regardless.

This site has nothing of the kind, because it asks about a rework pass `/task` does not
run. There is no recorded decision anywhere to pair an answer against, which is exactly
what [ADR 0012](0012-two-eval-subjects-not-five.md)'s pairing rule wants. Four signals
are recoverable from the finished branch, and every one is partial:

- whether Step 2.6 went red on that file,
- whether the anti-slop lint fired on it,
- whether a later commit in the same run touched it again,
- whether `/review` flagged it.

None is a clean ground truth. A genuinely hard change can draw none of them, and any one
can fire on a trivial change — Step 2.6 goes red against a *run* rather than a file, and
`/review` comments on what the PR description drew its attention to. All four also
arrive **after** the question was asked, so labelling means a pass back over a completed
branch rather than a value the run already holds. `complexity-triage.json`'s `eval`
block states this rather than implying parity, and a test asserts that it does.

On **blast radius**, the ranking reverses completely:

- A wrong answer here says *run an extra rework pass*. The cost is one wasted pass, and
  the run report shows it. Someone reading the report sees the pass that was run and can
  judge whether it was worth it.
- A wrong answer at `step-2.6/surface` says *skip the verification*. The verification of
  a change that did reach a served surface is silently not performed. The run reports
  `skipped`, the PR opens, and nothing downstream notices — no red gate, no failed
  assertion, no line in a log.

## Decision

**The `complexity-triage` set is wired as `step-2.5/complexity`, records only, and is
the site that may be promoted soonest — ahead of `verify-surface` — despite having the
worse labels.**

And, as the general form of the rule ADR 0019 fixed from one end:

> **Only an answer whose failure mode is wasted work may ever be promoted.**

Which carries these consequences, each part of the decision rather than a reading of it:

- **Promotion order is set by the cost of being wrong, never by the quality of the
  label.** The two are independent, and on these two sites they are inverted. A site
  going first on evidence does not go first on promotion, and a site with weak evidence
  is not thereby promoted late. ADR 0019 already separated those orders for one site;
  this makes the separation general.
- **A wasted rework pass is an acceptable worst case. A lost verification is not**, and
  the difference is visibility rather than magnitude. Wasted work leaves an artefact
  somebody can read. Skipped work leaves nothing, so nobody learns the answer was wrong
  and the error never gets corrected. That asymmetry, not the size of either cost, is
  what orders promotion.
- **Worse labels do not make a site safer to promote; they make its promotion harder to
  justify.** Nothing here lowers the bar. Promotion still needs a pre-registered bar
  under [ADR 0013](0013-the-eval-bar-is-pre-registered.md) — this set has none — a
  result clearing it, and its own ADR superseding ADR 0008. Being first in line is not
  being close to the front of it.
- **Even a promoted version may act in one direction only.** A high answer may ADD a
  rework pass. A low answer may never withhold one that would otherwise run — which
  today is vacuous, since no pass runs, and stops being vacuous the moment one does.
- **A row that cannot be attributed to a file is dropped rather than scored.** Step 2.6's
  red is a run-level fact and a later commit may touch a file to fix a different one, so
  a row whose only positive signal is unattributable leaves the corpus. That is the
  treatment
  [ADR 0011](0011-deterministic-comment-keeps-run-before-the-classifier.md) gives a
  pre-filtered comment, for the same reason: scoring cases the question was never about
  inflates the number.

## Consequences

The campaign has both ends of its promotion order fixed, from two sites that disagree on
every axis. A third site can be placed without re-arguing the principle: ask what a
wrong answer costs, and whether anybody would find out.

No run's outcome moves. No rework pass is scheduled and none is withheld, Step 2.6 skips
exactly the diffs it skipped before, and a device without a `TYPESAFE_API_KEY` cannot
tell this shipped.

The costs, stated rather than softened:

- **This site's corpus may never be worth having.** Four partial lagging signals may not
  compose into a usable label, and the honest outcome is that a labelling pass is
  attempted and abandoned. Wiring it is cheap; the labelling pass is not, and nobody has
  agreed to run one.
- **"Promoted soonest" is the phrase most likely to be misread as "promote it".** It
  means first in a queue that is not moving. The three requirements above are unchanged
  and none of them is met.
- **The rule is now general, which is a bigger claim than one site's worth of evidence
  supports.** Two sites is a thin basis for a rule about every future site. It is
  recorded as a rule anyway because an ordering invented per site is one argued from
  whichever site is being proposed.
- **One question per changed file leaves the device per `--jev` run**, where the other
  site asks one per run. A large diff therefore costs proportionally more, which is what
  the per-run token cap from
  [ADR 0018](0018-task-records-jev-answers-against-its-own-outcomes.md) bounds. The state
  is path-shaped and diff-shaped, gated twice under
  [ADR 0009](0009-conversation-derived-state-leaves-the-device.md), and printable in full
  with `--dry-run` before anything is sent.

What a human now owns: whether blast radius is the right primary key for promotion order
at all, whether four partial lagging signals are worth building a corpus on, and whether
a rework pass nobody currently runs is a question worth asking before one exists.

## Related

- ADR: [0005 Agent-authored decisions are marked in frontmatter](0005-agent-authored-decisions-are-marked-in-frontmatter.md)
- ADR: [0008 No question set acts in this campaign](0008-no-question-set-acts-in-this-campaign.md) — not superseded
- ADR: [0009 Conversation-derived state leaves the device](0009-conversation-derived-state-leaves-the-device.md)
- ADR: [0011 The deterministic comment keeps run before the classifier](0011-deterministic-comment-keeps-run-before-the-classifier.md)
- ADR: [0012 The judgement layer ships with two eval subjects, not five](0012-two-eval-subjects-not-five.md)
- ADR: [0013 The eval bar is pre-registered](0013-the-eval-bar-is-pre-registered.md)
- ADR: [0018 /task records Jev answers against the outcomes it already watches](0018-task-records-jev-answers-against-its-own-outcomes.md)
- ADR: [0019 The load-shedding site is promoted last](0019-the-load-shedding-site-is-promoted-last.md) — the other half of this ordering
- Feature: [judge-verb](../features/judge-verb.md)
- Feature: [task](../features/task.md)
