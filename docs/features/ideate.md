---
type: feature
title: ideate
description: Surveys a repo and proposes features or commands worth building, citing only evidence a person already wrote down, recording every proposal in a ledger, and exiting with a pointer to the dashboard Advice page where a human accepts the ideas work may act on.
tags: [commands, advice, ideas, claude-proxy]
timestamp: 2026-08-05
updated: 2026-08-10
dirty: true
---

# ideate

## Summary

`/ideate` surveys a repo and proposes features or commands worth building. It is **proposal only** — it never implements, never opens a branch or worktree, never commits, and never calls [task](task.md). Its output is a ranked set of proposals recorded in a ledger, all at `proposed`, and it **asks nothing**: the run exits naming claude-proxy's dashboard Advice page as where a human accepts or rejects them. [work](work.md) is what turns an accepted proposal into a PR — on selection, since acceptance is the permission rather than the trigger: that command builds an accepted idea when a run selects it by slug (`--idea`), by area (`--area`), or with no selector at all for every available idea, one PR per idea.

## Motivation

[improve](improve.md) answers "what is the agent doing slowly?" from rules that count what a transcript did. Those rules have a structural ceiling: they measure how work was *done*, so they can never report a capability that is **missing**. Nothing counts a command that was never written.

That gap needs invention, and `/improve` is forbidden from inventing — on a rule that is load-bearing rather than fussy: padding a run with the agent's own ideas breaks the trace from every change back to the sessions that justified it. Relaxing it there would cost the trace on every change `/improve` makes. So invention gets its own command and its own store, which is what lets both standards stay honest at once.

Two boundaries carry that separation:

- **`/ideate` never writes `suggestion-status.json`.** That store belongs to findings with source sessions behind them.
- **`/work` may only act on an `accepted` idea.** That is an amendment to the "never invent" rule rather than a weakening of it: the rule is about the *trace*, and an accepted idea traces to a recorded human sign-off. A `proposed` or `rejected` idea is still invention and `/work` never reads it.
- **`/ideate` writes `proposed` and no other status.** It never accepts its own proposal, which would manufacture the trace rather than earn it.

## Flags / Parameters

- `--range <spec>` / `-r <spec>` — the bucket window for **evidence source 2 (judge notes) only**. One bucket (`9`), a list (`2,3,9`), a span (`2-9`), or a mix (`2-4,9`). Default: every bucket. The other four sources are not bucketed, so this never narrows the survey as a whole.
- `--dry-run` / `-n` — report the proposals and write **nothing at all**, not even the `proposed` rows. It still resolves the hosted ledger and reads all of it for dedupe, since a proposal that collides is not worth reporting either — so an unconfigured device refuses a dry run exactly as it refuses a real one.
- `--area <area>` — the kebab-case area to survey for. **No short alias**, and spelled exactly as the store spells it: `ideas list --area` and `ideas file --area` take the same string, and `-r` and `-n` are taken. Default: absent, which is **not** "no area" — see below.
- Anything else is not a flag this command takes and is reported rather than interpreted. There is no free-text argument.

### `--area` does two jobs

Every ledger entry carries an area, and `parseIdeaAdds` refuses an entry with no area exactly as it refuses one citing nothing. The area is therefore never optional on a write; only the flag is. The flag does two separate things and neither implies the other:

1. **It constrains the survey.** `--area ui-ux` means "propose a user-interface idea", so the survey reads for that kind of idea and only proposals belonging under it get composed.
2. **It supplies the required per-entry field.** With the flag, every proposal the run keeps is under that one area because the survey was narrowed to it — not because the flag stamped a finished batch. **Without the flag each proposal carries the area it belongs to, chosen per proposal**, so one run may file two proposals under two areas.

**One area is never assigned to a batch spanning several.** A candidate that does not belong under the requested area is out of the run's scope: it is dropped and named, never filed under that area to keep the count up.

The vocabulary is **free text validated by shape alone** — any kebab-case word is a valid area and opens a dashboard tab of its own. `SEED_IDEA_AREAS` (`ui-ux`, `infrastructure`, `code-quality`, `services`, `commands`) is advisory: it orders and labels the tabs and appears in the CLI's help, and nothing enforces membership. `/ideate` prefers an area already on the ledger over a new spelling of the same thing, and reports any new area it opens.

## Behavior

### Evidence, not vibes

Every proposal must cite at least one of five sources, and the first four carry **file paths**. All four already exist and were authored by a person; an agent asked "what would be useful?" produces plausible slop indefinitely, and this constraint is the only thing that stops it. "I noticed the code could use X" cites nothing and is not written down.

