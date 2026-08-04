---
description: Turn claude-proxy's session suggestions into an implemented improvement — read what the agent keeps doing the slow way, hand it to /task as criteria, escalate the ones whose last fix didn't hold, and flag the suggestions that shipped as done
argument-hint: "[--range|-r <spec>] [--regressed|-g] [--dry-run|-n] [--here|-h] [--base <branch>] [--draft|-d] [--add|-a <list>] [extra context]"
---

Improve the agentic workflow using evidence instead of intuition. claude-proxy reads every ten recorded sessions and reports what would have reached the same outcome in fewer steps. This command collects those findings, turns the pending ones into task criteria, runs `/task` on them in a subagent per target repo, and records which suggestions were actually applied so the next run doesn't re-propose them.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; anything left over is extra context that steers which pending suggestions to act on (it narrows the work, it never invents work the suggestions don't support).

**The suggestions are the criteria.** Every change this run proposes traces back to a suggestion with its own evidence and its own source sessions. Do not pad the task with improvements you thought of yourself.

**A suggestion whose last fix didn't hold is not a fresh finding.** claude-proxy dates every `done` and reports a suggestion as `regressed` when the rule tripped again across a window recorded entirely after that claim. Those rows get their own track through this command — Step 3's regression block, an escalation ladder that forbids restating the fix that already failed, and a mark in Step 5 that records the attempt chain. Handing a regression to `/task` as if nobody had tried yet is how the same paragraph gets written into the same file twice.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed. **Then close it out:** "until it is the only item left" is the trigger to resolve it, not a reason to leave it open forever — once it is the last item and the work is done, mark it completed with the run's **final tool call**, and send the text-only message after that call returns. Both constraints hold at once that way: the task list ends clean and the closing message still carries zero tool calls. Never hand back with the anchor still open — a finished run reads as abandoned in the job list.<!-- /include -->

## Flags

- `--range <spec>` / `-r <spec>` — which session buckets to read. One bucket (`9`), a list (`2,3,9`), a span (`2-9`), or a mix (`2-4,9`). **Default: every bucket.**
- `--regressed` / `-g` — narrow the run to the **regression track only**: suggestions whose rule already shipped a dated fix and tripped again anyway. Fresh findings are not read and not composed. It composes with `--range` (narrow to regressions inside those buckets) and with `--dry-run` (report the regression criteria and stop). Without it, regressions and fresh findings both run, regressions first.
- `--dry-run` / `-n` — report the pending suggestions and the task criteria they compose into, then stop. No subagent, no branch, no PR, and nothing marked.
- Anything not listed above that `/task` recognizes is **passed straight through** to every `/task` invocation in Step 4 — currently `--here` / `-h`, `--base <branch>`, `--draft` / `-d`, and `--add` / `-a <list>`. Read `/task`'s own Flags section rather than duplicating its list here; this command does not interpret them itself.
- Anything not a recognized flag is extra context.

## Step 1 — Resolve the claude-proxy dependency

**This command cannot run without claude-proxy**, and its location is not hardcoded — it comes from the environment, exactly as [revive](revive.md) resolves the transcript store.

- **`CLAUDE_PROXY_STORE` (required)** — the directory the proxy writes session transcripts into. Read it from the environment (`printenv CLAUDE_PROXY_STORE`); never guess a path and never derive one from a repo checkout or clone location.
- Derive the two paths the suggestion tooling needs from it: the **log directory** is its parent (the store is `<logDir>/sessions`), and the **claude-proxy checkout** is the directory above that. Confirm the checkout by looking for its `server/package.json`.
- **If `CLAUDE_PROXY_STORE` is unset, or its path is missing, or the derived checkout has no `server/package.json`, stop.** Say which of the three failed, that `/improve` has no suggestions to read without it, and that it must be exported in the shell environment — e.g. in `~/.zshrc`:

  ```sh
  export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
  ```

  Do not search the filesystem for a claude-proxy checkout yourself, and do not fall back to a hardcoded path.

## Step 2 — Read the pending suggestions

Suggestions carry a status flag: `pending` by default, `done` once applied, `skipped` when deliberately passed over. **Read only the pending ones** — that is what keeps a later `/improve` over the same range from re-proposing work that already shipped.

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

## Step 3 — Compose the task criteria

Turn the pending rows into criteria a `/task` run can implement without going back to the proxy.

**Split the rows into two tracks first.** A row with `recurrence: "regressed"` goes to the regression track below; everything else composes as an ordinary finding. The regression block leads the brief — a fix that already failed is the more expensive problem, and the subagent should read it before it reads anything else.

### Every criterion, both tracks

1. **Group by what would change.** Several buckets often trip the same rule; that is one improvement with more evidence behind it, not several. Group within a track, never across one — a regressed row and a fresh row for the same rule are two different asks, and merging them loses the instruction not to repeat the prior fix.
2. **Keep the evidence attached.** Each criterion states the behavior to change, the suggestion's own `detail`/`evidence` as the reason, and the `bucket/id` pairs it came from. The subagent has no access to this conversation, so anything unstated is lost.
3. **Say where the change lands.** These suggestions describe how an *agent* works, so the fix is nearly always in instructions — a command in `src/commands/`, an `AGENTS.md` rule, a repo convention — rather than application code. Name the target file when the evidence supports one and say it's undetermined when it doesn't. **Name the repo, too**, not just the path: Step 4 groups by repo, and a bare `AGENTS.md` names a different file in every checkout.
4. **Honor the extra context** as a filter on the pending set: it can narrow which suggestions to act on, and it cannot add criteria the suggestions don't support.
5. **Drop what no instruction change can reach.** A suggestion whose fix belongs to claude-proxy's own *code* — the rule that produced it, the dashboard, the recurrence model — stays `pending` and is reported as out of scope; do not mark it `done`. A fix that belongs to a different *checkout* is no longer out of scope: Step 4 dispatches it there.
6. Report the criteria and the `bucket/id` pairs behind each before going further, with the regression block called out as such.

