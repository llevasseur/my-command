---
name: ideate
description: Survey a repository and propose features or commands worth building, citing only evidence a person already wrote down, recording every proposal in a ledger, and exiting with a pointer to the advice page where a human accepts the ones the improve workflow may act on.
---

# Propose What Is Worth Building

Parse `--range <spec>` and `--dry-run`. There is no free-text argument; report anything else rather than interpreting it.

`$improve` reads what the agent keeps doing slowly and fixes it. This skill asks the other question — what is **missing** — and answers it as advice, not as a change.

**This skill proposes and nothing else.** It never implements, never creates a branch or worktree, never commits, and never invokes `$task`. Its output is a ranked set of proposals recorded in a ledger, all left proposed for a human to adjudicate in the proxy dashboard. Turning an accepted proposal into a pull request belongs to `$improve`.

**It also asks nothing.** There is no in-session sign-off: record the proposals, then exit naming where they get accepted or rejected. The venue changed; the standard did not. A sign-off is still required, and `$improve` still acts only on an accepted idea.

## Why this is separate from improve

`$improve` runs on a rule that is load-bearing: never invent an improvement, because padding a run with your own ideas breaks the trace from every change back to the sessions that justified it. That rule is not relaxed here and must not be reworded there. Invention gets its own workflow, which is what lets both standards stay honest.

Two boundaries, neither of which bends:

- Never write the suggestion status store. That store belongs to findings with source sessions behind them. An idea has a different evidence standard and gets its own store — a separate file in a separate namespace. The two never merge in either direction.
- An idea becomes actionable only when a human accepts it. That sign-off is an accepted idea's trace. A proposed or rejected idea is still invention, and `$improve` reads neither. Where a person does the accepting is a user-interface question; that they did it is not.
- Never accept your own proposal. This skill writes the proposed status and no other. An agent marking its own idea accepted manufactures the trace instead of earning it, and hands `$improve` a criterion nobody signed off on.

## Steps

1. **Resolve the ledger, and read every tier that exists.** Do this before surveying anything: an idea colliding with an existing entry is not composed at all, so the dedupe read comes first.

   Read the proxy store location from the environment. Its parent is the log directory and the directory above that is the claude-proxy repository, confirmed by its server package manifest. **Unlike `$improve` and `$judge`, that repository is an optional dependency here.** An unset variable, a missing path, a repository that is not there, or an ideas command that does not exist all mean the top tier is *absent* — fall through and say so. Never search the filesystem for the checkout and never fall back to a hardcoded path.

   The three tiers, highest first: the ideas store beside the proxy logs, reached through its own ideas command and separate from the suggestion store; the surveyed repository's own committed ideas document in its docs bundle; and a device-local file per repository slug. Read the ideas command's own help before composing a write rather than guessing its verbs.

   Four rules make a waterfall safe for something used as a dedupe key:
   - Write to the highest available tier and name the tier used in the report. A silently different tier between two runs is how a rejected idea comes back.
   - Dedupe reads every tier that exists, not only the winning one. A machine that gains the proxy later must not forget what the committed document already recorded.
   - Fall through on **absence** only, never on error. A store that exists and fails to read or write is a **stop**: writing a lower tier behind a broken higher one forks the ledger into two that each look complete.
   - Never propose an entry key already present in any tier in any status, **rejected included**, and refuse a near-duplicate under a different key too. On the top tier the store reports near matches for a candidate as `similarIdeaSlugs`, so a non-empty list is a collision even when the exact key is free; on a markdown tier the same check means reading the rows yourself. Name the entry it collides with and drop the proposal. A rejected idea returning every run is the specific failure the key prevents, and the rejection reason is the most valuable row in the file.

   Record the repository an idea lands in as its git remote slug, never an absolute checkout path — the top tier is device-wide and shared across every repository on the machine, so a path names a different thing on the next one.

2. **Survey four evidence sources in one batched pass.** Enumerate every path first, then issue all the reads together in a single turn; searching for the sections is itself the enumeration. Never walk the list one file per turn, and never read a file already in context a second time.

   **Every proposal must cite at least one source, with file paths.** This is what the whole workflow rests on: asked what would be useful, an agent produces plausible-sounding slop indefinitely, and the only thing that stops it is requiring evidence that already exists and was **written by a person**.
   - Open questions sections in the docs bundles. The best source available, because somebody already decided the question was worth asking and left it unresolved.
   - Judge enrichment notes on confirmed suggestions — prose about what actually keeps going slowly, rather than a rule identifier. **This source may not exist yet:** the judging verbs may be absent and no window may carry a verdict. When there are no notes, say so and work from the other three. Do not fail the run. Only this source is narrowed by `--range`.
   - The changelog: what shipped recently, and what a run of related entries implies is half-built.
   - Authored deferrals — explicit out-of-scope, non-goal, deferred, or future-work statements in specs, decision records, and feature docs. Like an open question, a written "not now" is a decision somebody made rather than something you inferred.

