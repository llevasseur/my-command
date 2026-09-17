---
type: adr
title: The eval reports its own failures rather than scoring them as low confidence
description: The Jev client answers every failure with an empty answer map, so an eval that reads a missing answer as an unconfident one converts its own broken calls into a verdict about the classifier — the harness therefore bounds each request, counts answers against questions, writes every reason into the report, and returns inconclusive where it used to return abandon.
tags: [process, toolkit, decisions, judge, eval]
timestamp: 2026-09-17
dirty: true
decided-by: /god
ratified: false
wayfinder: jev-judgement-layer
needs-human: true
---

# The eval reports its own failures rather than scoring them as low confidence

## Status

Accepted, and **proposed by `/god` rather than ratified by a human**. Written by an
unattended run under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s convention:
`decided-by: /god`, `ratified: false`, `needs-human: true`.

It carries `needs-human: true` because it **retracts a published result**.
[ADR 0014](0014-the-eval-returned-no.md) records that the eval returned no; this ADR
holds that Subject A's half of that no was an artifact of the harness and is not a
finding about Jev. Whether to re-measure, and what the campaign now claims to have
established, are calls a human makes.

## Context

The harness ran with a real key for the first time on 2026-09-17, as
`pnpm judge:eval --limit 2`, and printed `VERDICT: ABANDON` for Subject A on a
coverage bar of 4.5% against a floor of 20%.

**That verdict was produced by the harness, not by the classifier.** The corpus was
132 comments in 2 file batches. Seven rows came back with answers. The printed 85.7%
agreement was six correct out of seven, and the coverage figure was six rows reaching
the confidence band divided by all 132 — because the 125 rows that were never answered
were each scored as `confidence: 0`, which is arithmetically indistinguishable from the
classifier having answered and been unsure.

Two causes, both in this repository and neither in `src/toolkit/lib/jev.mjs`.

**The client cannot report its own failure, by design.** ADR 0013 fixed the contract
that `ask()` never throws: no key, a refused key, a 422, a timeout, exhausted retries
and an unreadable body all resolve to a result whose answer map is empty. That is
correct for a runtime caller — a command that asks Jev a question and gets nothing back
behaves exactly as it did before Jev existed — and it is exactly wrong for an eval,
whose entire job is to distinguish "answered, unsure" from "never answered".
`subject-a.mjs` did capture the `reason` the client returned, and then dropped it:
grepping the written report for `reason`, `error`, `timeout`, `422` or `401` found
none of them. The failure was legible only in the terminal scrollback of the run that
produced it.

**And the request was unbounded.** `replayBatch` built one question per corpus row and
sent a whole file's comments as a single call, so a file of 125 comments became a
125-question request. Nothing capped it, and nothing compared the answer count to the
question count afterwards. A partial answer was therefore not an event the harness
could observe; it was just a thinner set of rows.

[ADR 0015](0015-jev-traffic-is-recorded-outside-the-client.md) already reached the
first half of this conclusion from the other side, and built `jev-record` because
"a call that failed silently reaches an eval as a verdict". The recorder makes the
traffic legible from outside. It does not make the harness read it.

## Decision

**The eval measures its own calls, and a number it computed over a run that lost
answers is not reported as a measurement of the classifier.**

Four parts, all within `src/toolkit/eval/`. `jev.mjs` is unchanged and its
never-throws contract stands — this is the caller learning to read a result it was
already being given.

**One, a request carries at most `MAX_QUESTIONS_PER_CALL` questions**, which is 25 and
overridable with `--chunk <n>`. The batch stays batched: `buildRequest`'s reasoning
that Speculative Fan-Out makes several questions in one call cheaper than several calls
is untouched, and a file under the ceiling is still exactly one call. What the ceiling
buys is a bounded blast radius, so one short answer costs a countable number of rows
rather than a file.

**Two, every call records what it asked against what it got.** Per call: the question
count, the question ids as sent, the answer count, and the ids that never came back.
`answerCount + unansweredIds.length === questionCount` is the invariant the 2026-09-17
run had nowhere to state. A call may be `ok: true` and still short — that is precisely
the 7-of-125 shape — and both facts are kept.

**Three, every `reason` the client returns reaches the written report**, verbatim,
alongside the client's own `detail` text. A run whose calls failed is readable as such
from the report file alone, with nothing re-run: `401`, `422` and `timeout` are words
that now appear in it.

**Four, a bar computed over an incomplete run reports `inconclusive`, and a subject
with an inconclusive bar returns `inconclusive` rather than `abandon`.** A bar in that
state can never reach `fail`, so it can never drive an abandonment. The downgrade runs
in both directions — a *pass* computed from seven of 132 rows is as untrustworthy as a
failure — and a genuine failure measured on complete data still abandons exactly as
before.

**The coverage denominator is not repaired.** Coverage remains reached rows over the
whole corpus, and an unanswered row still counts against it, because
[ADR 0013](0013-the-eval-bar-is-pre-registered.md) chose that denominator so an
abstaining classifier could not post full coverage, and because dividing by the
answered rows instead would convert a broken run into a flattering number. The
unanswered rows are stated as unanswered — in a `RUN INTEGRITY` block printed *before*
the metrics it affects, on the same principle by which ADR 0012 and ADR 0013 put the
corpus size before any agreement number.

**And the eval can route its calls through the recorder.** `--record` finds the newest
running `jev-record` session by reading the `session.json` format
`docs/specs/command-toolkit.md` fixes, or takes a URL outright as `--record <url>`;
the resolved session is named in the report, so the record sits beside it by reference.
A `--record` with no live recorder is an error rather than a fall-through to the real
endpoint — falling through would spend the budget on exactly the calls that were asked
to be written down, and produce a report that looks recorded and is not.

## Consequences

**Subject A's 2026-09-17 result is withdrawn.** It measured the harness. Nothing in
this change re-measures anything, and no number here supersedes ADR 0013's bars, which
are unchanged: ADR 0013 holds that moving a bar after a result is visible takes a
superseding ADR, and none is moved. Subject B's abandonment in ADR 0014 stands
untouched — it was decided on a corpus count with no network involved.

**ADR 0013's latency bar changes unit above the ceiling.** It reads "p95 for one
batched call covering a file's comments". A file of more than 25 comments is now
several calls, so p95 becomes a per-call figure covering part of a file. This is
recorded rather than silently absorbed: the bar's threshold is unchanged, the quantity
under it is narrower, and a human ratifying this ADR is ratifying that too. A file at
or under the ceiling is unaffected.

**Price becomes correct where it was previously undercounted.** Cost and displaced
context are charged to the first row of each call rather than of each file batch. The
2026-09-17 run counted one call of the two it made, because the second returned no
usage and rows carrying no usage are skipped by design.

**Nothing is promoted and nothing is wired in.** The gates stay off,
[ADR 0008](0008-no-question-set-acts-in-this-campaign.md) still holds that no question
set acts, and the eval remains unreachable from `verify`, from `pnpm test`'s globs and
from every CI job — `judge-eval.test.mjs` asserts all three against the real files and
still does.

The cost is that the harness now has opinions about its own health, and a bar can be
withheld by a bug in the withholding. That is the trade this ADR takes deliberately: a
withheld verdict is visible and asks to be fixed, while the failure it replaces
published a number about a classifier that had never answered.