### The regression track

For each `regressed` row, before composing its criterion:

1. **Recover the prior fix.** Read `resolved.note`. When it is a PR URL — it may point at **any** repo, not just the one `/improve` is running in — read that PR:

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

**`--dry-run` / `-n` stops here**, having reported the pending suggestions — regression track first, with each prior fix and its rung — and the criteria, and having marked nothing.

## Step 4 — Run the task, one subagent per repo

**Group the criteria by the repo they land in**, then dispatch **one fresh subagent per repo** via the `Agent` tool, each running `/task` with the composed criteria for that repo and the pass-through flags exactly as given:

```
/task <pass-through flags> <composed criteria for that repo>
```

- **One subagent per repo, not one per suggestion.** The criteria were grouped in Step 3 so each repo gets a single coherent PR. Most runs are one repo and therefore one subagent, exactly as before; more than one is the exception the regression track makes possible.
- **Why more than one repo at all:** the escalation ladder moves work *between* checkouts. A rung-1 prose rule that failed in one repo's `AGENTS.md` is often answered by a rung-2 step in a command that lives in a different repo, or the reverse. Refusing to leave the invoking repo would cap every regression at the rung that already failed.
- **Name the repo explicitly in each subagent's brief** — its absolute checkout path, and that `/task` is to run with that path as its working directory. Never let a subagent infer which checkout it should edit; an unnamed repo is edited wherever the subagent happens to start.
- **Run them one at a time and read each result before dispatching the next.** They open separate PRs in separate repos, but a later one's criteria may reference what an earlier one actually did.
- Give each subagent everything it needs to act alone — the source sessions each criterion rests on, and for a regression criterion the prior PR, the files it touched, and the rung it must climb past. It has the criteria and the evidence, not this run's proxy reads.
- `/task` owns the workspace, the verification, the commits and the PR from here. Do not create a worktree, edit files, or commit in this command — that is `/task`'s pipeline and duplicating it produces two workspaces for one change.
- When each subagent returns, record what it reports: the repo, the branch, the PR number/URL, and **which criteria it actually implemented** versus dropped. That distinction is what Step 5 writes down.

## Step 5 — Flag what shipped

Mark **only** the suggestions the run actually implemented, one call per bucket, with the PR as the note:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions mark -r <bucket> -i <id>[,<id>...] -s done -n "<PR url>"
```

- A suggestion the subagent dropped, deferred, or couldn't act on stays `pending` — it should come back on the next `/improve`. Flagging it now is how real work gets lost.
- Use `-s skipped -n "<why>"` only for a suggestion deliberately passed over for a stated reason, so it stops resurfacing without pretending it was applied.
- If the subagent opened no PR, mark nothing.
- **A criterion whose fix spanned two repos is marked only once every one of those repos has landed a PR.** If one run lands and another doesn't, the suggestion stays `pending`: half a fix is not a fix, and marking it now resets the dated claim on evidence that doesn't support it.

### Marking a suggestion that had already regressed

A regressed suggestion is being fixed for at least the second time, and the note is the only place that history survives — `resolved` keeps just the most recent claim, so the previous PR is overwritten the moment this one is marked.

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions mark -r <bucket> -i <id> -s done \
  -n "attempt 2 (rung 1 → rung 3); <new PR url> supersedes <prior PR url>"
```

- **Mark it `done` as normal.** That is what re-dates the claim, so a *third* failure surfaces as a fresh `regressed` row against this attempt rather than staying pinned to the one that already failed.
- **The note carries the chain:** which attempt this is, the rung it climbed from and to, the new PR, and the prior PR it supersedes. Without it the next `/improve` can see that a fix failed but not that two already have.

Report at the end: the range read, how many suggestions were pending, how many were regressed, the criteria that shipped, the PR number/URL for each repo, what was marked `done` or `skipped`, and what stays `pending` with why. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Notes

- **Never invent an improvement.** If the pending set is thin, the run is small. Padding it with your own ideas breaks the trace from every change back to the sessions that justified it.
- **Marking is a claim about reality.** `done` means the change is in the PR the note points at, in every repo that change needed. Mark after the subagents return, never before they run — and a `done` is *dated*, so marking early doesn't just misreport this suggestion, it makes every session recorded afterwards read as evidence against a fix that wasn't there.
- **Never fall back to a guessed claude-proxy path.** An unset `CLAUDE_PROXY_STORE` is a stop with an explanation, not a search.
- The suggestions are recomputed from every transcript on each read, and buckets are fixed windows of ten numbered oldest-first — so a bucket number means the same sessions tomorrow, and the flags survive the recomputation.
- **A suggestion that keeps tripping after being marked `done` is a `regressed` row, and it has a track of its own** — Step 3's regression block and the escalation ladder. Do not treat it as a new finding and do not treat it as noise. There are only two honest readings, and the criterion has to pick one: the fix didn't hold at the rung it was written at, or the rule is measuring something no change to this repo will address. The first escalates a rung; the second is reported as out of scope and left `pending`.
- **`mixed` is not a weak `regressed`.** A window straddling the claim contains pre-fix sessions, so it proves nothing about whether the fix held — `regressed` deliberately waits for a window recorded entirely afterwards. Treating `mixed` as a regression means escalating against evidence that predates the thing being escalated.

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor item as the last tool call.** The todo item that held this turn open is the one thing still owed once the work lands: mark it completed, let that call return, then send the message. It is the natural final call, and it keeps the closing message free of tool calls exactly as this step requires. Handing back with it still open makes a finished run read as abandoned.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
