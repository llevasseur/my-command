---
type: plan
title: jev-judgement-layer-03 — The versioned question sets
description: One JSON file per decision at src/toolkit/judge/, with criteria lifted verbatim from rubric prose already written in the command sources and agent definitions rather than invented.
tags: [plan, wayfinder, judge, toolkit]
timestamp: 2026-09-16
---

# jev-judgement-layer-03 — The versioned question sets

**Wayfinder:** `jev-judgement-layer`
**Branch:** `task/jev-judgement-layer-03-question-sets`
**Status:** done · 2026-09-17

No predecessors. Runs in the first wave.

## Why one file per decision

A question set is versioned JSON at `src/toolkit/judge/<set>.json`, one file per
decision, so **a rubric change is a reviewable diff and an eval has a fixed subject**. A
set whose criteria drift between runs cannot be evaluated, because two runs would be
answering different questions.

## Criteria

**Lift the criteria from rubric prose that is already written. Do not invent new
rubrics.** Every set below has a source in this repository, and the wording in the set
should be traceable to it.

**`trim.json`** — the residual `/trim` gates only. Four of the six left the layer for a
facts verb under [ADR 0007](../adrs/0007-deterministic-trim-gates-stay-a-facts-verb.md),
so this set carries **only** what no extractor can answer, sourced from
`src/commands/trim.md:27-32`:

- C1's **"mid-tool sequence"** clause — every call returning cleanly is compatible with
  being halfway through a sequence the agent intends to finish.
- N1's **"would hide useful negative evidence"** clause — the repeat count is arithmetic
  and the worth of the evidence is not.
- **C2 RECOVERABLE** in full.
- **N3 VERIFIED** in full.

Each is a `noul`. Several nouls go in **one call**, per the Speculative Fan-Out pattern.

**`clean-comment.json`** — a three-option `choice` (Delete, Tighten, Keep) over the
rubric at `src/commands/clean.md:63-65`, with each option's rubric string lifted from
that prose. **It covers only comments that survive the deterministic pre-filter** of
[ADR 0011](../adrs/0011-deterministic-comment-keeps-run-before-the-classifier.md), so the
four mandatory keeps are absent from this file by design — a set that asked about them
would hand the classifier four questions it cannot get wrong.

**`dispatch-route.json`** — a `choice` over the closed set of `mycommand-*` agent shapes
in `agents/`, each option's rubric lifted from that definition's own declared role. This
is TypeSafe's Intent Routing pattern. It has a recorded failure to point at: a `/god` run
lost a step when its `mycommand-finisher` declined to run `/review`, because that agent's
own definition forbids applying edits beyond `/clean` — a wrong decision made at dispatch
time, by prose, costing an extra reviewer dispatch.

**`verify-regression.json`** — a single `noul` over two verify log tails answering "is
this failure pre-existing on the default branch or a regression from this branch?". Note
in the file itself that **the expensive half is acquiring the baseline state**, which
wants a caching verb rather than a classifier, so this set judges only once both states
are already in hand.

**`bash-shape.json`** — a `noul` filling the hook gate's blind spot. `UNJUDGEABLE` at
`src/hooks/lib/bash-shapes.mjs:15` is an explicit bail-out, so every Bash command
containing a variable, a subshell or a brace falls straight through 562 lines of regex
classification. Measured: **1054 such commands across 313 sessions, 8.6% of 12226
recorded Bash calls.**

## Constraints

- **Three of these five sets carry no eval numbers**, by
  [ADR 0012](../adrs/0012-two-eval-subjects-not-five.md): `trim`, `dispatch-route` and
  `verify-regression` have no recoverable labels. Say so **in each file**, so a later
  reader does not assume a number exists somewhere.
- **`dispatch-route` and `bash-shape` are wired into nothing**, per
  [ADR 0010](../adrs/0010-eval-harness-before-the-layer.md). `src/hooks/` is untouched by
  this campaign.
- Every file carries a **version** field, so a rubric change is visible as a version bump
  as well as a diff.
- No file contains an API key, a token, or any credential.

## Done when

- [ ] Five files under `src/toolkit/judge/`, each versioned and each loadable by ticket 02's verb.
- [ ] Every criterion is traceable to the prose it was lifted from, cited by path and line.
- [ ] `trim.json` carries only the four residual gates, not the four deterministic ones.
- [ ] `clean-comment.json` excludes the four mandatory keeps.
- [ ] The three sets with no labels say so in the file.
- [ ] A test asserts each file parses and matches the request shape ticket 01 builds.
- [ ] `pnpm test` and `./scripts/check-commands.sh` pass.