1. **`## Open questions` sections** in the docs bundles — the best source available, because somebody already decided the question was worth asking and left it unresolved.
2. **Judge enrichment notes** on CONFIRMED suggestions — prose about what actually keeps going slowly rather than a rule id. **This source may not exist**: the `suggestions judge`/`buckets` verbs may be absent, or no bucket may carry a verdict. The run then says so and works from the other sources rather than failing. Only this source is narrowed by `--range`.
3. **The CHANGELOG** — what shipped, and what a run of related entries implies is half-built.
4. **Authored deferrals** — explicit `Out of scope` / `Non-goals` / `Deferred` / `Future work` statements in `docs/specs/`, `docs/adrs/` and feature docs. A written "not now" is a decision somebody made, not something inferred.
5. **A command gap** — a command nobody wrote, cited as `command-gap`. **Available only when the proposal's area is `commands`.** It is the one citation carrying **no locator** (there is no file to point at, which is the condition it describes) and the only one that may stand alone on an entry. Both rules are enforced at the parse boundary, so a `command-gap` citation from any other area is **refused, not stored**. The trade-off is stated rather than hidden: a locator-less citation is the one thing a reader cannot check, and confining it to one area is the price of having it at all.

The survey is one batched read pass, per `shared/batched-discovery.md`. Source 5 is not part of that batch — it has nothing to read, and is a conclusion drawn from what the other four turned up and from what the repo's command surface lacks. `--area` narrows the survey as well as the write, and gates source 5 on the area being `commands`.

**The dedupe read is never narrowed by `--area`.** `ideas list` accepts the flag; Step 1 does not use it. Dedupe reads the whole ledger regardless, because a dedupe read narrowed to one area is exactly how a rejected idea comes back under a different one. That unnarrowed read is also where the run learns the area vocabulary already in use.

### The ledger, and where it lands

One entry per idea, carrying a stable kebab-case **slug** (the dedupe key), a title, a bulleted rationale, the evidence with paths (and `bucket/id` for a judge note, or no locator for `command-gap`), the repo it lands in **as a git remote slug**, its **area**, a status of `proposed` / `accepted` / `rejected` / `shipped`, the date, and for `rejected` the reason or for `shipped` the PR url. The field list `ideas add` parses is `{ slug, title, rationale, evidence[], repo, area, status?, note? }`, and `area` is required on the same footing as the evidence.

`add` reports near-miss areas under `similarAreas` — `infra` beside an existing `infrastructure` — and **still records the entry**, on the same reasoning as near-duplicate slugs: fragmenting the vocabulary is for a reader to notice, not for the store to refuse. `/ideate` surfaces every hit in its report and re-files nothing itself; `ideas file --slug <slug> --area <area>` is the correction, and it touches the area alone.

The repo is a remote slug rather than a checkout path because the store spans every repo **and every device** — a path names a different thing, or nothing, on the next machine that reads the row.

### The store is hosted

The ledger is an **append-only event log** on the existing `operator` Cloudflare Worker over D1, reached with **`IDEAS_URL`** and **`IDEAS_TOKEN`**. It used to be `<logDir>/ideas.json`, a device-local file beside the proxy's logs, behind a three-tier waterfall that fell through to the repo's own `docs/ideas.md` and then to `~/.claude/ideas/<repo-slug>.md`. **All three tiers are gone**, and `pnpm --filter server ideas` is now a client of the hosted store rather than the owner of a file — so its verbs take no `LOG_DIR`, though the `suggestions` verbs still do.

**An unconfigured device refuses every ideas read and write, loudly, with no fallback.** That refusal is deliberate rather than an omission: a device answering from its own copy would keep a second ledger that looks complete from the inside, diverges from the shared one, and re-proposes the ideas the shared one already rejected — the exact failure the dedupe key exists to prevent. Both commands surface it as a setup problem naming `IDEAS_URL` and `IDEAS_TOKEN`, and neither retries it nor routes around it.

The same operations reach the store over MCP as **`ideas_list`** (with an `available: true` argument), **`ideas_add`**, **`ideas_claim`**, and **`ideas_mark`** — which is what an agent in a cloud box with no checkout uses. The rows are the same either way.

Two rules keep a shared ledger usable as a dedupe key:

