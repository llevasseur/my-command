---
type: plan
title: Wayfinder — Jev judgement layer
description: Campaign map for adding an optional, non-acting Jev judgement layer to my-command — the client, the question sets, the eval harness, and only then any runtime surface.
tags: [plan, wayfinder, judge]
timestamp: 2026-09-16
---

# Wayfinder — Jev judgement layer

**Slug:** `jev-judgement-layer`
**Integration branch:** `main` (this campaign is cut from it and merges back into it; the planning and campaign PRs target it)
**Base branch:** `wayfinder/jev-judgement-layer` (cut from the integration branch above; every ticket PR targets it)
**Unattended:** `yes` (fixed at start by whether `--unattended` was typed there; `yes` means the kickoff prompt below resumes this campaign unattended)
**Plans directory:** `docs/plans`
**Started:** 2026-09-16
**Goal:** Ship an optional Jev judgement layer that acts on nothing, plus the eval harness and pre-registered bar that decide whether any of it should ever act.

> Ephemeral scaffolding, on a schedule. Every `jev-judgement-layer-*.md` plan beside this file stays here for the
> campaign's life — marked done once its task lands — so any task can be restarted from what was
> asked. The final ticket `jev-judgement-layer-zz` deletes them all; this map goes when the wayfinder closes. The
> durable output is the merged code and the repo's feature and spec docs.

## The decisions this campaign is bound by

Seven ADRs were written before any ticket was planned, and an eighth records what the
eval concluded. Six carry `needs-human: true`. **They are binding on every ticket.** Read
them first:

| ADR | What it binds |
|---|---|
| [0007](../adrs/0007-deterministic-trim-gates-stay-a-facts-verb.md) | Four of `/trim`'s six gates are deterministic and become a facts verb. They never reach the classifier. |
| [0008](../adrs/0008-no-question-set-acts-in-this-campaign.md) | **Nothing acts.** Every set ships in shadow; promotion is a follow-up. Nothing-acting is the safety mechanism, not shadow mode. |
| [0009](../adrs/0009-conversation-derived-state-leaves-the-device.md) | Conversation-derived state leaves the device. Gated twice, off by default, `--dry-run` prints the exact body. |
| [0010](../adrs/0010-eval-harness-before-the-layer.md) | Ship order is eval-first. Targets 3, 4 and 5 get no runtime wiring; `src/hooks/` is untouched. |
| [0011](../adrs/0011-deterministic-comment-keeps-run-before-the-classifier.md) | `/clean`'s four mandatory keeps are a code pre-filter, and pre-filtered comments leave the eval corpus. |
| [0012](../adrs/0012-two-eval-subjects-not-five.md) | Two eval subjects, not five. Targets 1, 3 and 4 ship as question sets with no numbers. |
| [0013](../adrs/0013-the-eval-bar-is-pre-registered.md) | The abandonment bar is fixed before the harness runs and is the harness's own pass/fail output. |
| [0014](../adrs/0014-the-eval-returned-no.md) | **The eval returned *no*.** Subject B abandoned on a labelled corpus of 3 against a floor of 200; Subject A was never replayed for want of a key. The campaign ships zero measured subjects, and the docs must say so. |

## Agent kickoff prompt

Paste this into an agent CLI from the repository root to begin or resume execution:

```text
Continue the `jev-judgement-layer` wayfinder in this repository.

Read the repository instructions, the wayfinder workflow at src/commands/wayfinder.md, and the
campaign map at docs/plans/wayfinder-jev-judgement-layer.md. Read docs/adrs/0007 through 0013
before planning or executing anything — they are binding on every ticket and they cut this
campaign down substantially from the idea as first proposed. Inspect the live Git and worktree
state before making changes.

Execute the next unblocked active task from the map. A task is eligible when its status is one of:
never started, deliberately paused, stopped because a usage window ran out (and that window has
since reset), or marked for redoing differently. Never re-execute a task a human rejected — that
one needs a new human decision or a rewritten plan, so report it and pick another.

The campaign's final task — the one numbered `zz`, which deletes the campaign's plan files — is
executed only once it is the last active task left. Skip it while any other task is still active,
and never treat it as done work or drop it from the map: it is the only thing that removes the
plan files, so a campaign that skips it leaves its scaffolding in the repository permanently.

Before choosing a task, repair any task marked in progress that no run is actually behind — check
for a live worktree, a recently pushed branch, or an open pull request. A run stopped by a usage
window usually never gets the turn in which it would have recorded that, so a task can sit marked
in progress with nothing running it, and skipping it every time is how a campaign stalls with every
row marked in progress and nothing executing. Where a run is behind it, leave it. Where none is,
read the branch and rewrite the status: stopped with work in hand becomes stopped-by-usage-window
with a note saying no status was recorded, and stopped with nothing worth resuming becomes never
started. Repair every such row first, then pick a task from the repaired map.

Read its linked plan completely, mark it in progress, then run the task workflow against the plan's
criteria with the campaign base branch as its base, so the work happens in an isolated worktree and
is carried through cleanup and a pull request. Retarget that pull request to the campaign base
branch if the task workflow opened it against the default branch. Follow every repository
verification, documentation, and visual-proof requirement.

If you stop before the pull request is open, set the task's status to say why — deliberately paused,
or stopped because the usage window ran out — with a short note, rather than leaving it marked in
progress.

When reporting back, include the task completed, verification results, the pull-request link, and
any remaining risks or decisions.

This campaign is recorded as unattended in the map header above, so resume it that way: type this
workflow's `--unattended` flag on the invocation you run. That routes the ticket through the
merge-through runner, which resolves conflicts, waits for checks, retargets the pull request onto
the campaign base branch, and merges it there. Do not stop at the open pull request — carry the
ticket through to merged, and never leave it targeting the default branch. Include the merge in
what you report back.
```