3. **Compose at most three proposals, ranked.** Three is a ceiling, not a target; two good proposals beat three, and one beats two padded to three. Each states all five of: what it is as a design; the evidence with file paths, or window and identifier for a judge note; the repository it lands in as a remote slug; a rough size; and **what it would replace or simplify**. An idea that only adds surface must say that it only adds surface — a proposal may be additive, but not silently. Say what the ranking is on.

   If nothing survives dedupe and the evidence rule, **stop and say so**. A run with no proposals is a real answer, the same way finding nothing pending is. Never lower the evidence bar to have something to show.

4. **Write every proposal to the ledger as proposed** — including the ones you expect to be rejected. This is the run's only write, and proposed is the only status it sets. Dedupe only works if the ledger records what was *considered*, not only what was liked; an idea that never reaches the file can be re-proposed next run with a straight face. Each entry carries a stable kebab-case key, a title, a one-paragraph rationale, its evidence with paths, and the repository slug. On a markdown tier, append rows in the shape that file's header defines. If the write refuses a key, or answers with a non-empty `similarIdeaSlugs`, dedupe missed a collision: say which, and drop that proposal rather than renaming it to get past the refusal — a rename is exactly the near-duplicate the key exists to catch.

   A dry run stops here, having reported the proposals and the tier it would have written them to, and having written **nothing at all** — not even the proposed rows.

5. **Exit, and say where the proposals get adjudicated.** The run ends here with nothing asked. The in-session question existed for one reason: marking a status was possible only through the ideas command line, so a proposing run could not end without a person at a terminal. The proxy dashboard's **advice page** now carries the ledger as approve and deny cards, reading it over an HTTP list route, streaming new rows over server-sent events so a row this run just wrote appears without a reload, and posting a status route that sets accepted, rejected, or proposed as the undo. A person adjudicates on their own schedule, so blocking a run to wait for them buys nothing.

   Leave every row at proposed and set no other status. Do not ask which to accept and do not decide it yourself. A proposed row is the adjudication queue rather than an unanswered question, and it is also what dedupe reads — so it will not be re-proposed, because step 1 refuses a key present in any tier in **any** status, proposed included. A rejection still carries its reason, written by whoever rejects it: the status route refuses a rejected mark without a note, because that reason is the ledger's dedupe record. Nothing here invents one. **Never mark anything shipped:** that status carries the pull request url, stays on the command line, and this workflow opens no pull request.

6. Stop there, naming the advice page as where the accepting happens. `$improve` picks an idea up once it is accepted, and only then.

## Rules

- Do not restate an open question as a proposal. The question is already written down; a proposal has to add a design — a mechanism, a shape, a decision. "Should we offer a rolling last-ten view?" is not a proposal; adding a rolling window beside the fixed one, sharing the rule engine while the fixed windows keep the flag store, is. Having nothing to add to a question means a run with fewer proposals, not a proposal.
- Never propose work `$improve` would find. Evidence that is a suggestion rule tripping belongs there, with its source sessions. This skill covers what the rules structurally cannot see: a missing feature, a missing command, a workflow with no tooling at all. Nothing counts a command that was never written, which is precisely why proposing one needs a different workflow and a different store.
- `--range` narrows one source, not the run. A report implying the whole survey was scoped to a window is wrong about three of its four sources.
- The key is the dedupe key, so it must be stable. Name the idea, not the run.
- Report the tier written to, which tiers were read for dedupe, whether judge notes were available, how many proposals were composed, what collided and with what, that every proposal is recorded as proposed and awaits sign-off on the advice page, and that no branch or pull request was opened.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, one that proposes nothing, and one
that is blocked, refused, or awaiting an answer.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. Being
the only item left is the cue to resolve it, not to leave it open: mark it done
with the run's final tool call, then send the closing message, so the list ends
clean while that message still carries no tool call. A compaction boundary is a
checkpoint, not an ending — a recap prompt, a background-task notification, or a
session-continuation preamble each mean the run is still owed its turn, so
answer in text alone, say where the run stands, and restore the todo item if it
did not survive. Every message from the user opens a task in the same
transcript, and only a reply carrying text and no tool call closes it, so answer
a mid-run question, correction, or recap in text before returning to tool calls.
