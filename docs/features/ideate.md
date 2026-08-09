---
type: feature
title: ideate
description: Surveys a repo and proposes features or commands worth building, citing only evidence a person already wrote down, recording every proposal in a ledger, and exiting with a pointer to the dashboard Advice page where a human accepts the ideas improve may act on.
tags: [commands, advice, ideas, claude-proxy]
timestamp: 2026-08-05
dirty: true
---

# ideate

## Summary

`/ideate` surveys a repo and proposes features or commands worth building. It is **proposal only** — it never implements, never opens a branch or worktree, never commits, and never calls [task](task.md). Its output is a ranked set of proposals recorded in a ledger, all at `proposed`, and it **asks nothing**: the run exits naming claude-proxy's dashboard Advice page as where a human accepts or rejects them. [improve](improve.md) is what turns an accepted proposal into a PR — on request, since acceptance is the permission rather than the trigger: that command builds an accepted idea only when named with `--idea <slug>` (or all of them with `--ideas`), one PR per idea.

## Motivation

[improve](improve.md) answers "what is the agent doing slowly?" from rules that count what a transcript did. Those rules have a structural ceiling: they measure how work was *done*, so they can never report a capability that is **missing**. Nothing counts a command that was never written.

That gap needs invention, and `/improve` is forbidden from inventing — on a rule that is load-bearing rather than fussy: padding a run with the agent's own ideas breaks the trace from every change back to the sessions that justified it. Relaxing it there would cost the trace on every change `/improve` makes. So invention gets its own command and its own store, which is what lets both standards stay honest at once.

Two boundaries carry that separation:

- **`/ideate` never writes `suggestion-status.json`.** That store belongs to findings with source sessions behind them.
- **`/improve` may only act on an `accepted` idea.** That is an amendment to its "never invent" note rather than a weakening of it: the rule is about the *trace*, and an accepted idea traces to a recorded human sign-off. A `proposed` or `rejected` idea is still invention and `/improve` never reads it.
- **`/ideate` writes `proposed` and no other status.** It never accepts its own proposal, which would manufacture the trace rather than earn it.

## Flags / Parameters

- `--range <spec>` / `-r <spec>` — the bucket window for **evidence source 2 (judge notes) only**. One bucket (`9`), a list (`2,3,9`), a span (`2-9`), or a mix (`2-4,9`). Default: every bucket. The other three sources are not bucketed, so this never narrows the survey as a whole.
- `--dry-run` / `-n` — report the proposals and write **nothing at all**, not even the `proposed` rows. It still resolves the tier and reads every tier for dedupe, since a proposal that collides is not worth reporting either.
- Anything else is not a flag this command takes and is reported rather than interpreted. There is no free-text argument.

## Behavior

### Evidence, not vibes

Every proposal must cite at least one of four sources, **with file paths**. All four already exist and were authored by a person; an agent asked "what would be useful?" produces plausible slop indefinitely, and this constraint is the only thing that stops it. "I noticed the code could use X" cites nothing and is not written down.

1. **`## Open questions` sections** in the docs bundles — the best source available, because somebody already decided the question was worth asking and left it unresolved.
2. **Judge enrichment notes** on CONFIRMED suggestions — prose about what actually keeps going slowly rather than a rule id. **This source may not exist**: the `suggestions judge`/`buckets` verbs may be absent, or no bucket may carry a verdict. The run then says so and works from the other three rather than failing. Only this source is narrowed by `--range`.
3. **The CHANGELOG** — what shipped, and what a run of related entries implies is half-built.
4. **Authored deferrals** — explicit `Out of scope` / `Non-goals` / `Deferred` / `Future work` statements in `docs/specs/`, `docs/adrs/` and feature docs. A written "not now" is a decision somebody made, not something inferred.

The survey is one batched read pass, per `shared/batched-discovery.md`.

### The ledger, and where it lands

One entry per idea, carrying a stable kebab-case **slug** (the dedupe key), a title, a bulleted rationale, the evidence with paths (and `bucket/id` for a judge note), the repo it lands in **as a git remote slug**, a status of `proposed` / `accepted` / `rejected` / `shipped`, the date, and for `rejected` the reason or for `shipped` the PR url.

The repo is a remote slug rather than a checkout path because the tier-1 store is device-wide and shared across every repo on the machine — a path names a different thing, or nothing, on the next one.

The store resolves as a waterfall, read wide and written narrow:

1. **claude-proxy** — `<logDir>/ideas.json`, reached through `pnpm --filter server ideas`, with the checkout resolved exactly as `shared/claude-proxy-checkout.md` does. A separate file and namespace from `suggestion-status.json`.
2. **The surveyed repo's own docs bundle** — `docs/ideas.md`, committed markdown with a header stating the contract.
3. **Device-local** — `~/.claude/ideas/<repo-slug>.md`, the same shape as tier 2.

Four rules make a waterfall safe for something used as a dedupe key:

- **Write to the highest available tier, and name it in the report.** A silently-different tier between two runs is exactly how a rejected idea comes back.
- **Dedupe reads every tier that exists**, not just the winning one. A machine that gains claude-proxy later must not forget what `docs/ideas.md` recorded.
- **Fall through on absence only, never on error.** An unset `CLAUDE_PROXY_STORE`, a missing path, a checkout with no `server/package.json`, or an absent `ideas` CLI all mean tier 1 is *absent*. A tier-1 store that exists and fails to read or write is a **stop** — writing tier 2 behind a broken tier 1 forks the ledger into two that each look complete.
- **Never propose a slug already present in any tier in any status, `rejected` included**, and refuse a near-duplicate under a different slug too, naming what it collides with. Tier 1 reports the near matches for a candidate as **`similarIdeaSlugs`**, so a non-empty list is a collision even when the exact slug is free; a markdown tier means reading the rows. A rejected idea returning every run is the failure this key prevents, and the rejection reason is the most valuable row in the file.