## Active tasks

| # | Task | Plan | Branch | Status | Note |
|---|------|------|--------|--------|------|
| 08 | docs | [jev-judgement-layer-08-docs](jev-judgement-layer-08-docs.md) | `task/jev-judgement-layer-08-docs` | todo | |
| zz | retire-done-plans | [jev-judgement-layer-zz-retire-done-plans](jev-judgement-layer-zz-retire-done-plans.md) | `task/jev-judgement-layer-zz-retire-done-plans` | todo | Final ticket — deletes every plan. Execute last. |

<!--
Status is exactly one of these six:
  todo          — never started; nothing to resume. Pick it up.
  in-progress   — a ticket run is executing it now. Leave it alone.
  paused        — deliberately stopped, resumable as-is. Pick it back up.
  blocked-limit — the usage window ran out mid-run; nothing is wrong with the
                  work. Resume it once the window resets.
  rejected      — a human reviewed it and turned it down. Do NOT retry it; it
                  needs a new human decision or a rewritten plan.
  redo          — the work landed but must be done again differently. Restart
                  it from the plan.
Note is required for blocked-limit, rejected, and redo; empty for the rest.

The `zz` row is this campaign's final ticket. It always sorts last, it is executed
after every other task, and it deletes every plan in this directory. Do not drop it:
nothing else removes them, so without it they outlive the campaign permanently.
-->

## Dependency order

Tickets 01, 03 and 06 touch disjoint files and have no predecessors — they run together.
Everything after them depends on what they land:

- **01 jev-client**, **03 question-sets**, **06 trim-facts-verb** — no predecessors.
- **02 judge-verb** needs 01 (the client) and 03 (a set to load).
- **04 clean-prefilter** needs 03 (the `/clean` set defines what the pre-filter excludes).
- **05 eval-harness** needs 01, 03 and 04.
- **07 runtime-surface** needs 01 and 02. **Last of the code tickets, by ADR 0010.**
- **08 docs** needs every code ticket, since it documents what actually landed.
- **zz** runs when nothing else is active.

## Completed

<!-- newest first; one entry appended per task completion -->

### jev-judgement-layer-07 — The runtime surface, gated twice and acting on nothing · 2026-09-17

**Built:** `src/toolkit/lib/judge-runtime.mjs` — two gates, the shadow store under `~/.my-command/judge/<set>/`, the spend cap, and the fail-open branches. The opt-in pattern `/^(1|on|true|yes)$/i` deliberately mirrors `hooks-status.mjs`'s disarm pattern with the polarity reversed. No key wins outright over any opt-in, verified with every opt-in set at once. `consult()` fixes `acted: false` on every path and returns no field naming a verdict. **All nine failure modes are tested by running a caller twice — with the layer and without — and asserting byte-identical output**, with an `acted` branch structurally unreachable so the test is not a tautology, and a closing assertion holding the tested set against the exported `FAILURE_MODES` so a tenth mode fails there rather than shipping untested.
**Key files:** `src/toolkit/lib/judge-runtime.mjs` and its test, `src/toolkit/lib/jev.mjs` (one-line `ENDPOINT` export), `src/toolkit/judge/judge-sets.test.mjs`
**Docs:** none — ticket 08 owns the campaign's docs
**Follow-ups / deviations:** Three authorised extras, all done. The `anti-slop/no-runtime-typeof` error this campaign introduced is **fixed properly** — both predicates are now parsers at the JSON boundary answering with the domain value, no lint config edited and no suppression — so `pnpm lint:anti-slop` exits 0 repo-wide again. `ENDPOINT` is exported, so the dry run names where the data would go, which is [ADR 0009](../adrs/0009-conversation-derived-state-leaves-the-device.md)'s intent. **Its own tests caught two real bugs:** `budgetFrom` read an absent cap through `Number('') === 0`, and 0 spells "no cap", so every run that never set the variable would have been silently uncapped; and a test helper's `finally` restored the shadow root on a returned rather than resolved promise, which would have written real records into a developer's home directory. **Shadow mode is described nowhere as the safety mechanism** — nothing acting is, and the module header says so citing ADRs 0008 and 0010. PR #159.