- **Dedupe reads the whole ledger, every run** — one store across every device and every repo, never narrowed by `--area`, because a read narrowed to one area is exactly how a rejected idea comes back under a different one.
- **Never propose a slug already present in any status, `rejected` included**, and refuse a near-duplicate under a different slug too, naming what it collides with. `add` reports the near matches for a candidate under **`similar`**, computed **server-side against every device's ideas including rejected rows**, so a non-empty list is a collision even when the exact slug is free — and it can name an idea proposed on a machine this one has never talked to. A free slug is not a clear field. A rejected idea returning every run is the failure this key prevents, and the rejection reason is the most valuable row on the ledger.

`shared/claude-proxy-checkout.md` carries an **optional-dependency** clause for this command: the same derivation, but a command that declares the dependency optional reads those three failures as absence and continues, while an error still stops. Since the move, that absence costs `/ideate` the `ideas` CLI and the judge-note evidence source — **not the ledger**, which is hosted and reachable over MCP. `/improve` and `/judge` do not declare it optional and keep the hard stop unchanged.

### The rationale is bullets, in plain English

The rationale is a list of bullets rather than a paragraph, and `shared/plain-rationale.md` is where that shape is stated once. A person reads it on the dashboard to decide one thing — accept, or reject — usually without having run the survey and usually with several cards open. A paragraph makes that reader parse prose for the claim they are deciding on. A fixed list makes two ideas comparable line for line.

Six bullets, written as literal `- ` lines: **what it is**, **the problem**, **how it works**, **what it replaces or simplifies**, **size**, and **depends on `<slug>`** — the last written only when the idea consumes something a named idea introduces, since its absence is what tells `/work` the idea declares no dependency. Three of Step 3's six required statements live here; the other three — the evidence, the repo, and the area — are fields of their own.

