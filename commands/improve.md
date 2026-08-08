---
description: Turn claude-proxy's session suggestions and the ideas a human accepted into an implemented improvement — read what the agent keeps doing the slow way, hand it to /my-command:task as criteria, escalate the ones whose last fix didn't hold, and flag what shipped as done
argument-hint: "[--range|-r <spec>] [--regressed|-g] [--idea|-i <slug>[,<slug>...]] [--ideas] [--dry-run|-n] [--here|-h] [--base <branch>] [--draft|-d] [--add|-a <list>] [extra context]"
---

Improve the agentic workflow using evidence instead of intuition. claude-proxy reads every ten recorded sessions and reports what would have reached the same outcome in fewer steps. This command collects those findings, has [judge](judge.md) check them against the raw transcripts, turns the confirmed ones into task criteria, runs `/my-command:task` on them in a subagent per target repo, and records which suggestions were actually applied so the next run doesn't re-propose them. The ideas a human accepted are a second, **opt-in** input: `--idea <slug>` names the ones to build and `--ideas` takes them all, each in a `/my-command:task` run and a PR of its own, and without one of those flags no idea is read.

**A rule firing is not the same as something having gone wrong.** So nothing composed here comes from unjudged rule output: Step 3 judges every dirty bucket in the range first, and criteria are built from **confirmed** suggestions only. A judge run that fails stops the command rather than degrading into the intuition this whole pipeline exists to replace.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; anything left over is extra context that steers which pending suggestions to act on (it narrows the work, it never invents work the suggestions don't support).

**The suggestions are the criteria — and so are the ideas a human accepted.** Every change this run proposes traces back to something somebody else produced: a suggestion with its own evidence and source sessions, or an idea [ideate](ideate.md) proposed and a human signed off on. Do not pad the task with improvements you thought of yourself, and never act on an idea still `proposed` or already `rejected`.

**An accepted idea is read only when this run is asked for it by name.** `--idea <slug>` names the ones to build; the bare `--ideas` takes every accepted idea for the repo. With neither flag the idea track does not run at all — no ledger tier is read, no idea becomes a criterion, and the final report says so rather than leaving the omission to be inferred. A sign-off is standing permission to build something, not a queue that drains itself into whatever run happens next: the suggestion track is driven by sessions that already happened, while an idea is a discrete piece of new work whose timing is a person's call.

**And an idea builds alone.** Each idea-sourced criterion gets its own subagent, its own `/my-command:task`, its own branch and its own PR — one idea, one PR — and is never folded into the suggestion brief for the repo it lands in. The two inputs answer to different evidence standards, so a single PR carrying both can only be reviewed against one of them; separating them also means an idea that turns out to be wrong is reverted on its own, without taking a well-evidenced suggestion fix with it.

**A suggestion whose last fix didn't hold is not a fresh finding.** claude-proxy dates every `done` and reports a suggestion as `regressed` when the rule tripped again across a window recorded entirely after that claim. Those rows get their own track through this command — Step 4's regression block, an escalation ladder that forbids restating the fix that already failed, and a mark in Step 6 that records the attempt chain. Handing a regression to `/my-command:task` as if nobody had tried yet is how the same paragraph gets written into the same file twice.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **Resolve it in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

## Flags

- `--range <spec>` / `-r <spec>` — which session buckets to read. One bucket (`9`), a list (`2,3,9`), a span (`2-9`), or a mix (`2-4,9`). **Default: every bucket.**
- `--regressed` / `-g` — narrow the run to the **regression track only**: suggestions whose rule already shipped a dated fix and tripped again anyway. Fresh findings are not read and not composed. It composes with `--range` (narrow to regressions inside those buckets) and with `--dry-run` (report the regression criteria and stop). Without it, regressions and fresh findings both run, regressions first.
- `--idea <slug>[,<slug>...]` / `-i <slug>` — build the **named** accepted ideas, one PR each. Repeatable and comma-separated; the values are idea slugs, never titles. Each named slug must be on the ledger **and** in `accepted` status — anything else is a stop, not a skip (see Step 2). Without this flag and without `--ideas`, **no ideas are read at all**.
- `--ideas` — the escape hatch: take **every** accepted idea for this repo, with no slug list. Same one-idea-one-PR dispatch as `--idea`; it changes which ideas are selected and nothing else. Give it when you want the whole accepted backlog built and don't want to enumerate it. `--idea` and `--ideas` together is redundant, not an error — the union is every accepted idea, so `--ideas` wins and say so.
- **Both idea flags govern the idea track only.** The suggestion track runs exactly as it always does whether or not either is given, and neither flag narrows, widens, or suppresses it. A run with `--idea` and nothing pending still reports the suggestion side as empty.
- `--dry-run` / `-n` — report the suggestions, the accepted ideas, and the task criteria they compose into, then stop. No subagent, no branch, no PR, and nothing marked in either store. **It still judges** — see Step 3: the criteria are only worth reporting if they came from confirmed findings, and judging records verdicts about transcripts rather than claims that a fix shipped.
- Anything not listed above that `/my-command:task` recognizes is **passed straight through** to every `/my-command:task` invocation in Step 5 — currently `--here` / `-h`, `--base <branch>`, `--draft` / `-d`, and `--add` / `-a <list>`. Read `/my-command:task`'s own Flags section rather than duplicating its list here; this command does not interpret them itself.
- Anything not a recognized flag is extra context.

## Step 1 — Resolve the claude-proxy dependency

<!-- include-block: shared/claude-proxy-checkout.md -->
**This command cannot run without claude-proxy**, and its location is not hardcoded — it comes from the environment, exactly as [revive](revive.md) resolves the transcript store.

- **`CLAUDE_PROXY_STORE` (required)** — the directory the proxy writes session transcripts into. Read it from the environment (`printenv CLAUDE_PROXY_STORE`); never guess a path and never derive one from a repo checkout or clone location.
- Derive the two paths the suggestion tooling needs from it: the **log directory** is its parent (the store is `<logDir>/sessions`), and the **claude-proxy checkout** is the directory above that. Confirm the checkout by looking for its `server/package.json`.
- **If `CLAUDE_PROXY_STORE` is unset, or its path is missing, or the derived checkout has no `server/package.json`, stop.** Say which of the three failed, that this command has no suggestions to read without it, and that it must be exported in the shell environment — e.g. in `~/.zshrc`:

  ```sh
  export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
  ```

  Do not search the filesystem for a claude-proxy checkout yourself, and do not fall back to a hardcoded path.
- **Where a command declares claude-proxy an _optional_ dependency, those three failures mean it is *absent* rather than that the run is over.** Only a command that says so at its own step, and names what it falls back to, may read them that way; anything that does not say otherwise takes the stop above. **An error is still a stop even then.** A store that exists and fails to read or write is not absence — continuing past it writes a second copy of something that already has one, and two stores that each look complete is worse than no store.
<!-- /include-block -->

## Step 2 — Read the pending suggestions and the accepted ideas

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

Suggestions carry a status flag: `pending` by default, `done` once applied, `skipped` when deliberately passed over, and `dismissed` once a judge verdict found the rule had misread the session. **Read only the pending ones** — that is what keeps a later `/my-command:improve` over the same range from re-proposing work that already shipped, and it is also what keeps a dismissed misread from coming back as a fresh finding. `-s pending` already excludes all three.

Run the claude-proxy CLI from the checkout you derived, with `LOG_DIR` pinned to the derived log directory so it reads the same store `CLAUDE_PROXY_STORE` points at:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions list -s pending -d --json          # every bucket
LOG_DIR="<logDir>" pnpm --filter server suggestions list -r 2-9 -s pending -d --json   # with --range
```

- `-s pending` filters to unapplied suggestions, `-d` adds each one's detail, evidence and source sessions, and `--json` gives the shape to parse. **The CLI reads the log directory directly, so no proxy server needs to be running.**
- The equivalent over HTTP, if a server is already up, is `GET $CLAUDE_PROXY_API/api/sessions/suggestions/status?status=pending&detail=1&range=<spec>` (default `http://127.0.0.1:8788`). Prefer the CLI — it has no liveness precondition.
- Each row carries `bucket`, `label`, `id`, `severity`, `title`, and under `-d` its `detail`, `evidence` and `sources`. `meta.missing` lists buckets in the range that don't exist yet.
- If the range names buckets that don't exist, say which and continue with the ones that do. If **nothing** is pending in the range, stop and say so — that is a real answer, not a failure, and there is no task to run.

### The two fields that decide the track

**Status alone can never tell a regression from a fresh finding, because a regressed row is still `pending`.** The flag records what a *person* claimed; `recurrence` records what the *sessions* did afterwards. A rule marked `done` in bucket 38 and tripping again in bucket 41 reads `status: "pending"` on that bucket-41 row — it has no flag of its own — while carrying `recurrence: "regressed"`. Filtering on status and ignoring the rest is how the same fix gets proposed twice.

So the read above is already enough for the default run: **every row it returns carries `recurrence` and, once a claim exists, `resolved`.** Keep both — do not discard them while reshaping rows into criteria.

- `recurrence` is one of `none`, `historical`, `mixed`, `regressed`. Only `regressed` takes the regression track. `mixed` means the window straddles the claim and proves nothing either way, so it stays an ordinary pending finding; `historical` rows are hidden by the CLI's default `list` and are not this command's business.
- `resolved` is the claim the regression broke: `{ bucket, updated, note }` — the bucket the `done` was recorded on, the ISO timestamp of that mark, and whatever note was written with it (usually a PR URL). This is the only pointer to what was already tried.
- `meta.recurrences` totals the states over the rows returned; report the `regressed` count when there is one.

**With `--regressed` / `-g`**, narrow at the CLI instead of filtering afterwards:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions list -s pending --recurrence regressed -d --json
```

`--recurrence` accepts a comma-separated subset of the four states. If `--regressed` was given and nothing is regressed in the range, stop and say so — that is a good outcome, not a failure.

### The accepted ideas are a second input, with a second evidence standard — and they are opt-in

A suggestion is counted from transcripts. An **idea** is invented — [ideate](ideate.md) proposes what is *missing*, which no rule can measure, since nothing counts a command that was never written. What makes an idea actionable is not source sessions but a recorded human sign-off, and `accepted` is that sign-off.

**Do this subsection only when `--idea` or `--ideas` was given.** With neither flag, read no ledger tier, compose no idea criterion, and carry one line to the final report: that no ideas were read because neither flag was given, and that `--idea <slug>` or `--ideas` is how to build them. Do not peek at the ledger "just to report the count" — a run that reads it anyway will end up acting on what it found, which is the behavior these flags exist to end.

When one of them was given, read the ones signed off for this repo:

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas list -s accepted --repo <slug> --json
```

- `<slug>` is the repo's git remote slug (`git remote get-url origin`), never a checkout path — the ideas store is device-wide and shared across every repo on the machine.
- **Resolve the store through the same waterfall `/my-command:ideate` uses**, and read every tier that exists: tier 1 is `<logDir>/ideas.json` through the CLI above, tier 2 the repo's own `docs/ideas.md`, tier 3 `~/.claude/ideas/<repo-slug>.md`. An absent `ideas` CLI means tier 1 is absent, not that the run is over — fall through and say so. A tier that exists and fails to read is a stop.
- **Only `accepted` is read.** A `proposed` idea is invention nobody signed off on, and a `rejected` one is invention that was turned down; reading either would be exactly the padding this command forbids. `shipped` is already done. `--idea` does not relax this: naming a slug selects from the accepted set, it does not admit anything into it.
- **`--range` does not apply.** Ideas are not bucketed, so a narrowed range narrows the suggestions and leaves the accepted ideas alone. Say that in the report rather than implying the whole run was scoped.

#### Selecting the named slugs

**`ideas list` has no `--slug` filter**, so the read above is the whole accepted set for the repo and the selection happens here, in this command, against what it returned.

- **`--ideas`** — take every row the read returned. That is the whole selection; there is nothing to match and nothing that can fail to match.
- **`--idea <slug>[,...]`** — for each named slug, find the row whose slug matches it exactly. Case and punctuation are compared as written; a near-miss is a miss.

**A named slug that does not resolve is a stop, never a silent skip.** Report the slug and *its actual state*, then stop the run before dispatching anything:

- **Not on any ledger tier** — say the slug is unknown, and which tiers were read looking for it. Offer the accepted slugs that *are* on the ledger for this repo, so a typo is one glance from being fixed.
- **On the ledger but not `accepted`** — say the slug and the status it actually holds (`proposed`, `rejected`, or `shipped`), because each means something different and only one of them is fixable here. `proposed` needs a human sign-off on the dashboard's Advice page; `rejected` was turned down and this command does not overturn that; `shipped` already landed and its PR is in the ledger note.

Stopping is the point: a silent skip turns "build these three ideas" into a run that quietly builds two, and the missing one looks identical to one that was never asked for. Stop on the **first** unresolved slug rather than dispatching the resolvable ones first — a partial run is the outcome this rule exists to prevent, and nothing has been dispatched yet at this stage, so stopping here costs nothing.

If nothing is accepted, or the flag selected an empty set, this half of the input is simply empty. That is ordinary, not a failure. A run with no pending suggestions *and* no idea track — because neither flag was given, or because nothing accepted came back — is the "nothing to do" stop in Step 2 above.

## Step 3 — Judge the dirty buckets before composing anything

**A rule firing is not evidence that anything went wrong.** A rule counts calls and node positions; it cannot see what the agent was doing, so it reports a genuine slowdown and a misread with identical confidence. [judge](judge.md) is what tells them apart: it reads the raw transcripts behind each fired suggestion and records **CONFIRMED** with a note written from what the session was actually doing, or **DISMISSED** with the reason the rule misread it.

So the criteria in Step 4 are composed from **judged** suggestions, and this step is what makes them judged. Find the dirty buckets in the range — complete and unjudged — and judge them first:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions buckets --dirty --json          # every bucket
LOG_DIR="<logDir>" pnpm --filter server suggestions buckets --dirty -r 2-9 --json   # with --range
```

- **If nothing in the range is dirty, this step is already done.** Every bucket has verdicts; go straight to Step 4. That is the ordinary case once the history is caught up.
- Otherwise run `/my-command:judge -r <the dirty buckets>` and let it do the reading, the verdicts, and the recording. Do not read transcripts or compose verdicts here — `/my-command:judge` owns that pipeline, and duplicating it produces two sets of verdicts for one bucket.
- Re-read the suggestions after judging, so Step 4 composes from rows that carry their verdicts and notes rather than from the pre-judgement read in Step 2.

### A failed judge run stops the command

**If judging fails on a bucket — the call errored, a bucket recorded fewer verdicts than it had fired suggestions, or `/my-command:judge` reports it could not finish — stop and bring me in.** Say which bucket, what failed, and what is still unjudged.

**Never fall back to composing criteria from unjudged rule output.** That fallback is the one failure mode this whole step exists to prevent: the dirty flag is the record that nobody has checked these findings against reality, and a silent fallback makes a failed judge run indistinguishable from a clean bill of health. A run that proceeds anyway produces a PR that looks exactly like a well-evidenced one and is not.

### Cap the judging at five buckets

**If more than 5 buckets in the range are dirty, stop.** Tell me to narrow `--range`, or to draw a line under the history with an explicit backfill:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions judge --amnesty
```

`/my-command:improve`'s default range is **every bucket**, and the unjudged backlog runs to dozens of buckets — at roughly 55 KB of transcripts per bucket typically and about 180 KB worst case, an uncapped first run sits there reading megabytes of transcript before it composes a single criterion. Name the dirty bucket count and the rough read cost when you stop, so the choice between narrowing and amnesty is an informed one.

**`--dry-run` / `-n` does not skip this step.** Judging is not marking — it records verdicts about transcripts, not claims that a fix shipped — and the criteria a dry run reports are only worth reporting if they came from confirmed findings. A dry run that skipped judging would report exactly the unjudged criteria this step exists to refuse. The cap and the failure stop apply to a dry run unchanged.

## Step 4 — Compose the task criteria

Turn the judged rows into criteria a `/my-command:task` run can implement without going back to the proxy.

### Confirmed suggestions only

- **A dismissed row is excluded entirely.** It is not a criterion, not a weaker criterion, and not a note on someone else's criterion. A dismissal is a verdict that the finding was never true, so there is nothing to fix and nothing to report as deferred.
- **Where a confirmed row carries a judge enrichment note, that note is the criterion's reason.** It was written from the transcripts by an agent that read the nodes the rule pointed at, which makes it better evidence than the rule's generated `detail` — `detail` is arithmetic, the note is what was happening. Keep the `detail` alongside it as the count, but the note is what the criterion argues from.
- Where a confirmed row's note says there was nothing to add beyond the rule's own `detail`, use the `detail`. That is an honest note, not a missing one.

**Split the rows into two tracks first.** A row with `recurrence: "regressed"` goes to the regression track below; everything else composes as an ordinary finding. The regression block leads the brief — a fix that already failed is the more expensive problem, and the subagent should read it before it reads anything else.

### Every criterion, both tracks

1. **Group by what would change.** Several buckets often trip the same rule; that is one improvement with more evidence behind it, not several. Group within a track, never across one — a regressed row and a fresh row for the same rule are two different asks, and merging them loses the instruction not to repeat the prior fix.
2. **Keep the evidence attached.** Each criterion states the behavior to change, the suggestion's own `detail`/`evidence` as the reason, and the `bucket/id` pairs it came from. The subagent has no access to this conversation, so anything unstated is lost.
3. **Say where the change lands.** These suggestions describe how an *agent* works, so the fix is nearly always in instructions — a command in `src/commands/`, an `AGENTS.md` rule, a repo convention — rather than application code. Name the target file when the evidence supports one and say it's undetermined when it doesn't. **Name the repo, too**, not just the path: Step 5 groups by repo, and a bare `AGENTS.md` names a different file in every checkout.
4. **Honor the extra context** as a filter on the pending set: it can narrow which suggestions to act on, and it cannot add criteria the suggestions don't support.
5. **A fix that belongs to a different *checkout* is not out of scope** — Step 5 dispatches it there. Neither is a fix that belongs to claude-proxy's own rule code: that is a defective rule, and the section below gives it a criterion rather than leaving it to circle forever.
6. Report the criteria and the `bucket/id` pairs behind each before going further, with the regression block called out as such.

### The regression track

**Only a `regressed` row enters this track, and a dismissed row never does.** `regressed` means a dated fix did not hold; `dismissed` means the finding was never true in the first place. They are different records with opposite consequences, and conflating them escalates the ladder against a finding nobody ever needed to fix — writing a mechanical gate to prevent something that did not happen. A dismissed row was already excluded above and does not reappear here.

For each `regressed` row, before composing its criterion:

1. **Recover the prior fix.** Read `resolved.note`. When it is a PR URL — it may point at **any** repo, not just the one `/my-command:improve` is running in — read that PR:

   ```sh
   gh pr view <url> --json title,url,files,mergedAt
   gh pr diff <url>
   ```

   Write into the criterion what that PR actually changed: the files it touched and a one-or-two-line summary of the change. **The subagent cannot see this run's reads**, so a prior fix you looked at but did not write down is a prior fix it will unknowingly repeat.
2. **A row with no recoverable prior fix drops to the normal pending track.** If `resolved` is absent, its `note` is empty, or the note is not a resolvable PR URL, there is no original solution to differ from — so there is nothing to escalate against, and the row composes as an ordinary fresh finding. Say in the report that it was regressed but unattributable.
3. **State the rung and require a higher one.** Classify the prior fix on this ladder, by the *mechanism* it used:

   1. **A prose rule** — a paragraph in `AGENTS.md` / `CLAUDE.md` that an agent has to read and remember at the right moment.
   2. **A step in the command** — the behavior is written into the workflow that needs it, so it is triggered by the pipeline rather than recalled.
   3. **A mechanical gate** — a hook, a script, a check in the verify command, a changed tool default: something that fails or fires on its own, with no agent cooperation required.
   4. **Removing the affordance** — the slow path stops existing, so it cannot be taken.

   The criterion names the rung the prior fix sat on (a PR that only edited `AGENTS.md` is rung 1) and requires the new fix to **climb at least one rung**. Restating the prior rule at the same rung is forbidden — including a longer, firmer, better-worded version of it. **This is about mechanism class, not wording.** A rule that was already written down and still not followed does not need to be written down more emphatically; it needs to stop depending on being remembered.
4. **Say what a rung-4 answer would be, even when proposing rung 2 or 3.** If the honest reading is that the rule itself is measuring the wrong thing, the criterion may propose that instead — but it has to say so explicitly rather than quietly implementing nothing.

### Idea-sourced criteria sit alongside the suggestion ones, never inside them

Skip this subsection when no idea flag was given — there are no ideas to compose. Otherwise each selected idea from Step 2 becomes its own criterion, **labelled as idea-sourced**, in a group of its own.

- **Never merge an idea into a suggestion's criterion group.** They argue from different evidence — one from counted sessions, one from a human sign-off — and a merged group can defend itself with only one of them. The subagent has to be able to tell which is which, because the two are answerable to different standards.
- **State the sign-off as the evidence**, since it is: name the idea's slug, its rationale, and the evidence the idea itself cited with paths. The subagent cannot read the ledger, so an idea whose citation you did not write down is an idea it has to take on faith.
- **An idea is a proposal, not a spec.** Where it names a mechanism, pass the mechanism through. Where it does not, say what is undetermined rather than inventing the design here — that invention would be yours, not the human's, and the sign-off does not cover it.
- **One idea is one criterion group, and the grouping stops there.** Do not group two ideas together because they land in the same repo, touch the same file, or sound related — Step 5 dispatches each group separately, so a merged group is a merged PR. Name the repo each idea lands in and its absolute checkout path, exactly as a suggestion criterion does; here the repo tells the subagent *where* to work rather than *what to share a brief with*.
- **Never group an idea with that repo's suggestion brief.** The suggestion track's grouping is by repo and the idea track's is by idea, and the two never meet: an idea that lands in a repo the suggestion track is already touching is still its own group, its own dispatch, and its own PR.

### A defective rule gets a criterion, not a shrug

A rule that keeps firing on things the transcripts don't support is not noise to be dismissed bucket after bucket forever — it is a **defect in claude-proxy's rule code**, and the dismissal record is the evidence for it. Ask for it:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions defects --json
```

When a rule comes back reported defective, **compose it as an ordinary criterion against claude-proxy** — the same shape as every other criterion, just landing in a different checkout:

- **Target** — the claude-proxy checkout derived in Step 1, at `packages/core/src/suggestions.ts`. Name the absolute path, as every criterion does.
- **Evidence** — the buckets the rule was dismissed in and **the dismissal reasons themselves**. Those reasons were written from the transcripts and say exactly what the rule counted versus what was happening; that gap *is* the specification for the fix. A criterion that says "this rule is too noisy" without them is a complaint.
- **The ask** — narrow what the rule matches so the dismissed cases stop firing, without silencing the confirmed ones in the same buckets. Name both sides: a rule that stops reporting a real slowdown is not fixed.

This needs no new dispatch machinery. Step 5 already runs one subagent per repo, and claude-proxy is simply one of those repos.

**This is the exit path a defective rule previously had none of.** Left as "out of scope and still `pending`", a systematically-wrong rule bills attention on every future `/my-command:improve` run and can never be resolved, because nothing in this command was allowed to touch the thing that was actually broken. A suggestion whose fix belongs to claude-proxy's dashboard or recurrence model rather than its rule code still stays `pending` and is reported as out of scope — that part is unchanged, and `defects` is the narrow case with an answer.

**`--dry-run` / `-n` stops here**, having judged the dirty buckets in Step 3 and reported the confirmed suggestions — regression track first, with each prior fix and its rung — the dismissals it excluded, any defective rule it would dispatch, **the accepted ideas it would act on and the tier it read them from**, and the criteria, and having marked nothing in either store. With no idea flag it reports that it read no ideas and why, having read no tier at all; with one, it names each selected slug, the tier it came from, and that each would have opened a PR of its own. An unresolved `--idea` slug stops a dry run exactly as it stops a real one — reporting criteria composed from a slug list that was never valid is the misreport that stop exists to prevent.

## Step 5 — Run the task: one subagent per repo for suggestions, one per idea

The two tracks dispatch on **different units**, and that difference is the whole of the change: a suggestion brief is grouped by repo so each repo gets one coherent PR, while an idea is dispatched alone so it gets a PR of its own. Both tracks use the same `Agent` tool, the same `/my-command:task` invocation shape, and the same pass-through flags exactly as given:

```
/my-command:task <pass-through flags> <the composed criteria for this dispatch>
```

### The suggestion track — one subagent per repo

**Group the suggestion criteria by the repo they land in**, then dispatch **one fresh subagent per repo**, each running `/my-command:task` with that repo's composed criteria.

- **One subagent per repo, not one per suggestion.** The criteria were grouped in Step 4 so each repo gets a single coherent PR. Most runs are one repo and therefore one subagent, exactly as before; more than one is the exception the regression track makes possible.
- **Why more than one repo at all:** the escalation ladder moves work *between* checkouts. A rung-1 prose rule that failed in one repo's `AGENTS.md` is often answered by a rung-2 step in a command that lives in a different repo, or the reverse. Refusing to leave the invoking repo would cap every regression at the rung that already failed.
- The regression block leads each repo's brief, as Step 4 composed it.

### The idea track — one subagent per idea

Dispatch **one fresh subagent per selected idea**, each running `/my-command:task` with that single idea's criterion.

- **One idea, one subagent, one branch, one PR.** Never batch two ideas into one dispatch, even when they land in the same repo — that is the merge this step exists to prevent, and it is invisible afterwards because the resulting PR looks like an ordinary multi-criterion one.
- **Never add an idea to a repo's suggestion dispatch**, and never add a suggestion to an idea's. A repo appearing in both tracks gets a suggestion subagent *and* one subagent per idea landing there; that is the intended shape, not duplication to be tidied away.
- **Say in the brief that the criterion is idea-sourced**, that its evidence is the recorded human sign-off rather than counted sessions, and that this `/my-command:task` run covers this idea alone. The subagent must not widen the scope to neighbouring work it notices, because the sign-off covers the idea and nothing else.
- If a run selected no ideas — no flag, or an empty accepted set — this track dispatches nothing at all.

### Rules both tracks share

- **Name the repo explicitly in each subagent's brief** — its absolute checkout path, and that `/my-command:task` is to run with that path as its working directory. Never let a subagent infer which checkout it should edit; an unnamed repo is edited wherever the subagent happens to start.
- **Run every dispatch one at a time, across both tracks, and read each result before dispatching the next.** This is unchanged and it now spans more subagents than it used to: they open separate PRs, but a later one's criteria may reference what an earlier one actually did, and two `/my-command:task` runs racing in the same checkout is the failure this rule has always prevented. Run the suggestion track first, then the ideas — an idea building on a suggestion fix that just landed is far likelier than the reverse.
- Give each subagent everything it needs to act alone — the source sessions each criterion rests on, for a regression criterion the prior PR, the files it touched, and the rung it must climb past, and for an idea its slug, rationale and cited evidence. It has the criteria and the evidence, not this run's proxy reads.
- `/my-command:task` owns the workspace, the verification, the commits and the PR from here. Do not create a worktree, edit files, or commit in this command — that is `/my-command:task`'s pipeline and duplicating it produces two workspaces for one change.
- When each subagent returns, record what it reports: the repo, the branch, the PR number/URL, and **which criteria it actually implemented** versus dropped. For an idea dispatch, record the PR against **that idea's slug** — Step 6 marks each idea against its own PR, so a PR URL attributed to the wrong slug is a false claim in the ledger.

## Step 6 — Flag what shipped

Mark **only** the suggestions the run actually implemented, one call per bucket, with the PR as the note:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions mark -r <bucket> -i <id>[,<id>...] -s done -n "<PR url>"
```

- A suggestion the subagent dropped, deferred, or couldn't act on stays `pending` — it should come back on the next `/my-command:improve`. Flagging it now is how real work gets lost.
- Use `-s skipped -n "<why>"` only for a suggestion deliberately passed over for a stated reason, so it stops resurfacing without pretending it was applied.
- **Never mark a dismissed suggestion.** `/my-command:judge` already recorded it as `dismissed`, which is a verdict that the finding was false. Marking it `done` claims a fix that does not exist, and marking it `skipped` records a real finding deliberately deferred. Neither is true, and both are dated claims that later sessions get read against.
- If the subagent opened no PR, mark nothing.
- **A criterion whose fix spanned two repos is marked only once every one of those repos has landed a PR.** If one run lands and another doesn't, the suggestion stays `pending`: half a fix is not a fix, and marking it now resets the dated claim on evidence that doesn't support it.

### Marking an idea that shipped

An accepted idea whose criterion actually landed is marked in the **ideas** store, on the same terms:

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas mark --slug <slug> -s shipped -n "<PR url>"
```

- **One call per idea, and the note is that idea's own PR.** Step 5 gave every idea its own dispatch and therefore its own PR, so there is no shared URL to write here: take the PR from the subagent that built *this* slug. Never write one run-wide PR URL across several slugs — the note is the only pointer back to the change, and a slug pointing at a PR that built something else is a false record that reads as a true one, and one that no later run can detect.
- **Only what actually landed.** An idea whose PR did not land stays `accepted` and comes back on the next run — which is the correct outcome, because the sign-off is still valid and the work still is not done. Because each idea has its own PR, one idea failing marks nothing against the others: mark the ones that landed and leave the rest `accepted`, naming them in the report.
- **Only the ideas this run was asked for can be marked**, since they are the only ones it read. A run given no idea flag marks nothing in the ideas store at all.
- **Never mark an idea in the suggestion store, or a suggestion in the ideas store.** Two evidence standards, one file each; a slug is not a `bucket/id` and the stores share nothing.
- Never move an idea back to `proposed` or `rejected` here. This command implements advice; it does not overturn a human's sign-off.

### Marking a suggestion that had already regressed

A regressed suggestion is being fixed for at least the second time, and the note is the only place that history survives — `resolved` keeps just the most recent claim, so the previous PR is overwritten the moment this one is marked.

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions mark -r <bucket> -i <id> -s done \
  -n "attempt 2 (rung 1 → rung 3); <new PR url> supersedes <prior PR url>"
```

- **Mark it `done` as normal.** That is what re-dates the claim, so a *third* failure surfaces as a fresh `regressed` row against this attempt rather than staying pinned to the one that already failed.
- **The note carries the chain:** which attempt this is, the rung it climbed from and to, the new PR, and the prior PR it supersedes. Without it the next `/my-command:improve` can see that a fix failed but not that two already have.

Report at the end: the range read, which buckets were judged and how many suggestions were confirmed versus dismissed, how many suggestions were pending, how many were regressed, **whether the idea track ran at all** — with no `--idea`/`--ideas`, say plainly that no ideas were read and name the flags that read them; with one, how many were selected, from which ledger tier, and by which flag — any defective rule dispatched to claude-proxy, the criteria that shipped, the PR number/URL **for each repo on the suggestion track and for each idea on the idea track, listed separately**, what was marked `done` or `skipped`, which ideas were marked `shipped` and against which PR each, and what stays `pending` or `accepted` with why. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Notes

- **Never invent an improvement.** If the pending set is thin, the run is small. Padding it with your own ideas breaks the trace from every change back to the sessions that justified it.
  - **An `accepted` idea is not an exception to that rule — it is a second way of satisfying it.** The rule is about the *trace*, not about who first thought of something: a suggestion traces to the sessions it was counted in, and an accepted idea traces to the recorded human sign-off that accepted it. Both are evidence somebody else produced, and neither is you deciding mid-run that something would be good. What stays forbidden is unchanged and is the whole of the rule's original force: an idea you thought of during *this* run, an idea still sitting at `proposed`, and an idea a human `rejected` are all invention with no trace, and none of them may become a criterion. If you want one considered, that is [ideate](ideate.md)'s job — propose it there and let it be signed off, rather than smuggling it in here.
- **The idea track is opt-in, and its default is off.** `--idea <slug>` builds the named accepted ideas and `--ideas` builds all of them; with neither, the ledger is not read and the report says so. An accepted idea is a standing permission, not a work queue that drains into whichever run comes next — and a run that swept every accepted idea in automatically made the size of its own PR depend on how many sign-offs had accumulated since last time. The suggestion track is unaffected by both flags and always runs.
- **A named slug that does not resolve stops the run.** Not on the ledger, or on it in any status other than `accepted`, and the stop names the slug and the status it actually holds. Skipping it instead would turn "build these three" into a run that silently built two, and the one that vanished is indistinguishable from one nobody asked for.
- **One idea is one PR.** Each idea-sourced criterion gets its own subagent, its own `/my-command:task` and its own branch, and is never merged into the suggestion brief for the repo it lands in — the two argue from different evidence, so a PR carrying both can only be reviewed against one of them. It is also what lets Step 6 mark each shipped idea against the PR that actually built it.
- **Marking is a claim about reality.** `done` means the change is in the PR the note points at, in every repo that change needed. Mark after the subagents return, never before they run — and a `done` is *dated*, so marking early doesn't just misreport this suggestion, it makes every session recorded afterwards read as evidence against a fix that wasn't there.
- **Never fall back to a guessed claude-proxy path.** An unset `CLAUDE_PROXY_STORE` is a stop with an explanation, not a search.
- The suggestions are recomputed from every transcript on each read, and buckets are fixed windows of ten numbered oldest-first — so a bucket number means the same sessions tomorrow, and the flags survive the recomputation.
- **A suggestion that keeps tripping after being marked `done` is a `regressed` row, and it has a track of its own** — Step 4's regression block and the escalation ladder. Do not treat it as a new finding and do not treat it as noise. There are only two honest readings, and the criterion has to pick one: the fix didn't hold at the rung it was written at, or the rule is measuring something no change to this repo will address. The first escalates a rung; the second is reported as out of scope and left `pending`.
- **`mixed` is not a weak `regressed`.** A window straddling the claim contains pre-fix sessions, so it proves nothing about whether the fix held — `regressed` deliberately waits for a window recorded entirely afterwards. Treating `mixed` as a regression means escalating against evidence that predates the thing being escalated.
- **`dismissed` and `regressed` are not neighbours on a scale.** `regressed` says a fix was tried and did not hold; `dismissed` says there was never anything to fix. A dismissed row leaves the pipeline at Step 4 and never reaches the ladder, because escalating a rung against a finding that was never true builds a mechanical gate to prevent something that did not happen.
- **An unjudged bucket is not a bucket with nothing wrong in it.** The dirty flag records that nobody has checked, and the two states look identical from the outside — which is exactly why a failed judge run stops the command instead of composing anyway.
- **A defective rule now has an exit.** `suggestions defects` is what turns a pattern of dismissals into one criterion against `packages/core/src/suggestions.ts`, so a systematically-wrong rule gets fixed rather than dismissed again on every future run.

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no marker to type: the `- done:` line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close here in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
