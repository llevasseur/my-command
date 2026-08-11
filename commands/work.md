---
description: Build the ideas a human accepted — select them by slug or by area from the hosted ideas ledger, claim each one before any code is written, dispatch one /my-command:task per idea in waves that cannot collide, and mark each shipped idea against its own PR
argument-hint: "[--idea|-i <slug>[,<slug>...]] [--area|-A <area>[,<area>...]] [--repo <slug>] [--max <n>] [--dry-run|-n] [--here|-h] [--base <branch>] [--draft|-d] [--add|-a <list>] [extra context]"
---

Build the ideas a human already signed off on. [ideate](ideate.md) proposes what is *missing*, a human accepts what is worth building, and this command turns each accepted idea into its own `/my-command:task` run, its own branch, and its own PR — claiming it in the ledger first so no second run builds the same thing.

**This command is the ideas half of the old `/my-command:improve`.** [improve](improve.md) is advice only: it reads claude-proxy's session suggestions and never touches the ideas ledger. This command reads the ideas ledger and never reads a suggestion. There is no flag that makes either one do the other's job.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; anything left over is extra context that steers how the selected ideas are built (it narrows the work, it never invents work the ideas don't support).

**The accepted ideas are the criteria.** Every change this run proposes traces back to a recorded human sign-off. Do not pad a brief with improvements you thought of yourself, and never act on an idea still `proposed` or already `rejected` — that is invention with no trace, and the sign-off does not cover it.

**An idea builds alone — but not necessarily one after another.** Each idea gets its own subagent, its own `/my-command:task`, its own branch and its own PR — one idea, one PR. *Alone* is about what a dispatch carries, not about when it runs: ideas whose file scopes do not overlap are dispatched **concurrently** in Step 4, and only ideas that genuinely depend on one another are made to wait.

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

**Selection.** `--idea` and `--area` are the two selectors, and giving both selects the **union** of what each matches, never the intersection. An idea named by `--idea` and also filed under a `--area` area is selected once; the report says which selector brought each slug in.

- `--idea <slug>[,<slug>...]` / `-i <slug>` — build the **named** ideas, one PR each. Repeatable and comma-separated; the values are idea slugs, never titles. Each named slug must be on the ledger **and** available — anything else is a stop, not a skip (see Step 2).
- `--area <area>[,<area>...]` / `-A <area>` — build **every available idea filed under those areas**. Repeatable and comma-separated. Areas are the ledger's own vocabulary — the seeded `ui-ux`, `infrastructure`, `code-quality`, `services` and `commands`, plus any area a `/my-command:ideate` run invented — and `Unfiled` selects the area-less legacy rows. **`ideas list --area` matches exactly one area**, so a comma list is filtered *here*, in this command, against one unnarrowed read; never loop the CLI once per area, which reads the ledger N times and still cannot express `Unfiled`.
- **No selector at all means every available idea for the repo.** That is the default and it is deliberate: the common run is "build the backlog". It is also the only selection `--max` caps, because it is the only one where nobody named the work.

**Scope.**

- `--repo <slug>` — override the repo filter. Defaults to this repo's git remote slug (`git remote get-url origin`). **Never an absolute checkout path** — the ideas ledger is device-wide and shared across every repo on the machine, and a path names a different thing on another machine.
- `--max <n>` — cap how many ideas one run dispatches. **Default 5, and it applies only to a run with no selector.** With no selector and more than `--max` available, **stop**: report the available count, the per-area breakdown, and that `--area`, `--idea`, or an explicit `--max` narrows it. An explicit selector means a person named the work, so `--idea` is never capped — building four of the five slugs somebody listed is the silent partial run this command refuses everywhere else.
- `--dry-run` / `-n` — report the selection, each idea's file scope and stated dependencies, and the dispatch schedule Step 4 would use, then stop. No claim, no subagent, no branch, no PR, and nothing marked.
- Anything not listed above that `/my-command:task` recognizes is **passed straight through** to every `/my-command:task` invocation in Step 4 — currently `--here` / `-h`, `--base <branch>`, `--draft` / `-d`, and `--add` / `-a <list>`. Read `/my-command:task`'s own Flags section rather than duplicating its list here; this command does not interpret them itself, except that `--here` forces serial dispatch (Step 4).
- Anything not a recognized flag is extra context.

## Step 1 — Resolve the ledger and the claude-proxy checkout

Two things have to resolve before anything is read: **where the ledger lives**, and **where the CLI that talks to it lives**. They are separate facts and they fail separately.

### The ledger is hosted, and there is no local fallback

The ideas ledger is a hosted store behind claude-proxy's `operator` Worker. **A device that cannot reach it does no ideas work** — it does not fall back to a file, and this command has no tier list to walk. That is by design: a local fallback would keep a second, divergent, complete-looking ledger that no other device or run can see, which is worse than refusing. See `docs/adrs/0006-host-the-ideas-ledger.md` in claude-proxy.

- **`IDEAS_TOKEN` (required)** — the bearer token for the Worker. **`CONCEPTS_TOKEN` is accepted as a fallback**, since ideas and concepts are one dataset behind one Worker and one token.
- **`IDEAS_URL` (required)** — the Worker's address. **`CONCEPTS_URL` is accepted as a fallback**, for the same reason.
- Probe the address with `printenv IDEAS_URL || true`, then `printenv CONCEPTS_URL || true`. **Never run `printenv IDEAS_TOKEN` or `printenv CONCEPTS_TOKEN`** — that prints the token into the transcript. Check only that one of them is set, without echoing it.
- **If neither address resolves, or neither token is set, stop, and name both variables.** Say that the ledger is hosted, that this command has no local copy to read by design, and that they must be exported in the shell environment — e.g. in `~/.zshrc`:

  ```sh
  export IDEAS_URL="https://<your-operator-worker>"
  export IDEAS_TOKEN="<the operator token>"
  ```

  Do not search the filesystem for an `ideas.json`, and do not fall back to a repo's `docs/ideas.md` or `~/.claude/ideas/`. Those paths are not a degraded ledger; they are a different, private one.

### The CLI still runs out of the claude-proxy checkout

The `ideas` CLI is a script in claude-proxy, so the checkout has to resolve as well — the hosted store changed where the data lives, not where the command lives.

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

### The `ideas` verbs take no `LOG_DIR`, and MCP reaches the same rows without a checkout

**These verbs take no `LOG_DIR`** — that variable pointed at the file the ledger used to be, and the hosted store is reached with `IDEAS_URL`/`IDEAS_TOKEN` instead. `LOG_DIR` still belongs on the `suggestions` verbs, which do read the proxy's logs, so passing it to an `ideas` verb pins nothing and only suggests a local file is still involved.

Every operation this command performs is also an MCP tool, against the same hosted rows: **`ideas_list`** (pass `available: true` for the buildable set), **`ideas_claim`**, and **`ideas_mark`**. That is what an agent in a cloud box with no claude-proxy checkout should use — it needs no `pnpm`, no `server` package, and no repository on disk. It is the same ledger either way, so a run that claims over MCP holds the claim a run on a laptop sees. **Reaching it over MCP is the one path that survives a failed checkout resolution above**; a missing `IDEAS_URL`/`IDEAS_TOKEN` is still a stop, because that is the ledger itself rather than the road to it.

## Step 2 — Select the ideas

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

Read the ideas that are signed off **and free to build** for this repo, once, unnarrowed by area:

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas list --available --repo <slug> --json
```

- `<slug>` is the repo's git remote slug (`git remote get-url origin`), or whatever `--repo` overrode it with. Never a checkout path.
- **`--available` is the read, and it replaces `-s accepted` rather than sitting beside it.** It returns `accepted` plus the ideas whose claim has expired, which is exactly the set a run may take. `-s accepted` alone can never recover an idea that a run picked up and then died holding, because that entry now reads `claimed` and no sweeper will ever put it back; `-s accepted,claimed` overcorrects and hands you one out from under a run that is still building it. `--available` is the one query that draws that line.
- **This does not loosen the sign-off rule, and a later reader must not "fix" it back.** Every row `--available` returns was `accepted` at some point — `claimed` is only reachable *from* `accepted`, so nothing without a human sign-off can appear in it. What changed is that an abandoned idea comes back rather than staying stuck.
- **Nothing else is read.** A `proposed` idea is invention nobody signed off on, and a `rejected` one is invention that was turned down. `shipped` is already done, and a `claimed` idea with a live claim belongs to another run. `--idea` does not relax this: naming a slug selects from the available set, it does not admit anything into it.
- **`--area` is not passed to this read.** The CLI matches exactly one area, this command may have been given several, and `Unfiled` is not an area the CLI can filter on at all. One unnarrowed read is also what makes the "area does not exist" stop below possible — a narrowed read cannot tell an empty area from a misspelled one.

### Selecting against what the read returned

**`ideas list` has no `--slug` filter**, so the read above is the whole available set for the repo and every selection happens here, against what it returned.

- **No selector** — take every row. Then apply `--max`: if the count exceeds it, **stop** and report the available count, the breakdown by area (with `Unfiled` counted as its own bucket), and that `--area <area>`, `--idea <slug>`, or an explicit `--max <n>` narrows the run. Nothing has been claimed at this point, so stopping costs nothing.
- **`--idea <slug>[,...]`** — for each named slug, find the row whose slug matches it exactly. Case and punctuation are compared as written; a near-miss is a miss.
- **`--area <area>[,...]`** — take every row whose area is in the list. `Unfiled` matches the rows with no area set.
- **Both** — the union of the two, deduplicated by slug.

### A named slug that does not resolve is a stop, never a silent skip

Report the slug and *its actual state*, then stop the run before dispatching anything:

- **Not on the ledger** — say the slug is unknown. Offer the available slugs that *are* on the ledger for this repo, so a typo is one glance from being fixed.
- **On the ledger but not available** — say the slug and the status it actually holds (`proposed`, `rejected`, or `shipped`), because each means something different and only one of them is fixable here. `proposed` needs a human sign-off on the dashboard's Advice page; `rejected` was turned down and this command does not overturn that; `shipped` already landed and its PR is in the ledger note.
- **On the ledger and `claimed` by a live holder** — this is the one case that is a **skip with a named holder, not a stop**. Say the slug, who holds it, and since when, and that another run is building it right now. Nothing is wrong: the claim expires, or the run holding it releases it, and the slug becomes available again. Do not build it anyway, and do not go looking for a way around the holder.

Stopping is the point: a silent skip turns "build these three ideas" into a run that quietly builds two, and the missing one looks identical to one that was never asked for. Stop on the **first** unresolved slug rather than dispatching the resolvable ones first.

### An area that does not exist is a stop too

**An `--area` naming an area nothing is filed under stops the run**, and it stops for a reason that is easy to miss: a misspelled area selects nothing and looks *identical* to an area with no available ideas. Without this stop a run given `--area ui-ex` would quietly select zero ideas, dispatch nothing, and report success.

- Decide existence against the **areas that exist on the ledger for this repo**, not against the seed vocabulary — the vocabulary is free text and a `/my-command:ideate` run may have invented the area you were handed. Read the areas off the unnarrowed set, and count `Unfiled` as an area that exists whenever any area-less row does.
- When one stops the run, report **every area that does exist, with its available count**, so the intended one is one glance away.
- **An area that exists but has nothing available is not a stop.** That is an honest empty selection: say the area was matched and had no available ideas, and carry on with whatever the other selectors brought in.

If the whole selection comes back empty — nothing available for the repo at all — that is ordinary, not a failure. Say so and stop; there is nothing to claim and nothing to dispatch.

## Step 3 — Compose each idea's brief

Every selected idea becomes one criterion group of its own. **One idea is one group, and the grouping stops there** — do not group two ideas because they land in the same repo, touch the same file, or sound related. Step 4 dispatches each group separately, so a merged group is a merged PR.

### Take the brief from the ledger, do not re-derive it

**Compose each idea's brief with the CLI rather than assembling it yourself:**

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas prompt --slug <slug>
```

`ideaTaskPrompt` in claude-proxy's `packages/core/src/ideas.ts` already assembles the title, the rationale in `/my-command:ideate`'s fixed bullet order, every citation, the claim lines, and — the part hand-assembly always loses — the human's `comment`, quoted verbatim as **build criteria that override the rationale where the two disagree**. Re-deriving a brief per subagent is how two briefs for one idea drift apart, and reading `comment` is the only way a signer's build instruction reaches the subagent at all.

- **Pass the prompt through as the body of the brief.** Do not paraphrase it, trim it, or reorder its bullets.
- **An idea is a proposal, not a spec.** Where it names a mechanism, the mechanism passes through. Where it does not, say what is undetermined rather than inventing the design here — that invention would be yours, not the human's, and the sign-off does not cover it.
- **Say in the brief that the criterion is idea-sourced**, that its evidence is the recorded human sign-off, and that this `/my-command:task` run covers this idea alone. The subagent must not widen the scope to neighbouring work it notices.

### What this command adds around the prompt

Two things are facts about **this run's schedule** rather than about the idea, so they are composed here and not read from the ledger: the **lane** (Step 4) and the **base branch** (Step 4). Name the repo each idea lands in and its absolute checkout path alongside them.

### Record each idea's file scope and its stated dependencies

Step 4 schedules the dispatches against each other, and it can only do that from what this step writes down. So every idea carries two more fields, decided here rather than left to the dispatching turn:

- **File scope** — the paths this idea is expected to create or change, as concretely as the idea supports: exact files where it names them, a directory or glob where it names an area, and *undetermined* where it names neither. Derive it from the idea's own rationale and cited evidence, and from a read of the target repo where that resolves an area to real paths. **An undetermined scope is not an empty one** — it is the widest scope there is, so an idea whose scope you could not pin down conflicts with everything in its repo and is scheduled alone.
- **Stated dependencies** — whether this idea's own rationale says it consumes something another selected idea introduces: design tokens, a control primitive, a shared component, an API or CLI surface, a config key. Name the idea it depends on. **Only a dependency the idea itself states counts**; a dependency you inferred because two ideas sound related is a guess, and the sign-off does not cover your guess about sequencing any more than it covers your guess about design.

Two ideas in **different repos** never conflict, whatever their paths look like — scope comparison is per repo, and identical relative paths in two checkouts are two different files.

**`--dry-run` / `-n` stops here.** Report the selected slugs and which selector brought each one in, each idea's file scope and stated dependencies, and the dispatch schedule Step 4 would use — which ideas would go out concurrently, which would wait, and on which branch each dependent one would be based. Report the ideas it *would* have claimed; a dry run claims nothing, because a claim is a write.

## Step 4 — Schedule, claim, and dispatch

Dispatch **one fresh subagent per selected idea**, each running `/my-command:task` with that single idea's brief and the pass-through flags exactly as given:

```
/my-command:task <pass-through flags> <the composed brief for this idea>
```

**Ideas that do not conflict go out concurrently**, in a single turn carrying one `Agent` call each; ideas that genuinely depend on one another run in order, the dependent one branching off the branch it depends on. One idea is still one branch and one PR either way — parallelism changes *when* a dispatch starts, never what it carries.

Serializing every idea is the thing this replaces. Two ideas touching disjoint files have no reason to wait for each other, and making them wait pays a full `/my-command:task` run — worktree, bootstrap, implement, verify, PR — before the second one starts.

### Deciding whether two ideas conflict

There are exactly **two** things that make one idea wait for another, and both were written down in Step 3:

1. **Their file scopes overlap**, within the same repo. Same file, or one's glob or directory containing the other's paths. An **undetermined** scope overlaps everything in its repo. Different repos never overlap.
2. **One states a dependency on the other** in its own rationale — it consumes design tokens, a control primitive, a shared component, an API or CLI surface that the other introduces. The value has to exist before the consumer can reference it, so the consumer waits even when the two touch no file in common.

Anything else is independent and goes out concurrently. In particular, landing in the same repo is not a conflict, sounding related is not a conflict, and being proposed by the same `/my-command:ideate` run is not a conflict.

**A clean textual merge is not evidence of independence, so never schedule on one.** Git merges lines, not meaning: an idea that references a token, prop, or endpoint another idea introduces merges without a single conflict marker and then fails at build or run time, because the thing it names does not exist on its base. The dependency check above is what catches that, and it is a claim about the ideas' content rather than about their diffs — which is why it is read out of the rationale rather than probed with `git merge-tree`.

**Where the two rules disagree, the stricter one wins.** An overlap with no stated dependency still serializes, because two branches editing one file is a merge conflict waiting for a human; a stated dependency with no overlap still serializes, for the reason above.

### Scheduling the dispatches

- **Group the selected ideas into waves.** A wave is a set of ideas that conflict with nothing else in that wave and with nothing still unfinished; dispatch a whole wave in **one turn, one `Agent` call per idea**, and read every result before opening the next wave. Most runs are a single wave.
- **A dependent idea branches off the branch it depends on, not off `main`.** Pass the base explicitly in its brief — `/my-command:task --base <the branch it depends on>` — and dispatch it only after that branch actually exists and the run it came from has returned. Basing it on `main` and hoping the merge is clean is precisely the failure the previous rule describes.
- **Say so in the PR's own terms too:** a stacked idea's brief states which branch it is built on and that its PR is to target that branch, so a reviewer sees the stack rather than a diff full of changes the base already made.
- **Give every concurrent subagent an explicit lane.** The brief names the paths that idea **owns** and may write, and the paths it **must not touch** — the scopes of every other idea in flight, named as such. A subagent that finds it needs a file outside its lane stops and reports that rather than taking it; the lane is what makes two live branches unable to collide, and a subagent silently widening its scope is the collision arriving anyway.
- **A serialized dispatch gets a lane as well.** It is the cheapest place to state that the idea it was stacked on already owns those paths, and it keeps a later reader from concluding that lanes are a parallel-only device.
- **With `--here` in the pass-through flags, dispatch one at a time regardless of scope.** What makes same-repo concurrency safe at all is that `/my-command:task` cuts a **fresh worktree per run**, so two concurrent ideas in one repo are two working trees, not one. `--here` removes exactly that: it tells `/my-command:task` to work in the current checkout in place, so two dispatches carrying it would edit one working tree on one branch. The scopes may be disjoint while the checkout is not. Say in the report that the flag forced serial dispatch.
- **When it is not clear, serialize.** An idea whose scope is undetermined, or whose rationale reads as though it might consume another's work without saying so, is dispatched alone and after. The cost of an unnecessary wait is one run's latency; the cost of a wrong parallel is two branches whose merge order changes what the code does.

### Claim the idea before the subagent starts

**Claim it first, then dispatch — for every idea, however it is scheduled.** The claim goes in before any code is written — not when the PR opens, which is what the ledger used to record and what let two runs build the same idea eleven minutes apart, one of them closed unmerged. Parallel dispatch does not relax this by a single step: claim **every** idea in a wave before that wave goes out, one `claim` call per slug, and dispatch only the ones whose claim succeeded. Concurrency makes the claim matter more, not less — a wave dispatched first and claimed afterwards is exactly the window the protocol closes, widened to the size of the wave. Decide the branch name for this dispatch, claim under it, and only then dispatch:

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas claim --slug <slug> --by <branch> --json
```

- **`--by` is the branch name this dispatch is about to cut**, in `/my-command:task`'s own `<type>/<kebab-summary>` shape, derived from the idea slug. Decide it here rather than letting the subagent derive its own, and put it in the brief so the subagent cuts *that* branch — the holder string has to name a branch that actually comes to exist.
- **The branch name is the point, not a formality.** It is the one holder string a second run can check on its own: `git branch -r` either shows that branch or it does not, so a second run can tell a claim backed by real work from a claim left by a run that vanished, without asking anybody. A run id or a person's name tells that second run nothing — it can see the idea is held and has no way to find out whether the work still exists.
- **A refusal means someone else has it. Skip that idea and say so.** `claim` refuses any entry that is not takeable and reports the status, plus `heldBy`, `since`, and `pr` when a live claim is what blocked it. **A claim held by someone else exits non-zero**, so read the exit status rather than the output: **a zero exit is the permission to build and anything else is not**, and treating a non-zero exit as one is how the claim gets bypassed by a run that never noticed it failed. The store spans every device, so the holder may be a run on a machine this one has never talked to — there is nothing local to double-check the refusal against and nothing to double-check it with. Move to the next idea — dispatch the rest of the wave without it — and name the skip in the final report with the holder and since-when. **A refused claim also drops whatever was stacked on it**: an idea that was to branch off the refused one has no base to build on, so it is skipped too and reported as blocked by that skip, never re-based onto `main` to keep it moving. Never build it anyway, and never retry under a different `--by` — a second holder string does not make the idea free, it just hides the collision the claim was there to surface.
- **Only `accepted` (or a stale or already-yours `claimed`) can be claimed at all**, so a claim can never route around a human sign-off. That check lives in the ledger, not here.

### Dispatch, then attach the PR to the claim

- **One idea, one subagent, one branch, one PR.** Never batch two ideas into one dispatch, even when they land in the same repo, and **especially not because they were found independent** — independence is what lets them run *side by side*, and folding them into one dispatch to save a subagent is the merge this step exists to prevent. It is invisible afterwards, because the resulting PR looks like an ordinary multi-criterion one.
- **Re-claim with the PR the moment the subagent returns one**, as the same `--by`:

  ```sh
  LOG_DIR="<logDir>" pnpm --filter server ideas claim --slug <slug> --by <branch> --pr "<PR url>" --json
  ```

  `claim` is idempotent for the same holder, so this attaches the PR rather than fighting the claim you already hold. It matters because a claim carrying a `pr` never goes stale: the six-hour expiry is sized to **writing** the change, while the long part of an idea's life is review, so a PR sitting in review for a day would otherwise expire its own claim and invite a second run to build what is already built.
- **Name the repo explicitly in each subagent's brief** — its absolute checkout path, and that `/my-command:task` is to run with that path as its working directory. Never let a subagent infer which checkout it should edit.
- **Read every result in a wave before opening the next**, and treat one subagent's failure as information for the wave after it rather than a reason to abandon the ones already running.
- Give each subagent everything it needs to act alone — the ledger prompt, its lane, its branch name, and the base to branch from when that is not the default. A concurrently-dispatched subagent cannot see the others at all, so anything about the ideas beside it that it needs to respect has to be written into its own brief.
- `/my-command:task` owns the workspace, the verification, the commits and the PR from here. Do not create a worktree, edit files, or commit in this command — that is `/my-command:task`'s pipeline and duplicating it produces two workspaces for one change.
- When each subagent returns, record the PR against **that idea's slug**. Step 5 marks each idea against its own PR, so a PR URL attributed to the wrong slug is a false claim in the ledger.

## Step 5 — Flag what shipped

An accepted idea whose brief actually landed is marked in the ideas ledger:

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas mark --slug <slug> -s shipped -n "<PR url>"
```

- **One call per idea, and the note is that idea's own PR.** Step 4 gave every idea its own dispatch and therefore its own PR, so there is no shared URL to write here: take the PR from the subagent that built *this* slug. Never write one run-wide PR URL across several slugs — the note is the only pointer back to the change, and a slug pointing at a PR that built something else is a false record that reads as a true one, and one that no later run can detect.
- **Only what actually landed.** An idea whose PR did not land stays `accepted` and comes back on the next run — which is the correct outcome, because the sign-off is still valid and the work still is not done. Because each idea has its own PR, one idea failing marks nothing against the others: mark the ones that landed and leave the rest `accepted`, naming them in the report.
- **Only the ideas this run selected can be marked**, since they are the only ones it read.
- **Never mark an idea in the suggestions store, or a suggestion in this one.** Two evidence standards, one store each; a slug is not a `bucket/id` and the stores share nothing. The suggestions store belongs to [improve](improve.md).
- Never move an idea back to `proposed` or `rejected` here. This command implements a sign-off; it does not overturn one.
- **`shipped` keeps the claim, and that is deliberate** — it becomes the record of which branch built the thing, beside the PR in the note. Every other mark drops the claim, which is what makes `-s accepted` the release below.

Report at the end: how many ideas were selected and by which selector each came in on (`--idea`, `--area` and which area, or the no-selector default); the **dispatch schedule that was actually used** — which ideas went out concurrently, which waited, on which branch each stacked idea was based, and the reason for every serialization (scope overlap, a stated dependency, an undetermined scope, or `--here`); the PR number/URL for each idea, listed separately; which ideas were marked `shipped` and against which PR each; and what stays `accepted` with why.

**Say what happened to each claim**: which slugs this run claimed and under which branch, which it skipped because another run held them — with the holder and since-when — which were dropped because the idea they stacked on was skipped, and which it released on the way out. A skipped idea and an idea nobody selected look identical in a report that only counts what shipped, and the first one is coming back on the next run. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Notes

- **Never invent an idea.** An idea you thought of during *this* run, an idea still sitting at `proposed`, and an idea a human `rejected` are all invention with no trace, and none of them may become a criterion. If you want one considered, that is [ideate](ideate.md)'s job — propose it there and let it be signed off.
- **The ledger is hosted and has no local fallback.** A device without `IDEAS_URL`/`IDEAS_TOKEN` (or `CONCEPTS_URL`/`CONCEPTS_TOKEN`) does no ideas work at all. It does not read a repo's `docs/ideas.md`, a `~/.claude/ideas/` file, or a `logs/ideas.json` — a private copy that looks complete is the failure the hosted store was built to remove.
- **A named slug that does not resolve stops the run.** Not on the ledger, or on it in a status the run may not take, and the stop names the slug and the status it actually holds. A slug held by a **live claim** is the exception: it is a skip with a named holder, because nothing is wrong and the answer is to wait rather than to fix anything.
- **A misspelled area is indistinguishable from an empty one, which is why it stops.** An area that exists and has nothing available is an honest empty selection and carries on.
- **`--max` caps only the run nobody narrowed.** A selector means a person named the work, and truncating a named list is the silent partial run every other rule here exists to prevent.
- **The claim is what stops two runs building one idea, and it only works if it goes in first.** `accepted` used to be the status an implementing run looked for right up until its PR existed, so two runs reading the ledger minutes apart both saw the same idea as free and both built it. `claimed` closes that window from the front — stamped before any code is written, carrying the branch as its holder, expiring after six hours so a dead run cannot park an idea forever, and pinned open by a `pr` once one exists because review outlasts the expiry.
- **One idea is one PR.** Each idea gets its own subagent, its own `/my-command:task` and its own branch. It is also what lets Step 5 mark each shipped idea against the PR that actually built it. **Running two of them at once does not weaken this**: parallel dispatch changes when a subagent starts, not what its brief carries, and two ideas found independent are the *least* excusable pair to merge into one dispatch.
- **Independence is decided from scope and stated dependencies, never from a trial merge.** A clean textual merge proves neither: a stacked idea merges without a marker and then references a token, prop, or endpoint that does not exist on its base, so the break shows up at build time rather than in the diff. When it is unclear, serialize.
- **A lane is what keeps two live branches apart.** Every concurrently-dispatched subagent is told the paths it owns and the paths it must not touch, because it cannot see the others and will otherwise widen its scope in perfectly good faith.
- **The brief comes from `ideas prompt`, not from your own reading of the row.** It carries the human's `comment` as build criteria that override the rationale, and that is the one part of an idea a person wrote *as an instruction to the builder*.
- **This command never reads a suggestion.** [improve](improve.md) owns the suggestions store, the judge precondition, and the regression ladder. There is no flag here that reaches them.

## Close the run in a text-only turn

**Release every claim this run is still holding, in the same turn as the run's last piece of real work.** An idea this run claimed and did not ship is released explicitly rather than left to expire:

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas mark --slug <slug> -s accepted
```

- **A mark to anything but `shipped` drops the claim**, which is what makes this the release rather than a status change with a side effect.
- **It belongs here because every exit routes here.** The run that gives up, is refused, hits a failing gate, or is abandoned as wrong all arrive at this step, and each one is a run holding an idea it is not going to build. Hooking the release to the closing turn is what makes it happen on the exits nobody plans for, rather than only on the tidy one.
- **The alternative is a six-hour hole.** Without the release the idea sits `claimed` until the TTL expires, and every `/my-command:work` in that window reads it as taken and skips it — the work is not blocked by anything real, only by a claim whose holder went away.
- **Release what did not ship, not what did.** An idea that landed a PR was already re-claimed with that PR and then marked `shipped`; releasing it would throw away the record of who built it. If the PR opened but the run stopped before marking, leave the claim alone — it carries the PR, so it will not expire, and the next run can see the work exists.

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
