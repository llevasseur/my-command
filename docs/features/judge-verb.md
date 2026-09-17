---
type: feature
title: judge-verb
description: The my-command-tools judge verb and the judgement layer around it — two gates that are off by default, records that act on nothing, and an eval that returned no.
tags: [toolkit, judge, eval, decisions]
timestamp: 2026-09-17
updated: 2026-09-17
dirty: true
---

# judge-verb

## Summary

`my-command-tools judge` asks one versioned question set about one state file and
prints the answers as JSON. The question sets live in `src/toolkit/judge/`, the
client that talks to TypeSafe's System One endpoint lives in
`src/toolkit/lib/jev.mjs`, and this verb is the only thing that composes a request
from the two.

**It is wired into no command.** Nothing calls it, no hook reads it, and no answer
it returns changes any outcome. Running it by hand is the whole of its invocation
surface.

Read the eval result below before reading anything else here as a recommendation.
**The campaign that built this shipped zero measured subjects.** What exists is a
measurement apparatus, a labelled corpus, and a negative result.

## This verb is not the `/judge` command

Two different surfaces share a word, the same way `pr` the verb and `/pr` the
command do:

| Surface | What it is |
|---|---|
| `my-command-tools judge` | This verb. Asks a shipped question set about a state file and prints JSON. |
| [`/judge`](judge.md) | A workflow command that checks claude-proxy's fired suggestions against the transcripts behind them. |

Neither calls the other and they share no code.

## Flags / Parameters

```
my-command-tools judge --set <name> --state-file <path> [--judge] [--shadow]
                       [--baseline <path>] [--dry-run]
```

| Flag | What it does |
|---|---|
| `--set <name>` | A question set shipped at `src/toolkit/judge/<name>.json`. A lowercase slug; anything else is refused rather than joined onto a path. |
| `--state-file <path>` | The state to judge. JSON is sent as JSON, anything else as text. A path rather than stdin, for the reason `commit --message-file` takes one. |
| `--judge` | Opt in, for this invocation only. Without it nothing is sent, even with a key present. |
| `--shadow` | Record what the layer said beside what the existing path decided, and act on neither. |
| `--baseline <path>` | What that existing path decided, for the shadow record. |
| `--dry-run`, `-n` | Print the exact body that would be posted and the host it would go to. No network call. |

Five sets ship: `trim`, `clean-comment`, `dispatch-route`, `verify-regression`
and `bash-shape`. **None of them carries a number.** See the eval result below.

Exit codes: `0` for an answer, a gated-off run, or a failed ask alike; `1` for a
question set on disk this verb cannot read; `2` for bad usage.

## Behavior

### Two gates, and the default is off

A key present means the layer **can** run. An explicit per-invocation opt-in means
it **does**. Neither alone is enough.

- The key is read from `TYPESAFE_API_KEY` in the environment and from nowhere else.
- The opt-in is `--judge` on the invocation, or `MY_COMMAND_JUDGE=1` in the
  environment. The accepted values are `1|on|true|yes`; anything else leaves the
  layer off, so a typo costs a run that did not happen rather than an egress
  nobody asked for.

**With no key set, every command behaves exactly as it does today.** Not an error,
not a warning, not a mention — `gate()` reports that case as `silent`, so someone
who never opted in never learns the layer exists. The absence of a key wins
outright over any opt-in, with every opt-in set at once.

That shape is [ADR 0009](../adrs/0009-conversation-derived-state-leaves-the-device.md)'s.
It mirrors the `MY_COMMAND_HOOKS=0` disarm precedent with the polarity reversed,
and the reversal is the point: a gate that refuses a call is safe by default, and
a call that leaves the device is not.

### Conversation-derived state leaves the device

Asking sends the state file's contents to
`https://api.typesafe.ai/v1/systemone`, which is a third party. The state being
judged is conversation-derived working material — a `/trim` précis, a comment and
its surrounding diff, a routing decision. That is what the verb is for, and it is
stated rather than implied.

The posted body is `{state, model, questions}`. The API key is never part of it:
it travels as an `Authorization` header and is never printed.

**`--dry-run` prints that exact body before anything is sent.** It is a first-class
path, not a debugging aid, and it is deliberately ungated — requiring the opt-in in
order to read what the opt-in would send would invert the promise. The dry run and
the live call compose the body through the same `buildRequest`, so there is no
second code path that could drift, and the output names the endpoint as well as the
body. An egress you can only describe is one nobody checks.

Shadow records land under `~/.my-command/judge/<set>/`, outside any checkout, so a
record of what was sent can never be committed by accident.
`MY_COMMAND_JUDGE_DIR` redirects that keep. A run's spend is capped at 200,000
tokens by default; `MY_COMMAND_JUDGE_TOKEN_CAP=0` is how an uncapped run is asked
for rather than fallen into.

### Nothing acts, and shadow mode is not why that is safe