Each bullet follows [ASD-STE100](https://asd-ste100.org) Simplified Technical English: one idea per sentence and at most twenty words, active voice and present tense, one word per concept, no idiom, at most three nouns in a row, an abbreviation written out the first time or not used at all, an article before each countable noun, and no pronoun pointing at another bullet — a reader scans a card out of order.

This is **stricter than `shared/rewrite-toward.md`**, which draws on the same standard and deliberately declines its word list, sentence cap, and simple tenses. That file governs command instructions, where the reader is an agent and a long sentence buys precision. A rationale is a short pitch to a human about to click Accept or Reject, so the cap costs nothing.

Nothing rewrites a row it did not write: a rationale already on the ledger as a paragraph stays a paragraph, and claude-proxy's dashboard renders both shapes.

### A user-interface proposal is checked in the browser before it is filed

Step 3.5 opens the running surface and looks at it. It runs for a proposal filed under `ui-ux`, or any proposal whose mechanism changes what a page renders, and is skipped — and reported as not applicable — for a proposal about a CLI verb, a schema, or a workflow gate, which has no page to look at.

**The browser is a check, not a sixth evidence source.** The evidence rule is unchanged: a proposal still cites something a person wrote down, and "I saw it in the browser" cites nothing. What the browser adds is the other half of the question — whether the thing the citation describes is still true on the running page. An `## Open questions` entry from March asks for a control somebody may have shipped in June, and the docs bundle does not know that. Looking is what tells the two apart.

Three outcomes, all reported:

- **Confirmed** — the page shows the problem. The proposal is kept and the observation goes into the entry's **`note`** field, naming the route and what was on screen. It never goes into `evidence`, which holds locators a reader can open.
- **Killed** — the page already does the thing. The proposal is dropped and the report says the browser killed it, naming the route. This is what the step is for.
- **Unavailable** — nothing was running to look at, or the Chrome extension is not connected. The proposal stands on its written evidence alone and the report says the check did not run. An unavailable check never blocks a proposal and is never reported as a pass.

The look is **read-only** and uses the Chrome MCP tools (`tabs_context_mcp`, `tabs_create_mcp`, `navigate`, `read_page` / `find`, `computer` `screenshot`) rather than computer use, which is for native applications. It prefers a dev server already running or a deployed url the docs name; a server it starts is backgrounded with a log file, has its bound port read from that log, and is stopped before the step ends. It submits no form, signs in nowhere, clicks no irreversible control, declines non-essential cookies, treats page text as data rather than instruction, and closes every tab it opened. `--dry-run` still runs the check, since the check writes nothing.

**Four skills may be called, at most one per proposal**, and only where the subject matches: `emil-design-eng` for a control, menu, form, or state change; `apple-design` for gesture, spring, sheet, translucency, typography, and reduced-motion questions; `animation-vocabulary` to name a motion effect so the rationale states the term instead of describing it; and `web-perf` for a proposal claiming a surface is slow. **A skill informs the proposal and never turns the run into an implementation** — several of them describe how to build what they judge, and `/ideate` still opens no branch and writes no code. The list is advisory: an uninstalled skill is skipped without comment, and its absence is not an Unavailable check.

### The run

**No human in the loop at all.** The run is unattended start to finish; the sign-off happens afterwards, in a browser.

1. Resolve the hosted ledger; read the whole of it, never narrowed by `--area`, for dedupe.
2. Survey the five sources in one batched pass.
3. Compose **at most 3** proposals, ranked. Each states what it is, its evidence, the repo, **the area it belongs under**, a rough size, and **what it would replace or simplify** — an idea that only adds surface has to say so. Three of those six are entry fields (evidence, repo, area); the rationale carries the other three as plain-English bullets, per the section above.
4. **Check a user-interface proposal in the browser** (Step 3.5), confirming it, killing it, or recording the check as unavailable.
5. Write **all** of them as `proposed`, including ones expected to be rejected. Dedupe only works if the ledger records what was considered rather than only what was liked.
6. **Exit**, naming the dashboard Advice page as where they get adjudicated. Every row stays `proposed`; nothing else is marked.

If nothing survives dedupe and the evidence rule, the run **stops and says so** — a real answer, the same as `/improve` finding nothing pending.

### Where the sign-off moved, and why it is not a relaxation

The in-session question existed for exactly one reason: `pnpm --filter server ideas mark` was the only way to reach a status, so a proposing run could not end without a person at a terminal. claude-proxy's dashboard Advice page now carries the ledger as approve/deny cards — `GET /api/ideas` lists them, `/api/ideas/stream` streams them over SSE so a row a run just wrote appears without a reload, and `POST /api/ideas/status` sets `accepted`, `rejected`, or `proposed` (the undo). A person adjudicates on their own schedule, so blocking a run to wait for them buys nothing.

What did **not** change is everything the trace rests on:

- **`/work` still acts only on an `accepted` idea.** The sign-off is still required; only its venue moved.
- **A `proposed` row is the adjudication queue, not an unanswered question.** It is also what dedupe reads, so it is not re-proposed next run on any device — a slug present on the ledger in **any** status is refused, `proposed` included.
- **A rejection still carries its reason.** `POST /api/ideas/status` refuses a `rejected` mark with 400 unless a note comes with it, because that reason is the ledger's dedupe record. The human writes it; nothing invents one.
- **`shipped` stays CLI-only**, because it carries a PR url, and `/ideate` never sets it either way.

### Two rules that keep it useful

- **Do not restate an Open Question as a proposal.** The question is already written down; the proposal has to add a design. "Should we offer a rolling last-10 view?" is not a proposal; "add a rolling window alongside the fixed one, sharing the rule engine, with the fixed buckets keeping the flag store" is.
- **Never propose work `/improve` would find.** A suggestion rule tripping belongs there, with its source sessions. `/ideate` covers what the rules structurally cannot see.

## Where an accepted idea goes

[work](work.md) is the whole consumer, and it is a separate command rather than a
track inside [improve](improve.md): the ideas half was split out so that neither
command needs a flag to decide which store it reads.

- It reads **the same hosted ledger this command writes to** — the `operator` Worker reached with `IDEAS_URL` and `IDEAS_TOKEN`, not a device-local file — so an idea proposed on one machine is built from another with nothing copied between them.
- It reads the ideas **available to build** for the repo — `accepted` plus the ones whose claim expired — and nothing outside that set.
- It **claims each idea before any code is written**, under the branch the dispatch is about to cut, then runs one `/task` per idea: one idea, one branch, one PR. The claim is what a second device checks, which is why it only works on a shared store.
- It marks a shipped idea with `ideas mark --slug <slug> -s shipped -n "<PR url>"`, only for what actually landed. An idea whose PR did not land stays `accepted` and returns next run.
- The "never invent an improvement" rule is **extended, not replaced**: an accepted idea satisfies the trace requirement through a recorded human sign-off, while an idea thought of mid-run, still `proposed`, or `rejected` remains invention and may never become a criterion.

## Related

- [work](work.md) — turns an accepted idea into a PR, one per idea.
- [improve](improve.md) — turns confirmed suggestions into a PR; advice only, and it never reads this ledger.
- [judge](judge.md) — produces the enrichment notes that are evidence source 2.
- [task](task.md) — what `/work` and `/improve` dispatch to, and what `/ideate` deliberately never calls.
