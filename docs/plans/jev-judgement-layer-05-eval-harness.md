---
type: plan
title: jev-judgement-layer-05 — The eval harness and the pre-registered bar
description: A standalone pnpm judge:eval that replays recorded states against the API, reports four metrics per subject, and emits the ADR 0013 pass/fail verdict — networked, nondeterministic, and unable to fail CI.
tags: [plan, wayfinder, judge, eval]
timestamp: 2026-09-16
---

# jev-judgement-layer-05 — The eval harness and the pre-registered bar

**Wayfinder:** `jev-judgement-layer`
**Branch:** `task/jev-judgement-layer-05-eval-harness`
**Status:** done · 2026-09-17

**Depends on** tickets 01, 03 and 04.

## Why this is the campaign's deliverable

[ADR 0010](../adrs/0010-eval-harness-before-the-layer.md) made the eval the thing this
campaign ships. [ADR 0008](../adrs/0008-no-question-set-acts-in-this-campaign.md) means
nothing acts, so the only return this campaign produces is the numbers below.

## Criteria

A standalone `pnpm judge:eval` script.

### Two subjects, and only two

[ADR 0012](../adrs/0012-two-eval-subjects-not-five.md) cut five to two, because only two
have labels recoverable from recorded history:

- **`/clean` comment keep/drop** — labels from git, via ticket 04's extractor, with the
  pre-filter applied to the corpus.
- **The hook `UNJUDGEABLE` blind spot** — a measured candidate population of **1054
  commands across 313 sessions**, read from `CLAUDE_PROXY_STORE`. The label is a natural
  experiment, not a counterfactual: a fall-through that **ran and returned content** is
  *allow*; one that was **refused or failed and then reissued in a smaller form that
  succeeded** is *should have been refused*, with the reissued form recorded beside it as
  its own evidence.

**Report the labelled corpus size before any agreement number.** 1054 is the candidate
count, not the labelled count, and a reissue can happen for an unrelated reason. Per
ADR 0012 and ADR 0013, **if outcome-pairing yields fewer than 200 labelled commands this
subject drops to question-set-only** and the campaign has one eval subject.

### Four metrics per subject

They can disagree, so all four are reported:

1. **Agreement with the recorded label, split by confidence band.** This is how you
   discover whether the thresholds hold for this domain. For a `noul`, which carries no
   confidence field, band by the value's own distance from 0.5 — ADR 0013 fixes high
   confidence at `|noul − 0.5| ≥ 0.4`.
2. **Price, computed exactly** from the `usage.input_tokens` and `usage.output_tokens`
   returned on every response. **Never estimated.**
3. **Latency p50 and p95**, measured against the turn it would replace.
4. **Displaced context** — tokens the agent never had to load into its own window.

### The pass/fail verdict

[ADR 0013](../adrs/0013-the-eval-bar-is-pre-registered.md) fixes the bar **before this
harness runs**, and the harness emits the verdict rather than leaving a reader to judge
the numbers afterwards. Every bar is a pair — agreement at a band, and the share of the
corpus reaching that band — because a classifier that abstains on almost everything can
post a perfect agreement number and be worthless.

**Subject A, `/clean`:** abandon if agreement at confidence ≥ 0.9 fails to beat the
majority-class baseline by 10 points or is below 0.90 absolute; if under 20% of the
corpus reaches that band; if judging one file's comments costs more than 10% of the
generative pass it replaces; or if p95 for one batched call exceeds 5s.

**Subject B, the blind spot:** abandon if agreement at `|noul − 0.5| ≥ 0.4` is below
0.95; if under 25% of the labelled corpus reaches that band; if p95 end-to-end exceeds
**200ms**; or if the labelled corpus is under 200 commands. The agreement bar is higher
because [Workflow gates](../specs/workflow-gates.md) says "a false denial is worse than a
missed violation". **The 200ms bar is expected to fail** — a `PreToolUse` gate runs on
every tool call and a network round trip is unlikely to clear it. That is why it is
written down in advance.

## Constraints

- **It must NOT run inside `my-command-tools verify` and must NOT be able to fail CI.**
  It is networked and nondeterministic; this repo's gates are neither. Do not add it to
  `pnpm test`, to `check-commands.sh`, or to any workflow that blocks a PR.
- It reads `claude-proxy` **only as a label source**, through the `CLAUDE_PROXY_STORE`
  variable `/judge` already requires. **No change of any kind to that repository.**
- Honour Speculative Fan-Out: several questions in one call cost less than several calls.
- No API key is written to disk. No corpus file containing a real key.
- Corpus and result files land outside the repository.

## Done when

- [ ] `pnpm judge:eval` runs standalone and is absent from `verify`, `pnpm test` and CI.
- [ ] Both subjects report all four metrics, price computed from returned `usage` counts.
- [ ] The labelled corpus size is reported before any agreement number.
- [ ] The ADR 0013 verdict is emitted per subject as pass or abandon, with the failing
      bar named.
- [ ] A test asserts the script cannot be reached from `verify` or from `pnpm test`.
- [ ] `pnpm test` and `./scripts/check-commands.sh` pass — without running the eval.
