---
description: Survey a repo and propose features or commands worth building — cite evidence a person already wrote down, record every proposal in the ledger, and exit pointing at the dashboard's Advice page, where a human accepts the ones /my-command:improve may pick up
argument-hint: "[--range|-r <spec>] [--dry-run|-n]"
---

Propose what is worth building. [improve](improve.md) reads what the agent keeps doing slowly and fixes it; this command asks a different question — what is **missing** — and answers it as advice rather than as a change.

**This command proposes and nothing else.** It never implements, never opens a branch, never commits, and never calls `/my-command:task`. Its whole output is a ranked set of proposals recorded in a ledger, left at `proposed` for a human to adjudicate on claude-proxy's dashboard. Turning an accepted proposal into a PR is `/my-command:improve`'s job, not this one's.

**It also asks nothing.** There is no in-session sign-off: the run records its proposals and exits, naming where they get accepted or rejected. That is a change of *venue*, not of standard — the sign-off is still required and `/my-command:improve` still acts only on an `accepted` idea.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; there is no free-text argument — anything left over is something you meant as a flag, so say so rather than interpreting it.

## Why this is not part of `/my-command:improve`

`/my-command:improve` runs on a rule that is load-bearing rather than fussy: **never invent an improvement**, because padding a run with your own ideas breaks the trace from every change back to the sessions that justified it. That rule is not relaxed here and must not be reworded there. Invention gets its own command instead, which is what lets both standards stay honest at once.

Two boundaries follow, and neither bends:

- **Never write `suggestion-status.json`.** That store belongs to findings with source sessions behind them. An idea has a different evidence standard and gets its own store — a separate file in a separate namespace.
- **An idea becomes actionable only when a human accepts it.** That sign-off *is* an accepted idea's trace, which is the amendment `/my-command:improve` carries. A `proposed` or `rejected` idea is still invention, and `/my-command:improve` never reads one. Where the accepting happens is a UI question; that it happened is not.
- **Never accept your own proposal.** This command writes `proposed` and no other status. An agent marking its own idea `accepted` manufactures the trace instead of earning it, and hands `/my-command:improve` a criterion nobody signed off on.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **Resolve it in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** Every run recorded before this marker existed is read from that prose, and the prose is still the only reading for any message the marker is missing from. Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

## Flags

- `--range <spec>` / `-r <spec>` — the bucket window for **evidence source 2 (judge notes) only**. One bucket (`9`), a list (`2,3,9`), a span (`2-9`), or a mix (`2-4,9`). **Default: every bucket.** The other three sources are not bucketed and this flag does not narrow them; say so if you report a narrowed run.
- `--dry-run` / `-n` — report the proposals and **write nothing at all**, not even the `proposed` rows. A dry run resolves the ledger tier and reads every tier for dedupe, because a proposal that collides with an existing slug is not worth reporting either.
- Anything else is not a flag this command takes. Report it rather than interpreting it.

## Step 1 — Resolve the ledger, and read every tier that exists

The ledger is where a proposal is recorded and, more importantly, where dedupe reads from. Resolve it before surveying anything: an idea that collides with an existing slug is not composed at all, so the read comes first.

### Tier 1 — claude-proxy

**claude-proxy is an _optional_ dependency of this command**, unlike [improve](improve.md) and [judge](judge.md) where its absence ends the run. Resolve it exactly as they do:

<!-- include-block: shared/claude-proxy-checkout.md -->
**This command cannot run without claude-proxy**, and its location is not hardcoded — it comes from the environment, exactly as [revive](revive.md) resolves the transcript store.

- **`CLAUDE_PROXY_STORE` (required)** — the directory the proxy writes session transcripts into. Read it from the environment (`printenv CLAUDE_PROXY_STORE`); never guess a path and never derive one from a repo checkout or clone location.
- **Probe an optional variable as `printenv <NAME> || true`, and never in the same call as the required one.** `printenv A; printenv B` exits on B's status, so one unset optional variable reports the whole probe as failed even though A resolved — a half-success read as a failure, and then re-run. One call per variable, with `|| true` on every optional one.
- Derive the two paths the suggestion tooling needs from it: the **log directory** is its parent (the store is `<logDir>/sessions`), and the **claude-proxy checkout** is the directory above that. Confirm the checkout by looking for its `server/package.json`.
- **If `CLAUDE_PROXY_STORE` is unset, or its path is missing, or the derived checkout has no `server/package.json`, stop.** Say which of the three failed, that this command has no suggestions to read without it, and that it must be exported in the shell environment — e.g. in `~/.zshrc`:

  ```sh
  export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
  ```

  Do not search the filesystem for a claude-proxy checkout yourself, and do not fall back to a hardcoded path.
