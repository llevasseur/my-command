---
type: plan
title: jev-judgement-layer-07 — The runtime surface, gated twice and acting on nothing
description: The two gates, the shadow store under ~/.my-command/judge/, and the fail-open branches — landing last, after the eval, and wired so that no command's outcome can change.
tags: [plan, wayfinder, judge, toolkit]
timestamp: 2026-09-16
---

# jev-judgement-layer-07 — The runtime surface, gated twice and acting on nothing

**Wayfinder:** `jev-judgement-layer`
**Branch:** `task/jev-judgement-layer-07-runtime-surface`
**Status:** active

**Depends on** tickets 01 and 02. **This is the last code ticket**, by
[ADR 0010](../adrs/0010-eval-harness-before-the-layer.md).

## Criteria

### Two gates, because capability and opt-in are different questions

- **`TYPESAFE_API_KEY` present** means the layer **can** run.
- **An explicit per-invocation opt-in** — `MY_COMMAND_JUDGE=1`, or a `--judge` flag —
  means it **does**.

**The default is OFF even with a key present.** This mirrors the `MY_COMMAND_HOOKS=0`
disarm precedent in [Workflow gates](../specs/workflow-gates.md), with the polarity
reversed: a gate that refuses a call is safe by default, and a call that leaves the
device is not.

**With no key, every command behaves exactly as it does today — no error, and no
mention.** A user who never opts in never learns this layer exists.

### Shadow mode

`--shadow` runs the layer alongside the existing path, records both answers, and **acts
on neither**. Records land under `~/.my-command/judge/`, beside the existing `shots/`
keep and **outside the checkout** — data, not source, and never committable by accident.
Follow `shots`' own conventions: an env override for the keep root so tests exercise it
for real without writing into a developer's home directory.

**Shadow is not the safety mechanism, and must not be documented as one.**
[ADR 0008](../adrs/0008-no-question-set-acts-in-this-campaign.md) is explicit: nothing
acting is what makes this safe. A mechanism credited with safety it does not provide is
the kind of thing a later change removes as redundant.

### Fail open everywhere, without exception

A missing key, a 401, a 422, a 429, a 529, a timeout, a malformed response, a confidence
below threshold, and a reached spend cap **all mean "behave exactly as today"**. A judge
error must never change a run's outcome and must never fail a gate.

### Thresholds are per-action, not per-system

Start from the 0.5 global abstention floor and 0.9 before anything destructive, then
calibrate against the eval corpus. Begin conservative and loosen only as results justify
it. A `noul` carries no confidence field, so its threshold logic is derived from the
value's own distance from 0.5 — reuse ticket 01's exported band function rather than
writing a second definition.

## Constraints

- **Nothing acts on a Jev answer.** Per ADR 0008 every set is shadow-only in this
  campaign, so this ticket delivers the recording path and the gates, not a decision path.
- **`src/hooks/` is untouched.** Per ADR 0010, targets 3, 4 and 5 get no runtime wiring.
  A `PreToolUse` gate runs on every single tool call, and a network round trip there would
  tax every Bash call the user ever makes.
- **The `PreToolUse` blind spot has a named blocker before it may ever be wired**, from
  ADR 0010: [Workflow gates](../specs/workflow-gates.md) requires that a gate fail open
  **and never refuse the same subject twice**, and `check-commands.sh` enforces both.
  A nondeterministic classifier asked twice about one subject is exactly the shape the
  second property forbids, and nothing in this repository documents how a probabilistic
  gate satisfies it.
- The API key stays in the process environment only, never written to any file here.

## Done when

- [ ] Both gates exist; the default is off with a key present, and a missing key is silent.
- [ ] `--shadow` records both answers under `~/.my-command/judge/` and acts on neither.
- [ ] An env override redirects the shadow keep root, and the tests use it.
- [ ] A test asserts every one of the nine failure modes leaves the caller's behaviour
      byte-identical to the no-layer path.
- [ ] `git status` is clean of shadow records after a shadow run — nothing lands in the repo.
- [ ] `src/hooks/` carries no change from this ticket.
- [ ] `pnpm test`, `pnpm run check:toolkit` and `./scripts/check-commands.sh` pass.