### jev-judgement-layer-05 — The eval harness and the pre-registered bar · 2026-09-17

**Built:** `pnpm judge:eval`, reporting the labelled corpus size before any agreement number and emitting [ADR 0013](../adrs/0013-the-eval-bar-is-pre-registered.md)'s pass/fail verdict per subject. The three hard constraints are enforced by test rather than convention — a test reads the real `verify.mjs`, `package.json` and workflow to prove the harness is unreachable from `verify`, from `pnpm test` and from CI, and self-checks its own glob matcher against a file the suite really runs.
**Key files:** `src/toolkit/eval/` (six new files), `package.json`
**Docs:** none — ticket 08 owns the campaign's docs
**Follow-ups / deviations:** **The eval returned *no*, and [ADR 0014](../adrs/0014-the-eval-returned-no.md) records it.** Subject B ABANDONS on bar `B.corpus` — 1,923 candidates across 527 sessions yielded **3** labelled commands against a floor of 200, because the proxy store records tool calls and prose but no results, exit codes or error text, so the outcome half of the pairing rule is nowhere on disk. The labeller refuses to default to `allow`, which would have labelled everything and made agreement meaningless. Subject A is INCOMPLETE: `TYPESAFE_API_KEY` is unset on this device, so nothing was sent and every bar reports `not-measured` rather than a pass. Its corpus half is real and reproduces ticket 04 exactly. **Subject A's price bar cannot be measured as written** — it is a ratio against a generative `/clean` pass whose token count is instrumented nowhere. PR #158.

### jev-judgement-layer-04 — The /clean pre-filter and its git-history corpus · 2026-09-17

**Built:** The four mandatory keeps as deterministic rules, with a zero-dependency comment scanner that ignores `//` inside strings, template literals and regex literals — and a corpus extractor that walked 24 `/clean` commits in this repo's real history. **It produced the campaign's first numbers: a corpus of 1,911 rows — keep 1,653, delete 168, tighten 90 — at a majority-class baseline of 86.5% keep.**
**Key files:** `src/toolkit/lib/clean-prefilter.mjs`, `clean-prefilter.test.mjs`, `clean-corpus.mjs`, `clean-corpus.test.mjs`
**Docs:** none — ticket 08 owns the campaign's docs
**Follow-ups / deviations:** **[ADR 0011](../adrs/0011-deterministic-comment-keeps-run-before-the-classifier.md) is now measured rather than argued.** 584 comments were excluded by the pre-filter rather than scored; without that exclusion the corpus would be 2,495 rows at an **89.7%** baseline, so applying it drops the baseline **3.2 points** — exactly the inflation the ADR exists to prevent. **Consequence for ticket 05:** [ADR 0013](../adrs/0013-the-eval-bar-is-pre-registered.md)'s Subject A bar now resolves to roughly **96.5% agreement**, demanding precisely because the baseline is honest. Each keep has a near-miss test so the rules cannot quietly keep everything, and a test holds the module's citations against `clean-comment.json`. The corpus reads the file as `/clean` found it rather than diff hunks, because a Keep leaves no hunk and Keeps are the majority class. No live license-header exclusions appeared: this repo keeps its licence in `LICENSE` rather than in code headers, so that rule is test-exercised but found nothing. PR #156.

### jev-judgement-layer-02 — The my-command-tools judge verb · 2026-09-17