- **Where a command declares claude-proxy an _optional_ dependency, those three failures mean it is *absent* rather than that the run is over.** Only a command that says so at its own step, and names what it falls back to, may read them that way; anything that does not say otherwise takes the stop above. **An error is still a stop even then.** A store that exists and fails to read or write is not absence — continuing past it writes a second copy of something that already has one, and two stores that each look complete is worse than no store.
<!-- /include-block -->

**Read that snippet's last bullet as the operative one here.** Its opening line and its stop are written for `/my-command:improve` and `/my-command:judge`, which have nothing to read without claude-proxy. This command **declares it optional**, so all three of those failures — unset variable, missing path, no `server/package.json` — mean tier 1 is *absent*: take the derivation, skip the stop, fall to tier 2, and name that in the report. What still stops the run is an **error**: a store that is there and will not read or write.

Ideas live at `<logDir>/ideas.json`, **a separate file and a separate namespace from `suggestion-status.json`**, reached through the `ideas` CLI:

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas list --json                     # the whole ledger
LOG_DIR="<logDir>" pnpm --filter server ideas list -s accepted --repo <slug> --json
```

Read `pnpm --filter server ideas --help` before composing a write; do not guess the verb syntax.

### Tier 2 — the surveyed repo's own docs bundle

`docs/ideas.md`, committed markdown, with a header stating the ledger's contract. Create it from that header if the repo has none.

### Tier 3 — device-local

`~/.claude/ideas/<repo-slug>.md`, the same markdown shape as tier 2.

### The four rules that make a waterfall safe for a dedupe key

- **Write to the highest available tier, and name the tier used in the report.** A silently-different tier between two runs is exactly how a rejected idea comes back.
- **Dedupe reads every tier that exists, not just the winning one.** A machine that gains claude-proxy later must not forget what `docs/ideas.md` already recorded. Read them all, every run.
- **Fall through on absence only, never on error.** An unset `CLAUDE_PROXY_STORE`, a missing store path, a checkout with no `server/package.json`, or an `ideas` CLI that is not there yet all mean tier 1 is **absent** — fall to tier 2 and say so in the report. A tier-1 store that exists and fails to read or write is a **stop**: writing tier 2 behind a broken tier 1 forks the ledger into two ledgers that each look complete.
- **Never propose a slug already present in any tier in any status — `rejected` included.** Also refuse a near-duplicate: the same idea under a different slug defeats the key just as completely. On tier 1 the store reports the near matches for a candidate as **`similarIdeaSlugs`**, so a non-empty list is a collision even when the exact slug is free; on a markdown tier the same check is yours to make by reading the rows. Either way, name the entry it collides with and drop the proposal. A rejected idea returning on every run is the specific failure this key exists to prevent, and the rejection reason is the most valuable row in the file.

**The repo an idea lands in is recorded as its git remote slug** (`llevasseur/claude-proxy`), read from `git remote get-url origin`, never as an absolute checkout path. The tier-1 store is device-wide and shared across every repo on the machine, so a path names a different thing — or nothing — on the next one.

## Step 2 — Survey the four evidence sources in one batched pass

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

**Every proposal must cite at least one of the four sources below, with file paths.** This is the constraint the whole command rests on: an agent asked "what would be useful?" produces plausible-sounding slop indefinitely, and the only thing that stops it is a rule that the evidence must already exist and must have been **written by a person**. "I noticed the code could use X" cites nothing and is not written down.

1. **`## Open questions` sections in the docs bundles.** The highest-quality source available, because somebody already decided the question was worth asking and left it unresolved. Find them rather than assuming a count: `rg -n '^## Open questions' -A 20` across the bundle.
2. **Judge enrichment notes** — the written notes on CONFIRMED suggestions, which are a record in prose of what actually keeps going slowly rather than a rule id. Read them with `suggestions list -d --json` and take the `enrichment` field, narrowed by `--range` when given. **This source may not exist yet.** `/my-command:judge` and the `suggestions judge`/`buckets` verbs may not be present in the resolved checkout, and no bucket may carry a verdict. When there are no notes to read, **say so and work from the other three — do not fail the run.**
3. **The CHANGELOG** — what shipped recently, and what a run of related entries implies is half-built.
4. **Authored deferrals** — explicit `Out of scope` / `Non-goals` / `Deferred` / `Future work` statements in `docs/specs/`, `docs/adrs/`, and the feature docs. Like an open question, a written "not now" is a decision somebody made rather than something you inferred.

