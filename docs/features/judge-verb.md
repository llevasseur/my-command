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
`src/toolkit/lib/jev.mjs`, and this verb composes a request from the two. It is not
the only thing that does: `src/toolkit/lib/judge-run.mjs` composes one per question
site for [`/task --jev`](task.md). Both go through the client's own `buildRequest`, so
there is one definition of what a request is.

**The verb is wired into no command** — nothing calls it and no hook reads it, so
running it by hand is the whole of *its* invocation surface. The runtime it shares,
`src/toolkit/lib/judge-runtime.mjs`, now has exactly one command surface:
[`/task --jev`](task.md), which asks question sets at points in a run and writes the
answers into that run's report beside what the run actually did.

**No answer changes any outcome, on either surface.** `--jev` is record-only: it opens
a recorder, asks, writes down what came back, and acts on none of it. It now wires
**two question sites** — `step-2.5/complexity`, asked between `/task` Step 2.5 and Step
2.6, and `step-2.6/surface`, asked at Step 2.6's second skip condition. Both carry
`acts: false` like every other, so wiring them added rows to the corpus and no branch to
the run. Promotion stayed per question set rather than per flag, so a set could be let
through later without `--jev` changing and without `--jev` granting it.
[ADR 0018](../adrs/0018-task-records-jev-answers-against-its-own-outcomes.md) records
that surface, [ADR 0019](../adrs/0019-the-load-shedding-site-is-promoted-last.md) the
first site, and
[ADR 0020](../adrs/0020-the-adding-work-site-is-promoted-first.md) the second; none
supersedes ADR 0008.

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

Seven sets ship: `trim`, `clean-comment`, `dispatch-route`, `verify-regression`,
`bash-shape`, `verify-surface` and `complexity-triage`. **None of them carries a
number.** See the eval result below.

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

**Promotion is per question set, never per flag.** `/task --jev` is the only command
surface and it is record-only whatever a set says; each site carries its own `acts`,
every shipped one carries `false`, and `actingSites()` in `judge-run.mjs` is the single
door. That separation is the point: "record what the layer would say" and "let the
layer decide" would otherwise be one switch, which is the confusion ADR 0008 exists to
prevent.

### The first wired site, and why it is promoted last

`step-2.6/surface` asks the `verify-surface` set one `noul`: does the diff reach a
surface the app serves? It sits beside `/task` Step 2.6's second skip condition, where
a `routes` glob match already answers that deterministically. **The glob still decides.**
The answer goes into the run report beside the glob's and is read by nothing.

It went first because of its **label**. Step 2.6 ends by recording its own verdict with
`my-command-tools shots record --verdict <verdict>`, whatever that verdict is — so a run
that went on to exercise a surface is the high label and a run that came back `skipped`
or `unverified` for want of one is the low label. That is the cleanest and
highest-volume label in the campaign: computed by the run rather than inferred from a
transcript, produced on the same branch minutes later, available from every `/task` run,
and **free**, because the run records it whether or not `--jev` was passed. It is
precisely what [ADR 0014](../adrs/0014-the-eval-returned-no.md) found the proxy store
could not supply.

It is also **the last site that may ever be promoted**, and the two facts are about the
same property. This question would decide a **skip**, so its failure is silent: a wrong
high answer costs one wasted verification round, while a wrong low answer loses the
verification of a change that did reach a served surface and leaves no artefact anywhere.
[ADR 0019](../adrs/0019-the-load-shedding-site-is-promoted-last.md) fixes the rule that
follows — **Jev may add work, Jev may never skip work** — and puts any promotion of this
set behind a pre-registered [ADR 0013](../adrs/0013-the-eval-bar-is-pre-registered.md)
bar it does not yet have, a result clearing it, and its own ADR superseding ADR 0008.
Even then it could only let a high answer *add* a round, never let a low answer withhold
one.

One confound is handled in the set rather than left for a reader. Step 2.6 has two skip
conditions and only the second is about surfaces, so a row labelled from a bare `skipped`
is dropped from the corpus rather than scored — the treatment
[ADR 0011](../adrs/0011-deterministic-comment-keeps-run-before-the-classifier.md) gives a
pre-filtered comment, for the same reason.

### The second wired site, and why it could be promoted first

`step-2.5/complexity` asks the `complexity-triage` set **one `noul` per changed file**:
is the change to this file involved enough to warrant a rework pass before it is
verified? It sits between `/task` Step 2.5 and Step 2.6 — after the anti-slop lint is
clear, before anything boots. **No rework pass is scheduled and none is withheld.**

It shadows no deterministic check, which makes it different in kind from the first site.
`verify-surface` sits beside a glob and records a second opinion on a decision the run
already makes; this one asks about a rework pass `/task` has never run, so there is no
existing answer to agree or disagree with. Nothing computes it either: a line count is
not complexity — a one-line change to a shared guard can be the hardest thing on a
branch, and a three-hundred-line change can be a rename a tool applied.