`shared/claude-proxy-checkout.md` gained an **optional-dependency** clause for this: the same derivation, but a command that declares the dependency optional reads those three failures as absence and falls through, while an error still stops. `/improve` and `/judge` do not declare it optional and keep the hard stop unchanged.

### The rationale is bullets, in plain English

The rationale is a list of bullets rather than a paragraph, and `shared/plain-rationale.md` is where that shape is stated once. A person reads it on the dashboard to decide one thing — accept, or reject — usually without having run the survey and usually with several cards open. A paragraph makes that reader parse prose for the claim they are deciding on. A fixed list makes two ideas comparable line for line.

Six bullets, written as literal `- ` lines: **what it is**, **the problem**, **how it works**, **what it replaces or simplifies**, **size**, and **depends on `<slug>`** — the last written only when the idea consumes something a named idea introduces, since its absence is what tells `/improve` the idea declares no dependency. Three of Step 3's five required statements live here; the other two, the evidence and the repo, are fields of their own.

Each bullet follows [ASD-STE100](https://asd-ste100.org) Simplified Technical English: one idea per sentence and at most twenty words, active voice and present tense, one word per concept, no idiom, at most three nouns in a row, an abbreviation written out the first time or not used at all, an article before each countable noun, and no pronoun pointing at another bullet — a reader scans a card out of order.

This is **stricter than `shared/rewrite-toward.md`**, which draws on the same standard and deliberately declines its word list, sentence cap, and simple tenses. That file governs command instructions, where the reader is an agent and a long sentence buys precision. A rationale is a short pitch to a human about to click Accept or Reject, so the cap costs nothing.

Nothing rewrites a row it did not write: a rationale already on the ledger as a paragraph stays a paragraph, and claude-proxy's dashboard renders both shapes.

### The run

**No human in the loop at all.** The run is unattended start to finish; the sign-off happens afterwards, in a browser.

1. Resolve the tier; read every existing tier for dedupe.
2. Survey the four sources in one batched pass.
3. Compose **at most 3** proposals, ranked. Each states what it is, its evidence with paths, the repo, a rough size, and **what it would replace or simplify** — an idea that only adds surface has to say so. The rationale carries three of those as plain-English bullets, per the section above.
4. Write **all** of them as `proposed`, including ones expected to be rejected. Dedupe only works if the ledger records what was considered rather than only what was liked.
5. **Exit**, naming the dashboard Advice page as where they get adjudicated. Every row stays `proposed`; nothing else is marked.

If nothing survives dedupe and the evidence rule, the run **stops and says so** — a real answer, the same as `/improve` finding nothing pending.

### Where the sign-off moved, and why it is not a relaxation

The in-session question existed for exactly one reason: `pnpm --filter server ideas mark` was the only way to reach a status, so a proposing run could not end without a person at a terminal. claude-proxy's dashboard Advice page now carries the ledger as approve/deny cards — `GET /api/ideas` lists them, `/api/ideas/stream` streams them over SSE so a row a run just wrote appears without a reload, and `POST /api/ideas/status` sets `accepted`, `rejected`, or `proposed` (the undo). A person adjudicates on their own schedule, so blocking a run to wait for them buys nothing.

What did **not** change is everything the trace rests on:

- **`/improve` still acts only on an `accepted` idea.** The sign-off is still required; only its venue moved.
- **A `proposed` row is the adjudication queue, not an unanswered question.** It is also what dedupe reads, so it is not re-proposed next run — a slug present in any tier in **any** status is refused, `proposed` included.
- **A rejection still carries its reason.** `POST /api/ideas/status` refuses a `rejected` mark with 400 unless a note comes with it, because that reason is the ledger's dedupe record. The human writes it; nothing invents one.
- **`shipped` stays CLI-only**, because it carries a PR url, and `/ideate` never sets it either way.

### Two rules that keep it useful

- **Do not restate an Open Question as a proposal.** The question is already written down; the proposal has to add a design. "Should we offer a rolling last-10 view?" is not a proposal; "add a rolling window alongside the fixed one, sharing the rule engine, with the fixed buckets keeping the flag store" is.
- **Never propose work `/improve` would find.** A suggestion rule tripping belongs there, with its source sessions. `/ideate` covers what the rules structurally cannot see.

## What changed in improve

- Step 2 is now "Read the pending suggestions **and the accepted ideas**", reading `ideas list -s accepted --repo <slug> --json` through the same waterfall. Only `accepted` is read, and `--range` does not apply to it.
- Step 4 composes idea-sourced criteria **alongside** the suggestion ones, labelled as such and never merged into a suggestion's criterion group — they argue from different evidence, and a merged group can defend itself with only one of them.
- Step 6 gains `ideas mark --slug <slug> -s shipped -n "<PR url>"`, on the same terms as `suggestions mark`: only what actually landed. An idea whose PR did not land stays `accepted` and returns next run.
- `--dry-run` reports the accepted ideas it would act on and marks nothing in either store.
- The "Never invent an improvement" note is **extended, not replaced**: an accepted idea is a second way of satisfying the trace requirement, while an idea thought of mid-run, still `proposed`, or `rejected` remains invention and may never become a criterion.

## Related

- [improve](improve.md) — turns accepted ideas and confirmed suggestions into a PR.
- [judge](judge.md) — produces the enrichment notes that are evidence source 2.
- [task](task.md) — what `/improve` dispatches to, and what `/ideate` deliberately never calls.