Enumerate the paths first, then send the whole batch in one turn. Sources 1 and 4 are found by one `rg` each across the bundle; that `rg` is the enumeration.

## Step 3 — Compose at most three proposals, ranked

Three is a ceiling, not a target. Two good proposals beat three, and one beats two padded to three.

Each proposal states, and is not composed without all five:

1. **What it is** — a design, not a restatement. See the first rule in Notes.
2. **The evidence behind it, with file paths** (and `bucket/id` where the evidence is a judge note).
3. **The repo it lands in**, as the git remote slug.
4. **A rough size** — the order of magnitude of the work, not an estimate to be held to.
5. **What it would replace or simplify.** An idea that only adds surface has to say that it only adds surface. Stating it is the point; a proposal is allowed to be additive, but not silently.

Two of those five are fields of their own on the entry — the evidence and the repo. The other three are carried by the **rationale**, along with the problem and the mechanism, in the fixed shape below.

<!-- include-block: shared/plain-rationale.md -->
### Write the rationale as plain-language bullets

**An idea's rationale is a list of bullets, never a paragraph.** A person reads it on the dashboard to decide one thing: accept, or reject. That person is usually not the one who ran the survey, and usually has several cards open. A paragraph makes them read prose to find the claim they are deciding on. A fixed list makes two ideas comparable line for line.

Write literal markdown bullets, one `- ` per line, in this order. The first five are required. Write the sixth only when it applies:

1. **What it is** — the design, in one sentence. A mechanism, a shape, a decision.
2. **The problem** — what is wrong now, as a fact about the repo.
3. **How it works** — the mechanism that removes the problem.
4. **What it replaces or simplifies** — or, in those words, that it only adds surface.
5. **Size** — small, medium, or large. This is an order of magnitude, not an estimate.
6. **Depends on `<slug>`** — write this only when the idea consumes something a named idea introduces. Nothing infers this bullet. Its absence states that the idea declares no dependency, which is what `/my-command:improve` schedules on.