**Its labels are the worse of the two, and the set says so rather than implying parity.**
`verify-surface` is labelled by the verifier's own verdict: one value, computed by the
run, recorded whatever it is, free. This site has four signals, all recoverable from the
branch and all partial — whether Step 2.6 went red on that file, whether the lint fired
on it, whether a later commit in the same run touched it again, whether `/review` flagged
it. None is a clean ground truth: a hard change can draw none of them, and any one can
fire on a trivial change, since Step 2.6 goes red against a *run* rather than a file. All
four also arrive **after** the question was asked, so labelling means a pass back over a
finished branch rather than a value the run already holds. A row whose only positive
signal cannot be attributed to its file is dropped rather than scored.

**It is nonetheless the site that could be promoted soonest, ahead of `verify-surface`.**
Promotion order is set by what a wrong answer costs, not by how good the label is, and on
these two sites those rank in opposite directions. A wrong answer here says *run an extra
rework pass*: one wasted pass, visible in the run report. A wrong answer at
`step-2.6/surface` says *skip the verification*: a check silently not performed, with
nothing downstream noticing.
[ADR 0020](../adrs/0020-the-adding-work-site-is-promoted-first.md) records that ordering
and generalises ADR 0019's rule — **only an answer whose failure mode is wasted work may
ever be promoted**. Soonest is not soon: the three requirements above are unchanged, this
set has no pre-registered bar either, and being first in a queue that is not moving buys
nothing today.

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
tenth mode fails there rather than shipping untested. The same nine modes run a
`/task --jev` run against a `/task` run with no layer, and require the outcome to be
identical there too.

`not-recorded` — a `--jev` run with no recorder session — is **not** a tenth mode. The
nine are ways a call declined to answer; that one is a run declining to make the call,
so it lives in `judge-run.mjs` rather than in the client's taxonomy.

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

- **Zero subjects carry a number.** The seven question sets ship as versioned,
  inspectable prose with no measurement behind any of them. `verify-surface` and
  `complexity-triage` both have recoverable labels and no corpus yet, no pre-registered
  bar covers either, and their labels are not comparable with each other.
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

## Running the harness

`pnpm judge:eval [options]`. With `TYPESAFE_API_KEY` set it makes real calls and
spends real budget, so the parser refuses anything it does not recognise —
an unknown flag, a stray value, or a missing or non-numeric value for a flag that
takes one — and exits non-zero with usage before a single request is built. `--help`
and `-h` print usage and call nothing.

| Flag | What it does |
| --- | --- |
| `--limit <n>` | Score at most `n` corpus rows. Use it before any full run. |
| `--chunk <n>` | Questions per call. Default 25; a value at or below zero means no ceiling. |
| `--bytes <n>` | Bytes per request. Default 98,304, which is 96 KiB. |
| `--record [url]` | Route every call through a `jev-record` proxy. Bare, it finds the running session; no live recorder is an error. |
| `--json` | Print the report as JSON instead of as text. |
| `--out <dir>` | Write the report somewhere other than the default directory. |

**Every call carries two ceilings, and both apply.** At most 25 questions, from
[ADR 0016](../adrs/0016-the-eval-reports-its-own-failures.md), and at most 96 KiB of
serialised request body. The question ceiling alone was not enough: the endpoint caps
a request's input tokens, and 25 comments carrying long diff context serialise well
past that cap, which is how 28 of the 2026-09-17 run's 103 calls were refused with
`max_tokens_exceeded`. The byte figure comes from what the endpoint has been observed
to accept, since no limit is documented. Each call record carries the `requestBytes`
it sent, so a refusal for size is readable from the report without a re-run.

## Related

- Spec: [Command toolkit](../specs/command-toolkit.md) — the verb table this joins
- Feature: [judge](judge.md) — the `/judge` command, a different surface
- Feature: [trim](trim.md) — whose deterministic gates became a facts verb instead
- ADR: [0008 No question set acts in this campaign](../adrs/0008-no-question-set-acts-in-this-campaign.md)
- ADR: [0009 Conversation-derived state leaves the device](../adrs/0009-conversation-derived-state-leaves-the-device.md)
- ADR: [0010 The eval harness ships before the layer](../adrs/0010-eval-harness-before-the-layer.md)
- ADR: [0013 The eval bar is pre-registered](../adrs/0013-the-eval-bar-is-pre-registered.md)
- ADR: [0014 The eval returned no](../adrs/0014-the-eval-returned-no.md)
- ADR: [0018 /task records Jev answers against the outcomes it already watches](../adrs/0018-task-records-jev-answers-against-its-own-outcomes.md)
- ADR: [0019 The load-shedding site is promoted last](../adrs/0019-the-load-shedding-site-is-promoted-last.md)
- ADR: [0020 The adding-work site is promoted first](../adrs/0020-the-adding-work-site-is-promoted-first.md)
