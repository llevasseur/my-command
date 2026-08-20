<h1 align="center">MyCommand</h1>

<p align="center"><strong>Your Wish is My Command.</strong></p>

<p align="center">
  A bundle of Claude Code commands and Codex Skills for carrying tasks from idea
  to a merged pull request and keeping long sessions focused.
</p>

---

## What's inside

| Command | What it does |
| :------ | :----------- |
| `task` | Take a task from plain-language criteria to an open PR: isolated branch/worktree, bootstrap, implement, verify, then clean + PR. |
| `god` | Take a task all the way to **merged**: `task` with `review` woven in, `mc` on conflict, wait for CI, merge the PR into `main`, pull `main`. No human in the loop. |
| `fb` | Implement a feedback request. Thin wrapper around `task` — current branch by default, or a worktree of an existing branch with `--target`. |
| `review` | Independently review an open PR against the codebase, then apply its findings via `fb`. Spawns a fresh reviewer by default; `--here` reviews directly in the current agent. |
| `pr` | Create/update the PR for the current branch with a concise bulleted description, written straight to GitHub. |
| `clean` | Clean up comments across a branch's changes — lean and to the point, comments only, never code. |
| `mc` | Merge each branch's own PR base into it (or one branch), resolve every conflict, and push. Stacked PRs get their real base, not `main`. |
| `merge-deps` | Batch-merge open non-draft Dependabot PRs into `main` — resolve each with `/mc`, verify in a worktree, merge, and clean up. |
| `task-bootstrap` | One-time per repo: interview the stack and generate that repo's own `scripts/bootstrap-worktree.sh` so `task` can bootstrap fresh worktrees. |
| `sync` | Update this device's installed commands to the latest version from GitHub. |
| `changelog` | Add a concise entry to the current repo's `CHANGELOG.md`, matching its existing format. |
| `docs` | Reconcile a repo's [okq](https://github.com/mikevalstar/okq) doc bundle with the code, then truncate dirty docs to high-signal prose in the same `/task` run. |
| `truncate` | Cut a doc bundle down to high-signal tokens without losing a claim — standalone density cleanup for hand edits, explicit scopes, and full sweeps, with surviving prose rewritten toward a stated vocabulary standard. |
| `revive` | Resume an interrupted session from its recorded transcript — reconstruct what it was doing, recover its branch/worktree, finish only what's outstanding, and complete the original workflow. |
| `improve` | Turn claude-proxy's session suggestions into an implemented improvement — read the pending findings for a range of session buckets, have `judge` check them against the transcripts, escalate the ones whose last fix didn't hold, hand the confirmed ones to `task` as criteria, and flag what shipped as done. **Advice only**: it never reads the ideas ledger. |
| `work` | Build the ideas a human accepted — select them by slug (`--idea`) or by area (`--area`, or every available idea with no selector) from the hosted ideas ledger, **claim each one before any code is written**, dispatch one downstream run per idea — `task` by default, `god` under `--delegate god` to drive each idea all the way to merged — in waves that cannot collide, and mark each shipped idea against **its own PR**. |
| `ideate` | Propose what's worth **building**, not what's slow — survey a repo through evidence a person already wrote down (open questions, judge notes, the CHANGELOG, written deferrals, plus a locator-less command gap where the area is `commands`), file every proposal under the **area** it belongs to, **open a user-interface proposal in the browser and confirm or kill it against the running page** (calling the design and performance skills where they fit), record them all in a ledger as `proposed`, and exit pointing at the dashboard's Advice page, where a sign-off turns the accepted ones into advice `work` acts on. Proposal only: no branch, no PR, and no question asked. |
| `manage` | Orchestrate one multi-part goal across the **existing** commands — decompose it into 3–8 units, assign each its own branch, and delegate every unit to its own subagent in waves that cannot collide, then synthesize one report. Implements nothing itself: `task` (the default delegate) still owns branch → implement → verify → PR. `work on <area>[, <area>...]` decomposes named areas into one managed `work` unit each. |
| `wayfinder` | Run a named campaign of related work as **markdown plans in the repo**, with no issue tracker — cut one base branch, keep one map of active tasks, hand each ticket to `task` off that base, and append a summary to the map as each lands. Only the planning PR at start and the campaign PR at close target the default branch; every ticket PR targets the campaign base. |
| `dev` | Take one complex idea all the way to **merged, unattended** — grill it against the repo's okq specs and ADRs with **one long-lived griller** (one question at a time, every later round a message to that same agent), **record every decision it could not ground as a real ADR** carrying `decided-by: /dev`, `ratified: false` and, for a human's call, `needs-human: true`, then chart it with `wayfinder`, build the tickets in waves through `manage`, and land the campaign PR with `god`. Composes those commands and reimplements none of them; never blocks and never asks, so the campaign PR **leads with the decisions a human still owes**. |
| `judge` | Decide whether claude-proxy's suggestions are true — read the raw transcripts behind each fired suggestion, confirm the ones the sessions support with context written from the transcript, dismiss the ones the rule misread, and record both verdicts per bucket. `improve`'s precondition. |
| `trim` | Decide whether the current conversation is safe to compact, then provide focused instructions for Claude Code's built-in `/compact`. |
| `cp` | Compose another command's invocation from a prompt and copy it to the clipboard, ready to paste into another agent — without running it or printing it. Every copy is also stashed under `~/.claude`, so `--again` puts it back after a later copy clobbers it. |
| `teach` | Learn the real name for something you can only describe — one question at a time, until you can say it back as a single Simplified Technical English sentence, printed and copied. |
| `lookup` | Read the hosted concept store **before** a term is named — a read-only gate answering **term hit** (the stored sentence, verbatim, then stop), **field hit** (neighbours as naming context), or **miss** (the only outcome that authorizes a `teach`). |
| `learn` | Lease a public skill for one task and give it back — look the concept up, install the skill that concept already surfaced, use it, and remove it on the way out. A skill you already had is never removed, and the install is counted on the concept record `teach` writes rather than on a counter of its own. |
| `read-tweet` | Read a public X/Twitter post through a **reader proxy** — a forward proxy that fetches the URL from its own address and returns readability-extracted text — falling through an ordered list of prefixes whenever one answers with a bot check or a login wall. Never solves a captcha, and never hands a private or signed URL to a proxy operator. |
| `diagram` | Draw the architecture a change **produces** as one Mermaid diagram and attach it to that change's PR — an open PR's body, a comment, or a file. Opens no PR and touches no code; composes into `task` with `--add`. |
| `health` | Report what is actually consuming this machine's CPU, memory, and energy, ranked **by owner rather than by process** — a per-process table puts system noise on top and buries the finding. Two tables and a fix list; read-only unless `--fix` is passed, and even then it re-measures before every signal and never stops a supervised service, closes unsaved work, or takes root. |