Every question set ships in shadow.
[ADR 0008](../adrs/0008-no-question-set-acts-in-this-campaign.md) settles that
nothing in this campaign acts on a Jev answer, and promotion is a follow-up that
was gated on eval numbers that do not exist.

`consult()` returns a report with `acted` fixed to the literal `false` on every
path, and no field on it names a verdict, a choice, or an edit to apply. A caller
that ignores the entire return value is behaving correctly rather than sloppily.

**Shadow mode is not the safety mechanism. Nothing acting is.** The distinction
matters because a mechanism credited with safety it does not provide is the kind of
thing a later change removes as redundant. Shadow is the last gate before
promotion — a way of collecting what the layer *would* have said — and it is
described that way here and nowhere else.

### Every failure fails open

Nine ways this layer declines to answer, and each one means "behave exactly as
today": `no-key`, `bad-key`, `validation`, `rate-limited`, `overloaded`, `timeout`,
`malformed`, `below-threshold`, `spend-cap`. There is no tenth that means anything
else. A judge error must never change a run's outcome and must never fail a gate,
so the client never throws and the verb exits 0 on all nine.

That is tested rather than asserted: each mode runs a caller twice — with the layer
and without — and the test requires the two outputs to be **byte-identical**. An
`acted` branch is left structurally unreachable so the test is not a tautology, and
a closing assertion holds the tested set against the exported `FAILURE_MODES`, so a
tenth mode fails there rather than shipping untested.

## The eval returned no

[ADR 0013](../adrs/0013-the-eval-bar-is-pre-registered.md) fixed every threshold
before the harness existed, precisely so the eval could conclude *no*. It did.
`pnpm judge:eval` runs the harness;
[ADR 0014](../adrs/0014-the-eval-returned-no.md) records what it concluded.

### Subject B: abandoned

**Verdict: ABANDON, failing bar `B.corpus`.** 1,923 candidates across 527 sessions
yielded **3** labelled commands against a floor of 200.

The cause is worth more than the verdict. The proxy transcript store records tool
**calls** and assistant prose. It records no results, no exit codes and no error
text, so the outcome half of
[ADR 0012](../adrs/0012-two-eval-subjects-not-five.md)'s pairing rule is nowhere on
disk. 1,537 of the 1,923 candidates had no recorded outcome at all. That
invalidates ADR 0012's premise that the label was already recorded as a natural
experiment, and it constrains **every** future eval built on that store, for this
question or any other.

The labeller refuses to default to `allow`. Doing so would have labelled the whole
corpus and produced a large, meaningless agreement number.

### Subject A: incomplete, not passing

`TYPESAFE_API_KEY` is unset on this device, so **nothing was ever sent** and all
four bars report `not-measured` rather than a pass. A run without a key cannot
report a pass it did not earn.

Its corpus half needs no network and is real: 1,911 labelled rows from 24 `/clean`
commits — keep 1,653, delete 168, tighten 90 — at an 86.5% majority-class baseline,
with 584 comments excluded by the
[ADR 0011](../adrs/0011-deterministic-comment-keeps-run-before-the-classifier.md)
pre-filter. That exclusion drops the baseline 3.2 points from 89.7%, which is the
inflation the ADR exists to prevent, now measured rather than argued.

Subject A's price bar cannot be measured as written: it is a ratio against a
generative `/clean` pass whose token count is instrumented nowhere.

### What follows

- **Zero subjects carry a number.** The five question sets above ship as versioned,
  inspectable prose with no measurement behind any of them.
- **The layer is not removed.** ADR 0013 conditions removal on **both** subjects
  failing. Subject A was not measured rather than failed, and removing the layer
  would discard the only apparatus that could measure it.
- **Nothing is promoted.** No number exists that would justify changing ADR 0008.
- **The spend was never incurred and is not authorised.** With a key present the
  harness would issue one batched call per file across 24 commits. That is a
  human's call.

Three things a human now owns: whether to spend on replaying Subject A, whether to
instrument a generative `/clean` so its price bar becomes measurable, and whether
recording outcomes in the proxy store is worth doing so an outcome-labelled eval
becomes possible at all.

Eight ADRs, 0007 through 0014, bind this work. Six carry `needs-human: true`.

## Related

- Spec: [Command toolkit](../specs/command-toolkit.md) — the verb table this joins
- Feature: [judge](judge.md) — the `/judge` command, a different surface
- Feature: [trim](trim.md) — whose deterministic gates became a facts verb instead
- ADR: [0008 No question set acts in this campaign](../adrs/0008-no-question-set-acts-in-this-campaign.md)
- ADR: [0009 Conversation-derived state leaves the device](../adrs/0009-conversation-derived-state-leaves-the-device.md)
- ADR: [0010 The eval harness ships before the layer](../adrs/0010-eval-harness-before-the-layer.md)
- ADR: [0013 The eval bar is pre-registered](../adrs/0013-the-eval-bar-is-pre-registered.md)
- ADR: [0014 The eval returned no](../adrs/0014-the-eval-returned-no.md)