**Built:** `my-command-tools judge --set <name> --state-file <path> [--dry-run]`, loading a versioned set and composing one request from it, printing JSON on stdout on every path. The dry-run body is **byte-identical** to what the live call puts on the wire, because both go through one `buildRequest` — which is what makes [ADR 0009](../adrs/0009-conversation-derived-state-leaves-the-device.md)'s inspect-before-you-send guarantee real rather than a claim. A missing key exits 0 with a no-answer result, proven in a real process with the variable deleted.
**Key files:** `src/toolkit/verbs/judge.mjs`, `src/toolkit/verbs/judge.test.mjs`, `src/toolkit/cli.mjs`
**Docs:** none — ticket 08 owns the campaign's docs
**Follow-ups / deviations:** The second gate, the shadow store and the spend cap are deliberately **not** here — [ADR 0010](../adrs/0010-eval-harness-before-the-layer.md) lists them as the runtime surface, which is ticket 07. Running the verb by hand is itself the explicit per-invocation act, and it is wired into nothing. `'dry-run'` was added to `cli.mjs`'s `SWITCHES` so the flag does not swallow the next token. **Two things later tickets should know:** CI reported "no checks reported" on this PR and no run had been created at all, which the workflow would read as a pass — a close-and-reopen produced one, all six green; and `src/toolkit/lib/jev.mjs` does not export its `ENDPOINT`, so `--dry-run` cannot yet name the destination host, which a one-line export would fix. PR #157.

### jev-judgement-layer-06 — The deterministic trim gates verb · 2026-09-17

**Built:** `my-command-tools trim` answers C1's returned-calls half, C3, N1's repeat arithmetic and N2 from the hook library, and reports C2, N3 and the two residual clauses as `unknown`/`residual` rather than guessing. `verdict` is deliberately `null`: six gates decide TRIM or CONTINUE and two of them are not the toolkit's to answer. `/trim` now declares `Bash(my-command-tools:*)`, which it could not call before.
**Key files:** `src/toolkit/verbs/trim.mjs`, `src/toolkit/verbs/trim.test.mjs`, `src/toolkit/cli.mjs`, `src/commands/trim.md`, `commands/trim.md`, `skills/trim/SKILL.md`, `docs/features/trim.md`
**Docs:** `docs/features/trim.md` updated, `dirty: true`
**Follow-ups / deviations:** The hook import is **lazy by necessity, not preference** — a Codex install ships `toolkit` with no `hooks` sibling, so a top-level import would throw while `cli.mjs` built its verb table and take every verb down on those devices. It degrades to `unknown` instead: still one detector, loaded when asked. Two real bugs were caught by the fixtures before review — `repeatedProbe()` matching a command against itself, and the final turn of a transcript always reading as in-flight, so C1 is asked of the last *settled* turn. **One follow-up is outside every ticket's lane and outside this campaign:** `READ_ONLY_TOOLKIT` in `src/hooks/lib/read-only.mjs` does not list `trim`, so the gates read a `my-command-tools trim` call as a mutation and reset their discovery and polling counters. It is a one-word change in `src/hooks/`, which [ADR 0010](../adrs/0010-eval-harness-before-the-layer.md) puts off-limits to this campaign, so it is left for a human rather than smuggled in. It fails open — the gates get laxer, never stricter. PR #155.

### jev-judgement-layer-03 — The versioned question sets · 2026-09-17

**Built:** Five versioned question sets under `src/toolkit/judge/`, criteria lifted from existing rubric prose with every one citing `path:line`. A test re-reads each cited line to confirm it still carries the lifted fragment, so a later edit to `trim.md` or `clean.md` that moves a line fails here rather than drifting silently.
**Key files:** `src/toolkit/judge/trim.json`, `clean-comment.json`, `dispatch-route.json`, `verify-regression.json`, `bash-shape.json`, `judge-sets.test.mjs`
**Docs:** none — ticket 08 owns the campaign's docs
**Follow-ups / deviations:** The four deterministic `/trim` gates sit in an `excluded` block and a test asserts none is ever asked (ADR 0007); the four mandatory keeps sit in a `preFilter` block (ADR 0011); the three label-less sets carry `eval.labels: "none"` (ADR 0012). One `no-runtime-typeof` anti-slop finding left standing on a boundary predicate rather than editing lint config. **The `dispatch-route` test asserts its options are exactly the definitions in `agents/`, so adding a seventh agent fails that test until the set is updated and its version bumped — intended coupling, and a tripwire a later ticket will hit.** PR #154.

### jev-judgement-layer-01 — The zero-dependency Jev client · 2026-09-17

**Built:** A raw `fetch` client for the System One endpoint with the three question types, the error taxonomy, exponential backoff on 429 and 529 only, a spend cap charged from returned `usage`, and fail-open at every mode — `ask()` never throws. The noul confidence band is exported once as the single definition every caller shares.
**Key files:** `src/toolkit/lib/jev.mjs`, `src/toolkit/lib/jev.test.mjs`
**Docs:** none — ticket 08 owns the campaign's docs
**Follow-ups / deviations:** `package.json` dependencies byte-identical, so ADR 0013's abandonment condition was never approached. Wired into nothing, per ADR 0010. 25 tests with an injected `fetch` stub rather than module mocking, which the repo's anti-slop lint forbids. PR #153.