## Use cases

Each command parses **leading flags off the front**; everything after them is the
free-text criteria (task, feedback, etc.). The examples below focus on how the
parameters change what happens. In Codex, use the same names and flags with
skill syntax—for example, `$task -h ...`, `$review -t 42`, or `$mc -t feat/search`.

| Command | Example | What the parameters do |
| :------ | :------ | :--------------------- |
| `task` | `/task add a dark-mode toggle to settings` | Default — fresh worktree off `main`, implement, then `/clean` + `/pr` **inline**; no subagent is spawned. |
| `task` | `/task -h fix the typo in the footer` | `--here` / `-h` — work on the **current branch**, no worktree. |
| `task` | `/task --base release/2.0 backport the auth fix` | `--base <branch>` — branch off `release/2.0` instead of `main`. |
| `task` | `/task -d wire up the metrics endpoint` | `--draft` / `-d` — open the resulting PR as a **draft**. |
| `task` | `/task -s add a dark-mode toggle to settings` | `--sub` / `-s` — run the `/clean` + `/pr` stage in **one fresh subagent** instead of inline. Same commands and order; a fresh context for the pair. |
| `task` | `/task -a changelog note this once it works add retry logic to the fetch client` | `--add` / `-a <command> <prompt>` — weave `/changelog` into the run per its prompt, then implement the task. Separate multiple added commands with a comma before each next command. |
| `god` | `/god add a dark-mode toggle to settings` | Default — the whole `/task` pipeline with `/review` woven in, then `/mc` if `main` moved, wait for CI, `gh pr merge --squash`, and pull the new `main`. Merges without asking. |
| `god` | `/god --auto ship the retry backoff` | `--auto` — don't wait on CI; enable GitHub auto-merge and finish. `--merge`/`--rebase` change the method, `--fix <n>` sets the red-CI repair budget (default 1), `--no-review` skips the woven-in `/review`. |
| `god` | `/god -h fix the typo in the footer` | `--here` / `-h`, `--base <branch>`, and `--add` / `-a` pass straight through to `/task`. `--sub` is always added to that invocation — the woven-in `/review` needs the subagent to land in. `--draft` / `-d` is rejected — a draft can't merge. |
| `god` | `/god --base release/2.0 --into release/2.0 backport the auth fix` | `--into <branch>` — merge into `release/2.0` instead of `main`, and pull `release/2.0` at the end. It is the **merge target** and is **never inherited from `--base`**, which only says where the branch was cut, so a run that wants both states both. Without `--into` the merge target stays `main`. Under it the conflict test runs against `<branch>` and the PR is retargeted with `gh pr edit --base <branch>` before merging. |
| `fb` | `/fb tighten the copy on the empty state` | Default — apply the feedback on the **current branch** (via `/task --here`). |
| `fb` | `/fb -t feat/checkout-redesign use the brand blue for the CTA` | `--target` / `-t <branch>` — apply the feedback onto **existing** branch `feat/checkout-redesign` in a fresh worktree. |
| `review` | `/review` | Default — review the current branch's open PR in a fresh worktree with a new agent, then apply its findings via `/fb`, run **inline** rather than in another agent. |
| `review` | `/review -h` | `--here` / `-h` — the current agent reviews the current branch's PR directly: no worktree and no spawned reviewer. Use when already running in a fresh review agent. |
| `review` | `/review -t 42` | `--target` / `-t <PR-number-or-branch>` — review PR #42 (or a named branch) instead of the current branch's PR. |
| `mc` | `/mc` | Default — for **every** open PR, merge that PR's own base branch into its head, resolve conflicts, push. |
| `mc` | `/mc -h` | `--here` / `-h` — only the **current branch**. |
| `mc` | `/mc -t feat/search` | `--target` / `-t <branch>` — only the named branch `feat/search`, merged in an **isolated worktree** so the current checkout is never touched. |
| `merge-deps` | `/merge-deps` | Default — merge every open non-draft `dependencies`-labeled PR into `main`, one by one (`/mc` first, verify, `gh pr merge --squash`, clean the worktree). |
| `merge-deps` | `/merge-deps --auto -n` | `--auto` enables GitHub auto-merge instead of waiting on CI; `--dry-run` / `-n` just lists the PRs. `--label <name>` narrows the filter, `--merge`/`--rebase` change the method. |
| `docs` | `/docs` | Default — audit every doc for staleness, add missing docs, prune obsolete docs, then truncate the resulting dirty queue without losing claims. Runs both phases in one `/task`: fresh worktree off `main`, then `/clean` + `/pr`. |
| `docs` | `/docs -h` | `--here` / `-h` — reconcile on the **current branch**, no worktree (passed through to `/task`). |
| `docs` | `/docs --base release/2.0` | `--base <branch>` — worktree branched off `release/2.0` instead of `main` (passed through to `/task`). |
| `docs` | `/docs -n` | `--dry-run` / `-n` — report stale / missing / obsolete docs and the projected density queue, then change nothing. No worktree, commit, or PR. |
| `docs` | `/docs -r features/pr` | Pass flags (`--refresh` / `-r`, `--add` / `-a`, `--prune` / `-p`) narrow reconciliation; trailing text scopes it. The final density phase still clears the resulting dirty queue. `--bundle` picks the bundle; `--yes` also skips the 40% cut guard. |
| `truncate` | `/truncate` | Default — tighten every doc marked `dirty: true`, preserving every claim, then clear the flag. Use independently after hand edits or an interrupted queue; it runs via its own `/task`. |
| `truncate` | `/truncate -A` | `--all` / `-A` — evaluate the **whole bundle**, not just the dirty docs. For a bulk import or a bundle's first pass. |
| `truncate` | `/truncate -n` | `--dry-run` / `-n` — report the queue and the proposed cuts, change nothing. No worktree, commit, or PR. |
| `truncate` | `/truncate features/task` | Trailing text scopes the run to a concept id, path/glob, or topic, **overriding** the dirty filter. `--bundle` / `-b <dir>` picks the bundle, `--yes` / `-y` skips the 40%-cut confirmation, `--here` / `-h` and `--base <branch>` pass through to `/task`. |
| `revive` | `/revive 59da5fc97e6b9465` | Default — resolve the id in claude-proxy's transcript store (`$CLAUDE_PROXY_STORE`), recover the branch/worktree the session was in, finish what's outstanding, then complete its workflow (usually `/clean` + `/pr`). |
| `revive` | `/revive -n 59da5fc97e6b9465` | `--dry-run` / `-n` — report where the session stopped and what remains; change nothing. |
| `revive` | `/revive --source cli 70c65b5b-ceda-4764-89f0-d68f1db6fff6` | `--source proxy` (default), `cli`, or a `<path>` — pick the transcript store; a 36-char UUID is a CLI session id, a 16-hex id a proxy thread id. |
| `improve` | `/improve` | Default — read **every** session bucket's pending suggestions from claude-proxy (`$CLAUDE_PROXY_STORE`), compose them into criteria (regressions first), run `/task` on them in a subagent per target repo, then mark what shipped as `done`. **No ideas are read**: that is `work`'s job. |
| `improve` | `/improve -r 2-9` | `--range` / `-r <spec>` — only those buckets. One (`9`), a list (`2,3,9`), a span (`2-9`), or a mix (`2-4,9`). |
| `improve` | `/improve -g` | `--regressed` / `-g` — only rules whose dated fix already failed. Reads the prior fix back from its PR and requires the new one to climb the escalation ladder rather than restate it. |
| `improve` | `/improve -n -r 9` | `--dry-run` / `-n` — report the pending suggestions and the criteria they compose into; no subagent, no PR, nothing marked. It still judges. |
| `improve` | `/improve -d -r 9 only the serial-discovery findings` | `--here` / `-h`, `--base <branch>`, `--draft` / `-d`, `--add` / `-a` pass straight through to `/task`; trailing text narrows which pending suggestions to act on. |
| `work` | `/work` | Default — **no selector means every available idea for the repo**, capped at `--max` (default 5). Over the cap it stops and reports the count and the per-area breakdown rather than dispatching. |
| `work` | `/work -i worktree-reaper` | `--idea` / `-i <slug>[,<slug>...]` — build the **named** ideas, one PR each. Repeatable and comma-separated; values are slugs, never titles. A slug that isn't on the ledger, or isn't available, **stops the run** naming its actual status — never a silent skip. An explicit selector is never truncated by `--max`. |
| `work` | `/work -A ui-ux,commands` | `--area` / `-A <area>[,<area>...]` — every available idea filed under those areas, `Unfiled` for the area-less legacy rows. Given with `--idea` the selection is the **union**. An area that doesn't exist is a stop, reported with the areas that do and their counts; an area with nothing available is an honest empty selection. |
| `work` | `/work --repo llevasseur/claude-proxy --max 3` | `--repo <slug>` overrides the repo filter (a **remote slug**, never a checkout path — the ledger is device-wide); `--max <n>` caps a no-selector run. |
| `work` | `/work -n` | `--dry-run` / `-n` — report the selection, each idea's file scope and stated dependencies, and the dispatch schedule; claim nothing, dispatch nothing, mark nothing. |
| `work` | `/work -d -A ui-ux` | `--here` / `-h`, `--base <branch>`, `--draft` / `-d`, `--add` / `-a` pass straight through to `/task`; `--here` additionally **forces serial dispatch**, since concurrency depends on `/task` cutting a worktree per run. |
| `work` | `/work -D god --into main -A commands` | `--delegate` / `-D <task\|god>` picks the **downstream command** each accepted idea is dispatched to — `task` (default) stops at an open PR, `god` drives that PR green and **merges it without asking**, so it must be typed and is never inherited. `--into <branch>` is the merge target forwarded to each `/god`, dropped and reported under the default delegate. `--draft` with `-D god` is a **stop** — a draft can't merge. |
| `manage` | `/manage add rate limiting, a metrics endpoint, and docs for both` | Default — decompose the goal into 3–8 units, name a branch per unit, batch the independent ones into one parallel fan-out, and delegate each to `/task` in its own subagent. Never branches, commits, or merges itself. |
| `manage` | `/manage -n <goal>` | `--dry-run` / `-n` — print the routing plan (units, waves, dependencies, branch names, each unit's cut point **and** its merge target as two separate fields, the forwarded flags it carries and the ones dropped for it, delegate) and spawn nothing. No task list, no subagent, no branch. |
| `manage` | `/manage -D god -p 5 <goal>` | `--delegate` / `-D <task\|god\|fb>` picks the delegate — `god` merges each unit's PR **without asking**, so it must be typed; `fb` **cannot cut a branch**, so an `fb` unit runs as `/fb --target <existing branch named by the goal>` and a goal that can't name one is a stop. `--parallel` / `-p <n>` caps concurrency (default 3, hard cap 8). `--sequential` forces one at a time. |
| `manage` | `/manage work on ui-ux, commands, infrastructure` | The **`work` unit type** — the comma-separated list is the areas, one unit per area, each dispatched as `/work --area <area>` in the same collision-free waves. A `work` unit cuts **no branch of its own** (`/work` names one per idea when it claims it) and is planned around its **area**, which is also its lane: every idea is filed under exactly one area, so two units select disjoint ideas. Its file scope is undetermined at plan time, so two adjacent areas yield two PRs to reconcile — `--sequential` is the escape hatch. `--delegate work` with a goal naming areas means the same thing. |
| `manage` | `/manage -D work:god --into main work on ui-ux, commands` | `work:god` puts **every downstream run inside each unit** in god command mode (`/work --delegate god`), so each accepted idea is driven all the way to merged. It is the most multiplying form here — areas × ideas, and the count isn't known until the ledger is read — so like `-D god` it must be typed. `--into` is kept for `work:god` (dropped for a plain `work` unit) and `--draft` is a stop for both. |
| `wayfinder` | `/wayfinder start the auth revamp` | Cut `wayfinder/auth-revamp` from the default branch, write the map at `<plans>/wayfinder-auth-revamp.md` with its kickoff prompt and first plans, and open the **planning PR** so the tickets land before any ticket branch is cut. |
| `wayfinder` | `/wayfinder add task migrate the session store` | Write one plan beside the map and add its row to Active tasks. No branch, no PR. |
| `wayfinder` | `/wayfinder execute the next task` | Runs `/task --base wayfinder/<slug>` against the plan's criteria, then **retargets** the resulting PR to the campaign base. `--here` / `-h`, `--base <branch>`, `--draft` / `-d`, `--add` / `-a` apply **only here** and forward to the ticket runner verbatim; the charting operations ignore them. |
| `wayfinder` | `/wayfinder complete task 02` | After that ticket's PR merges into the base: delete its plan, append what was *actually built* to the map's Completed log, and drop its Active tasks row. |
| `wayfinder` | `/wayfinder close` | One **campaign PR** from the base branch to the default branch; after it merges, retire the map and every plan and delete the base branch. Merges nothing itself. |
| `wayfinder` | `/wayfinder --unattended execute the next task` | Same operations, no human in the loop: tickets run through `/god --base wayfinder/<slug> --into wayfinder/<slug>` instead of `/task` — the campaign base named twice, as cut point and as merge target, since absent `--into` a ticket would merge into the default branch — and the planning, ticket, and campaign merges are authorised. **Must be typed on the invocation that acts and is never inherited** — not from the map, its kickoff prompt, an invoking command, or an earlier operation — because a campaign multiplies whatever it authorises. Without it, every PR is left open for review, unchanged. |
| `dev` | `/dev <complex idea>` | The whole pipeline, unattended: grill the idea against `docs/specs/` and `docs/adrs/` (12 rounds, one question at a time, **one** griller kept alive across rounds), write an ADR for every decision it made itself, `/wayfinder start` → planning PR merged with `/god --into <default>`, tickets dispatched through `/manage` as `/wayfinder --unattended execute NN` in **waves bounded by file-scope lanes and `/manage`'s cap of 8**, each landing via `/god --base wayfinder/<slug> --into wayfinder/<slug>`, then `/wayfinder close` and one final `/god --into <default>`. |
| `dev` | `/dev --sequential --rounds 4 -n <idea>` | `--sequential` — one ticket at a time instead of waves. `--parallel` / `-p <n>` caps concurrency below the lanes. `--rounds <n>` replaces the grill's 12-round cap; `--no-grill` skips the grill. `--dry-run` / `-n` grills, prints the campaign and the ADRs it would write, and stops — no branch, no PR, nothing dispatched. `--slug <s>` names the campaign. |
| `dev` | `/dev --resume <slug>` | Resume a campaign the bounded failure round left alive: read the surviving map, skip completed tickets, re-dispatch the outstanding ones, close. **Resume is always explicit** — `/dev <idea>` always starts a new campaign and never infers a match with an existing map. |
| `manage` | `/manage --mesh <goal>` | `--mesh` — opt the workers into peer messaging. Off by default: it costs ~2.4–2.7x the tokens of the fan-out and buys nothing when each worker runs a self-contained command in its own worktree. |
| `manage` | `/manage -d --base release/2.0 <goal>` | Anything `/task` recognizes and `/manage` doesn't own — `--here` / `-h`, `--base <branch>`, `--draft` / `-d`, `--sub` / `-s`, `--add` / `-a` — **forwards to every `task` and `god` unit** and is printed in the plan before anything spawns. A flag the resolved delegate can't parse is **dropped and reported**, never passed anyway and never folded into the criteria: `/fb` takes `--target` alone, so an `fb` unit carries none of them, and `--draft` under `-D god` is a stop (a draft can't merge). `--base` sets the **root** base only — a stacked unit keeps the branch it depends on, except under `-D god`, where that branch is merged and deleted before the stacked unit is dispatched, so it is cut from the run's merge target instead — and `--here` forces `--sequential`, collapsing the run to one branch and one PR (it ignores `--base`, but **not** `--into`). |
| `manage` | `/manage -D god --base release/2.0 --into release/2.0 <goal>` | `--into <branch>` — the **merge target** every `god` unit's PR merges into, owned here rather than forwarded from `/task`, which does not document it (it stops at an open PR and merges nothing), so it is dropped and reported for a `task` or `fb` unit. Unlike `--base`, which is the **cut point** and is inherited by a stacked unit from the unit it depends on, `--into` is **uniform across every unit and never inherited down a stack**: `/god` merges each unit's PR and deletes its remote branch, so a stacked unit's dependency branch is already gone by the time that unit merges. The plan prints cut point and merge target as separate fields — cut points fan out down the stack, merge targets all read the same. |
| `ideate` | `/ideate` | Default — survey the repo through all five evidence sources, compose at most 3 ranked proposals, file **each one under the area it belongs to**, write them all to the ledger as `proposed`, then **exit**, naming the dashboard's Advice page as where they get accepted or rejected. Unattended: no question, no branch, no PR. |
| `ideate` | `/ideate --area ui-ux` | A user-interface proposal is **checked in the browser before it is filed** — Step 3.5 opens the running page read-only, confirms the problem into the entry's `note`, kills the proposal if the page already does the thing, or reports the check as unavailable. It may call one of `emil-design-eng`, `apple-design`, `animation-vocabulary`, or `web-perf` per proposal. The check never becomes a citation. |
| `ideate` | `/ideate --area commands` | `--area <area>` — survey for that one kebab-case area and file every proposal under it. Spelled exactly as the ledger spells it, no short alias. It narrows the survey only: the dedupe read is always the whole ledger. |
| `ideate` | `/ideate -r 2-9` | `--range` / `-r <spec>` — the bucket window for **judge notes only**. The other four sources (open questions, CHANGELOG, written deferrals, command gaps) aren't bucketed and aren't narrowed. |
| `ideate` | `/ideate -n` | `--dry-run` / `-n` — report the proposals and write **nothing at all**, not even the `proposed` rows. Still reads every ledger tier for dedupe. |
| `judge` | `/judge -r 40-42` | `--range` / `-r <spec>` — judge the **dirty** buckets in that range: read the raw transcripts behind each fired suggestion, return CONFIRMED with a note written from what the agent was doing or DISMISSED with the reason the rule misread it, and record both in one call per bucket. Never touches a partial or already-judged bucket. |
| `judge` | `/judge` | Default — every bucket. It judges only the dirty ones, and names the bucket count and rough read cost before starting, since a large backlog is a megabyte-scale backfill. |
| `judge` | `/judge -n -r 41` | `--dry-run` / `-n` — report the dirty buckets, the suggestions in each, and the transcripts it would read; record nothing. |
| `trim` | `/trim` | Evaluate six evidence-backed safety gates; recommend continuing or emit a tailored `/compact` command. |
| `cp` | `/cp task add a dark-mode toggle to settings` | Default — shape the prompt to stand alone for an agent that can't see this conversation, copy `/task add a dark-mode toggle to settings` to the clipboard, and reply `Done!`. The named command is never run, loaded, or printed. |
| `cp` | `/cp -v review 42` | `--verbatim` / `-v` — copy the prompt exactly as typed, no shaping. |
| `cp` | `/cp --again` | `--again` / `-a` — restore the last copy from `~/.claude/cp-last.txt` to the clipboard. No composing, no reading, no tokens spent on the text. A trailing slot number reaches an older ring entry (`/cp --again 2` → `cp-last.2.txt`, five deep). |
| `teach` | `/teach the thing where scroll goes past the end and springs back` | Default — name the technique from a matching glossary skill, ask one question at a time until you can say it back, then print **and** copy one ≤25-word Simplified Technical English sentence. Reads no files. |
| `teach` | `/teach -h the bouncy thing our modal does` | `--here` / `-h` — read the current repo so the sentence can name the real component and the pattern already in use. |
| `lookup` | `/lookup -f "UI motion" rubber-banding` | `--field` / `-f <field>` scopes the neighbours returned on a field hit; `--limit` / `-l <n>` caps how many are listed (default 10). Trailing text is the term or description. Read-only: it never writes to the store. |
| `learn` | `/learn -f "UI motion" add a rubber-banding scroll to the list` | Default — `/lookup` the concept, lease the skill it surfaced, use it, then **remove it** at the exit and count the install on the concept record. `--field` / `-f <field>` scopes the lookup and the search; trailing text is the task and the lookup query. |
| `learn` | `/learn -c rubber-banding -s emilkowalski/skills@animation-vocabulary -k make the list bounce` | `--concept` / `-c <term>` looks that term up instead of the task text; `--skill` / `-s <pkg@skill>` leases a named package and skips discovery; `--keep` / `-k` leaves the skill installed. `--dry-run` / `-n` reports the concept, the skill, and the lease and changes nothing. |
| `read-tweet` | `/read-tweet https://x.com/user/status/123` | Only parameter is the post URL (`twitter.com` is normalized to `x.com`). Fetches through the first reader proxy that answers with the post — `https://r.jina.ai/<url>` verified working 2026-08-15, `xcancel.com` returned a bot check — and reports the handle, the text verbatim, the date, and which prefix worked. |
| `diagram` | `/diagram` | Default — diagram the current branch's open PR and update the `<!-- diagram:start -->` block in its body. A re-run replaces that block; the rest of the body is untouched. With no PR yet, the block is handed back unattached rather than a PR being opened. |
| `diagram` | `/diagram -t 42 the ingest path` | `--target` / `-t <PR-number-or-branch>` — diagram PR #42 instead of the current branch's. Trailing text is a focus hint naming the layer or flow to draw. |
| `diagram` | `/diagram -k sequence -c` | `--kind` / `-k <flowchart\|sequence\|class\|er\|state>` forces the diagram type; `--comment` / `-c` posts a PR comment instead of editing the body. `--out` / `-o <path>` writes to a Markdown file, `--dry-run` / `-n` renders it in the reply and changes nothing. |
| `task` | `/task -a diagram once the PR is open, diagram the new ingest path add a bulk ingest endpoint` | `--add` / `-a` — the composition point: `/diagram` runs **after** `/pr` so the diagram lands in the PR body in one pass. Scheduled before `/pr`, it hands the block to `/pr` instead. |
| `health` | `/health` | Default — read-only. Rolls every process up to an owner (application, vendor, session manager, repo), ranks CPU / memory / energy / watcher churn, and prints where the machine is going plus what to do about it. The energy column is cumulative CPU time, declared as a proxy: Activity Monitor's Energy Impact is not available to an ordinary process and `powermetrics` needs root, which `health` never takes. |
| `health` | `/health --fix` | Acts on the findings, confirming each one. Re-measures immediately before every signal because ownership moves — a recorded run saw the live server change PID three times in twenty minutes and a port flip between two duplicate dev stacks. Kills are guarded by command-line match rather than PID, and every previously-serving port is re-checked after. |
| `health` | `/health --fix -y node` | `-y` / `--yes` acts on the `SAFE` tier without a prompt per item, and never promotes a lower tier. Trailing text is a focus term expanding those owners; focus never hides a heavier one. `--top <n>` sets rows per table (default 10). |

`revive`'s default proxy source is location-agnostic: export **`CLAUDE_PROXY_STORE`**
(the directory holding `<id>.md` transcripts) and optionally **`CLAUDE_PROXY_ARCHIVE`**
(where older days are relocated) in your shell. Without `CLAUDE_PROXY_STORE`,
`/revive` fails fast instead of guessing a path — `--source cli` and
`--source <path>` still work. `improve` reads the same variable: its parent is the
log directory the suggestion flags live in, and the directory above that is the
claude-proxy checkout whose `suggestions` CLI it calls. Without it, `/improve`
stops rather than searching for a checkout.

```sh
export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
export CLAUDE_PROXY_ARCHIVE="$HOME/path/to/archived/claude/logs"   # optional
```

`work` needs that same `CLAUDE_PROXY_STORE`, because the `ideas` CLI it calls
runs out of the claude-proxy checkout above that log directory — and it needs the
address of the ideas ledger itself, which is a hosted Worker rather than a file
on disk:

```sh
export IDEAS_URL="https://<your-operator-worker>"
export IDEAS_TOKEN="<the operator token from the Worker's secret store>"
```

`CONCEPTS_URL` and `CONCEPTS_TOKEN` are accepted as fallbacks for those two,
since ideas and concepts are one dataset behind one Worker; set the `IDEAS_*`
pair only to point them somewhere else. With any of the three unset, `/work`
stops and says which one — the hosted ledger has no local tier to fall back to.
See [docs/features/work.md](./docs/features/work.md).

`teach` does **not** use those. It saves concepts to the hosted concept store —
a Cloudflare Worker — so a concept taught on one machine is readable from every
other one and from an agent with no filesystem. Export its base URL and token
instead, on **every device you teach from**:

```sh
export CONCEPTS_URL="https://<your-worker>.workers.dev"
export CONCEPTS_TOKEN="<the token from the Worker's secret store>"
```

Read the token from the Worker's secret store or your password manager; never
commit it. `IDEAS_URL` and `IDEAS_TOKEN` are read first here too, so a device
that already set the pair above needs nothing more. With either variable unset,
`/teach` still names the term, still prints the sentence, and still copies it —
it skips only the save and says in one line why. See
[docs/features/teach.md](./docs/features/teach.md) for the per-device rollout.

`/lookup`, `/teach`, and `/learn` reach that store through one shared toolkit
verb, `my-command-tools concepts` (`lookup`, `save`, `count`), rather than
through a snippet pasted into each command. It reads both variables from
`process.env` inside its own process, takes the record to save as JSON on
standard input so no field reaches a command line, prints exactly one status line
and always exits `0`. **Neither installer ever writes a token**: both
`scripts/install-personal.sh` and the `npx` wizard report only whether the pair
is set and print the two export lines for you to paste.

**Every call to the ideas ledger goes through an ideas hook**, installed
alongside the workflow gates in `~/.claude/my-command/hooks/` (or under
`$CLAUDE_CONFIG_DIR` where that is set — `my-command-tools doctor` reports
where): `ideas-read.mjs`, `ideas-add.mjs`, `ideas-claim.mjs` and
`ideas-mark.mjs`. They are allowlisted by name, so `/ideate` and `/work` reach
the ledger without an approval round-trip, and each of them reads `IDEAS_URL`
and `IDEAS_TOKEN` — falling back to the `CONCEPTS_*` pair — from `process.env`
**inside its own process**; a token is never an argument, never echoed, and
never written to a file. Each prints one status line and always exits 0, so a
command reads that line rather than the exit code, and an unreachable ledger is
a stated skip naming its cause rather than a stopped run.

The `trim` command adapts the context-compaction strategy introduced by Yujiang Li,
Zhenyu Hou, Yi Jing, Jie Tang, and Yuxiao Dong in
[*CompactionRL: Reinforcement Learning with Context Compaction for Long-Horizon Agents*](https://arxiv.org/abs/2607.05378)
to an inference-time safety rubric for interactive coding sessions.

## Install

### Quickest — the wizard

```bash
npx github:llevasseur/my-command
```

It asks how you want them installed:

1. **Claude Code plugin** — commands are namespaced (`/my-command:task`) and
   **auto-update** whenever this repo is pushed.
2. **Personal commands** — bare commands (`/task`) copied into
   `~/.claude/commands`.
3. **Codex Skills** — Codex-native workflows such as `$task` copied as complete
   skill folders into `~/.agents/skills/<name>/`. Set `CODEX_SKILLS_DIR` to
   override the destination, or set `CODEX_HOME` to use `<CODEX_HOME>/skills`.

The repository also ships `.codex-plugin/plugin.json`, so supported Codex
surfaces can install the complete skill bundle as a plugin.

Both Claude choices also place the **subagent definitions** in `agents/` into
your Claude agents directory (`CLAUDE_AGENTS_DIR` overrides it). Every command
that delegates names one of them by `subagent_type`, so a dispatch runs the
definition's role rather than the default agent; without the definitions on the
device, a named dispatch silently falls back. See
[Subagent definitions](./docs/specs/subagent-definitions.md). The Codex choice
places none — Codex has no subagent mechanism.

Every choice also installs the **command toolkit** — a zero-dependency Node CLI
the commands and skills call for deterministic git/gh plumbing. It lands under
`~/.claude/my-command/` for Claude or `${CODEX_HOME:-~/.codex}/my-command/` for
Codex and gets linked onto PATH, because every workflow spells the call as a
bare `my-command-tools`. In a new shell:

```bash
my-command-tools doctor
```

`doctor`'s `onPath` block reports whether that bare call resolves and whether it
resolves to this install's shim. If the installer found neither `~/.local/bin` nor
`~/bin` on your PATH it links nothing and prints the `ln -s` line to run — it never
edits a shell profile.

The Claude commands and Codex skills route git/gh plumbing through it—`task`
sets up its worktree with `worktree begin`, gates on `state`'s `hasWork`, runs
repository checks with `verify`, and commits an explicit path list with
`commit`; `pr` pushes and opens or updates the PR in one call. Judgment stays in
the prompts. `clean` is the deliberate exception because comment scope itself
requires judgment.

See [Command toolkit](./docs/specs/command-toolkit.md).

### Manual — as a plugin

```bash
claude plugin marketplace add llevasseur/my-command
claude plugin install my-command@my-command
```

Then run `/reload-plugins`. Claude Code always namespaces plugin commands, so
they are invoked as `/my-command:task`, `/my-command:pr`, and so on.

## Repository layout

```
src/commands/       Canonical BARE commands — edit these (they call each other as /task, /clean, …)
agents/             Subagent definitions — one per shape of delegation, named by every dispatch site (see docs/specs/subagent-definitions.md)
skills/             Codex-native workflow skills — one semantic counterpart per Claude command
src/my-command.ts   The npx install wizard, in TypeScript (compiled to dist/, ships dependency-free)
src/toolkit/        Shared CLI every command calls — raw .mjs, shipped as-is (see docs/specs/command-toolkit.md)
  cli.mjs              Entrypoint and verb registry; JSON on stdout
  verbs/               state, scope, verify, commit, pr, prs, worktree, doctor
  lib/                 git/process/path/gh helpers
  bin/my-command-tools The shim that resolves the toolkit device-wide
src/hooks/          Workflow gates the harness runs (see docs/specs/workflow-gates.md)
  pre-tool-use.mjs     Refuses serial discovery, redundant reads, and an unresolvable relative cd
  stop.mjs             Refuses a run that ends wordless; warns about a report riding a tool call
  settings-fragment.json  What gets merged into settings.json (hooks + read-only allowlist)
  install-hooks.mjs    The idempotent merge; --uninstall removes it again
dist/               GENERATED wizard build (tsc output; gitignored, built on install via `prepare`)
commands/           GENERATED namespaced commands the plugin ships (do not edit by hand)
scripts/
  build-plugin.sh      Regenerate commands/ from src/commands/ (bare → /my-command:)
  check-commands.sh    Enforce command + toolkit invariants (commands/ in sync, feature docs, verbs registered, dispatch sites name a subagent type) — runs in CI
  install-personal.sh  Symlink src/commands/*.md into ~/.claude/commands and agents/*.md into ~/.claude/agents (bare, git-synced)
  install-codex-personal.sh  Symlink skills + toolkit into Codex device scopes (git-synced)
AGENTS.md           Repo rules for agents (the adding-a-command checklist + the CI gate)
biome.json          Biome lint + format config
tsconfig.json       TypeScript config (strict; compiles src/ → dist/)
tsconfig.toolkit.json  Typechecks src/toolkit/*.mjs via allowJs + checkJs (no emit — it ships as source)
.github/workflows/  Pull-request CI (merge-conflict check, Biome, typecheck, toolkit, build)
.claude-plugin/     Claude Code plugin + marketplace metadata
.codex-plugin/      Codex plugin manifest for the native skills bundle
docs/               okq spec bundle — specs/ (process), features/ (one per command), adrs/
```

The two Claude forms exist because the commands reference each other: a bare
`task` calls `/clean`, but the published plugin's `task` must call
`/my-command:clean`. The Codex mode installs checked-in native skills instead of
presenting Claude-only prose under Codex frontmatter. CI enforces that every
Claude command has exactly one Codex counterpart.

## Specs

The suite is documented as a queryable [okq](https://github.com/mikevalstar/okq)
bundle under [`docs/`](./docs) — process specs plus one feature doc per command:

- **[Adding a command](./docs/specs/adding-a-command.md)** — the checklist for
  adding a command as agent instructions (bare source → build → feature doc →
  wizard → README/CHANGELOG). Read this before adding one.
- **[Install wizard](./docs/specs/install-wizard.md)** — how the wizard installs
  the suite for Claude Code and Codex, including per-item overwrite behavior.
- **[Command toolkit](./docs/specs/command-toolkit.md)** — the device-wide
  `my-command-tools` CLI, its verbs and guards, and how it reaches every install
  mode.
- **[Workflow gates](./docs/specs/workflow-gates.md)** — the `PreToolUse` and
  `Stop` hooks and the toolkit recoveries that enforce the workflow rules
  mechanically, how they fail open, and how to turn them off
  (`MY_COMMAND_HOOKS=0`).
- **`docs/features/<cmd>.md`** — the flags, parameters, and behavior of each
  command.
- **[Claude and Codex support patterns](./docs/research/2026-07-19-claude-codex-support-patterns.md)** —
  research behind the Codex Skills adapter.

Two invariants the specs enforce: **a new command needs a feature doc and wizard
inclusion**, and **a flag/param change needs its feature doc updated in the same
change**. Query them with `okq --bundle docs find --type feature`.

A doc you write or change also gets **`dirty: true`** in its frontmatter—its
claims are right, but its prose has not been evaluated for density since it
changed. `/docs` consumes that queue in its final phase; standalone `/truncate`
does the same without first reconciling claims
(`okq --bundle docs find --where dirty=true`). Neither density path bumps the
claim timestamp. See
[ADR 0004](./docs/adrs/0004-docs-completes-density-pass.md).

## Editing the commands (maintainer)

To **add** a command, follow the [Adding a command](./docs/specs/adding-a-command.md)
spec. To edit an existing one:

```bash
# 1. Edit the bare source
$EDITOR src/commands/task.md

# 2. Regenerate the namespaced plugin commands
./scripts/build-plugin.sh

# 3. If flags or params changed, update that command's feature doc
$EDITOR docs/features/task.md   # then: okq --bundle docs index

# 4. Commit + push — installed plugins auto-update (version is SHA-based)
git add -A && git commit -m "…" && git push
```

## Use them yourself, synced across devices

Keep the short bare commands (`/task`) on every machine, controlled from this repo:

```bash
git clone git@github.com:llevasseur/my-command.git
cd my-command
./scripts/install-personal.sh      # symlinks the bare commands into ~/.claude/commands
./scripts/install-codex-personal.sh # symlinks $skills and toolkit for Codex
```

The symlinks point back into the clone, so `git pull` updates every Claude
command, Codex skill, the toolkit, and the workflow gates. Run the relevant
script once per machine; both are path-agnostic.

Both Claude install paths register the [workflow gates](./docs/specs/workflow-gates.md)
in `~/.claude/settings.json` — the hooks that refuse serial discovery, a redundant
whole-file re-read, a relative `cd` that cannot resolve, and a run that ends without
saying anything at all. They fail open, never refuse the same thing twice, and always
name the faster form. The outcome gate is the careful one: a Stop hook fires at every
yield of the turn rather than only at an ending, so it establishes *why* the loop
stopped before it speaks, and everything short of a wordless ending gets a warning
rather than a refusal. `install-personal.sh` symlinks them out of the clone; the `npx` wizard copies them
onto the device instead, because npx runs from a cache directory that is cleaned up after
it exits. Either way `my-command-tools doctor` reports `hooks.armed`, which is the only
thing that says a gate can actually fire. Skip registering them with
`./scripts/install-personal.sh --no-hooks`, silence them at any time with
`export MY_COMMAND_HOOKS=0`, or remove the registration with
`node ~/.claude/my-command/hooks/install-hooks.mjs --uninstall`.

The Codex install deliberately registers nothing. Codex has its own hook engine, but it
is opt-in behind a `[features]` flag in `~/.codex/config.toml`, configured as TOML rather
than `settings.json`, and its `PreToolUse` fires for the shell tool alone — never for the
Read and Edit calls two of these gates judge. A Codex-native port is its own work.

Once set up, pull updates from any session with **`/sync`** — it finds the clone,
fast-forwards it, and re-links any newly added commands, without hardcoding where
the repo lives.

Two things `/sync` cannot do for you, because they are not in the clone: exporting
`CONCEPTS_URL` and `CONCEPTS_TOKEN` in each device's shell profile (above), and
running `/sync` itself on a device you have not opened in a while. Both are
required before claude-proxy retires its local `logs/concepts.jsonl` — a device
still on the old `/teach` writes concepts to a file nothing will read.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md). New entries are added with the bundle's own
`changelog` command.

## License

MIT © Leevon Levasseur