Each bullet follows [ASD-STE100](https://asd-ste100.org) Simplified Technical English:

- **One idea per sentence, and at most 20 words.** Split a longer sentence.
- **Active voice, present tense.** Write "the card renders the rationale", not "the rationale would be rendered".
- **One word for one concept.** Reuse the ledger's own noun each time. A synonym reads as a second thing.
- **No idiom, no metaphor, no irony.** Write what the thing does.
- **At most three nouns in a row.** Break a longer group with `of` or `for`.
- **Write an abbreviation out the first time**, or do not use it.
- **An article before each countable noun** — "the store", not "store".
- **No pronoun that points at another bullet.** Each bullet stands alone, because a reader scans the card out of order.

**These rules are stricter than `shared/rewrite-toward.md` on purpose.** That file draws on the same standard and declines its word list, its sentence cap, and its simple tenses, because it governs *command instructions*: an agent executes those, and a long sentence there buys precision. A rationale is a short pitch to a human who is about to click Accept or Reject, so the cap costs nothing and the plain words are the point.
<!-- /include-block -->

Rank them and say what the ranking is on.

**If nothing survives dedupe and the evidence rule, stop and say so.** A run with no proposals is a real answer, not a failure — the same way `/my-command:improve` finding nothing pending is a real answer. Do not lower the evidence bar to have something to show.

## Step 4 — Write every proposal to the ledger as `proposed`

Write **all** of them, including the ones you expect to be rejected. This is the run's only write, and `proposed` is the only status it sets.

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas add --json '[{ … }]'
```

- **Dedupe only works if the ledger records what was considered, not just what was liked.** An idea that never reaches the file can be re-proposed next run with a straight face; that is the whole failure this step prevents.
- Each entry carries its stable kebab-case slug, title, the bulleted rationale in Step 3's shape, evidence with paths, and the repo slug. Status is `proposed`.
- **Write the rationale as literal `- ` lines separated by newlines**, so the dashboard renders it as a list rather than as one run-on line. JSON carries the newlines; do not flatten them into a paragraph to fit the command line. A rationale already on the ledger as a paragraph stays a paragraph — the dashboard still reads it, and nothing here rewrites a row it did not write.
- On tier 2 or 3, append the rows to the markdown ledger in the shape its header defines.
- If `add` refuses a slug, or answers with a non-empty `similarIdeaSlugs`, dedupe missed a collision in Step 1. Say which, and drop that proposal rather than renaming it to get past the refusal — a rename is exactly the near-duplicate the key exists to catch.

**`--dry-run` / `-n` stops here**, having reported the proposals it would write and the tier it would write them to, and having written nothing.

## Step 5 — Exit, and say where the proposals get adjudicated

**The run ends here, with nothing asked.** The proposals are recorded; deciding on them is a human's job, done in claude-proxy's dashboard rather than in this session.

The in-session question existed for one reason: `pnpm --filter server ideas mark` was the only way to reach a status, so a proposing run could not end without a person at a terminal. The dashboard's **Advice page** now carries the ledger as approve/deny cards — `GET /api/ideas` lists them, `/api/ideas/stream` streams them over SSE so a row this run just wrote appears without a reload, and `POST /api/ideas/status` sets `accepted`, `rejected`, or `proposed` (the undo). A person can adjudicate on their own schedule, so blocking a run to wait for them buys nothing.

- **Leave every row at `proposed`, and set no other status.** Do not ask which to accept, and do not decide it yourself — see the boundary above.
- **A `proposed` row is the adjudication queue, not an unanswered question.** It is also what dedupe reads, so an idea sitting there is not re-proposed next run: Step 1 refuses a slug present in any tier in **any** status, `proposed` included.
- **A rejection still carries its reason, written by whoever rejects it.** `POST /api/ideas/status` refuses a `rejected` mark with 400 unless a note comes with it, because that reason is the ledger's dedupe record. Nothing here invents one.
- **Never mark anything `shipped`.** That status carries the PR url and stays CLI-only; this command opens no PR.

Then stop, naming the Advice page as where the accepting happens. `/my-command:improve` may pick an idea up once it is `accepted`, and only then — unchanged. Acceptance is the *permission*, not the trigger: `/my-command:improve` builds an accepted idea only when asked for it by name with `--idea <slug>` (or for all of them with `--ideas`), and each one it builds gets a PR of its own.

Report at the end: the ledger tier used and which tiers were read for dedupe, whether judge notes were available, how many proposals were composed, what collided and with what, that every proposal is recorded as `proposed` and awaits sign-off on the dashboard's Advice page, and that no branch or PR was opened. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Notes

- **Do not restate an Open Question as a proposal.** The question is already written down; the proposal has to add a design — a mechanism, a shape, a decision. "Should we offer a rolling last-10 view?" is not a proposal. "Add a rolling window alongside the fixed one, sharing the rule engine, with the fixed buckets keeping the flag store" is. If the honest answer is that you have nothing to add to the question, that is a run with fewer proposals, not a proposal.
- **Never propose work `/my-command:improve` would find.** If the evidence is a suggestion rule tripping, that belongs to `/my-command:improve` and its source sessions. This command covers what the rules structurally *cannot* see: a missing feature, a missing command, a workflow with no tooling at all. Nothing counts a command that was never written, which is exactly why proposing one needs a different command and a different store.
- **Proposal only.** No branch, no commit, no PR, no `/my-command:task`. An idea that seems obviously right is still an idea, and the sign-off is what makes it advice — which is why this run records it and leaves, rather than accepting it on the human's behalf.
- **The two stores never merge.** `suggestions list` must never return an idea and `ideas list` must never return a suggestion. Two evidence standards, one file each.
- **`--range` narrows one source, not the run.** Only judge notes are bucketed. A report that implies the whole survey was scoped to a range is wrong about three of its four sources.
- **A missing judge layer is an ordinary run.** Working from three sources and saying which one was unavailable is the correct behavior; failing because a CLI verb is absent is not.
- **The slug is the dedupe key, so it has to be stable.** Name the idea, not the run: `rolling-window-view`, not `idea-1` or `august-proposal`.

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Every command leaves through this step, so it is the one place a run nested inside another provably passes on its way out, and the marker is the only record of where it handed control back. Without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close here in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
