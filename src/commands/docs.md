---
description: Reconcile an okq doc bundle with the code via /task, then truncate dirty docs to high-signal prose without losing claims
argument-hint: "[--here|-h] [--base <branch>] [--bundle|-b <dir>] [--refresh|-r] [--add|-a] [--prune|-p] [--dry-run|-n] [--yes|-y] [doc id / path / topic to scope to]"
---

Bring this repo's doc bundle back in line with the code it describes, then make the result lean. Three kinds of rot, all handled here: a doc that no longer matches the code (**stale**), a feature with no doc at all (**missing**), and a doc for something that was removed (**obsolete**). A final phase applies [truncate](truncate.md)'s claim-preserving density rules to the dirty queue, so a successful run never knowingly ships noisy docs.

Both phases run inside one `/task` workflow (Step 0). Like `/task`, it defaults to a fresh worktree off the latest `main`. Never invoke `/truncate` as a nested command; run its density rules inline before `/task` commits.

The bundle is an [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) collection of Markdown-with-frontmatter docs, queried with [okq](https://github.com/mikevalstar/okq). Use `okq` to explore, write, and check it — not `grep`. The `okq-reference`, `okq-explore`, `okq-write-okf`, and `okq-maintain` skills are the contract; load them via the `Skill` tool as each step needs them.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; anything left over **scopes** the run (see Flags).

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **Resolve it in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

## Flags

**Workspace** — where the reconciliation happens. Passed through to `/task` in Step 0; they mean exactly what they mean there.

- `--here` / `-h` — do NOT create a worktree. Reconcile on the **current branch** as it is now.
- `--base <branch>` — branch off `<branch>` instead of `main`. Ignored when `--here` is set.
- With neither, the default is a fresh worktree off the latest `main`.

**Passes and scope** — what gets reconciled. These stay here; they are not `/task` flags.

- `--bundle <dir>` / `-b <dir>` — the bundle directory. Default: discover it (Step 1).
- `--refresh` / `-r` — run only the staleness pass (Step 3).
- `--add` / `-a` — run only the missing-docs pass (Step 4).
- `--prune` / `-p` — run only the obsolete-docs pass (Step 5).
- Pass flags combine (`-r -p` = refresh and prune, no additions). **With none of them, run all three** — that's the default.
- `--dry-run` / `-n` — report the reconciliation plan and projected density queue, then change nothing. Stop after Step 2.
- `--yes` / `-y` — apply without pausing for confirmation, including deletions and density cuts past the 40% size guard. Without it, every deletion, doc-vs-code conflict, and over-40% cut is confirmed with me first.
- Anything left after flags scopes the run to a concept id (`features/pr`), a path or glob (`docs/adrs/*`), or a topic (`worktree handling`) — resolve a topic with `okq --bundle <dir> search "<topic>"` and audit the hits. Unscoped means the whole bundle.

**`-a` means different things in the two commands.** Here `--add` / `-a` is the missing-docs pass; in `/task` it registers extra commands to weave in. Never forward this command's `-a` (or `-r`, `-p`, `-n`, `-y`, `-b`) to `/task` as a flag — they belong in the criteria text, not the invocation.

## Step 0 — Choose the workspace, then hand the passes to `/task`

This command does no branching, committing, or PR work of its own. It resolves **where** the reconciliation happens, then delegates to `/task`, which owns workspace setup, commits, `/clean`, `/pr`, and worktree teardown. Do this **before** Step 1 — the bundle you audit must be the one inside the workspace `/task` set up, not the checkout you started in.

1. Map the workspace flag to the `/task` invocation:
   - **Default (neither flag):** `/task <criteria>` — a fresh worktree off the latest `main`, exactly like `/task`'s own default. The branch type is always `docs` (this command only ever changes docs), so: `docs/<kebab-summary>` — e.g. `docs/reconcile-bundle`, or scope-specific like `docs/refresh-pr-command`.
   - **`--here` / `-h`:** `/task --here <criteria>` — reconcile on the current branch, no worktree. If that branch is `main`, `/task` creates a feature branch in place; let it.
   - **`--base <branch>`:** `/task --base <branch> <criteria>` — worktree branched off `<branch>`.
2. The `<criteria>` you hand `/task` is **this command's Steps 1–7 with the passes and scope already resolved** — state them in plain language rather than as flags (e.g. "reconcile the doc bundle per `/docs` Steps 1–7: refresh pass only, scoped to `features/pr`, then run the integrated density phase over the resulting dirty queue"). `/task`'s Step 2 *is* this pipeline.
3. **Don't create the worktree yourself** — `/task` Step 1 does it. Doing both nests a worktree inside a worktree. Report the branch name once `/task` has it.
4. `/task`'s Step 1.5 bootstrap can skip code generation (this is a docs-only change), but the workspace still needs `okq` on `PATH` — it's a device-level install, so a fresh worktree inherits it.
5. **`--dry-run` / `-n` skips this step entirely.** A dry run writes nothing, so there is nothing to isolate, commit, or open a PR for: stay in the current checkout, run Steps 1–2 in place, report the reconciliation plan and projected density queue, and stop. Never spin up a worktree or call `/task` for a dry run.

## Step 1 — Locate the bundle and learn its rules

1. Confirm `okq` is installed (`command -v okq`). If it isn't, say so, point at the install instructions in the [okq repo](https://github.com/mikevalstar/okq) (`cargo install okq`, unless this repo documents its own way), and stop — this command is built on it.
2. Resolve the bundle directory, in order: `--bundle` if given; the path this repo's own docs use (grep `AGENTS.md`/`CLAUDE.md`/`README.md` for `okq --bundle <dir>`); then a conventional directory that exists and holds Markdown with frontmatter (`docs/`, `.okf/`, `notes/`); then the repo root. Confirm the choice with `okq --bundle <dir> stats` — if it reports no concepts, you picked wrong. If two plausible bundles exist, ask me which rather than guessing.
3. **Read the bundle's own contract before touching a file.** Its README/index, and any process spec it keeps about itself, define: which frontmatter keys it uses (`timestamp`, `updated`, `status`, `related`, `dirty`), whether directory `index.md` files are generated (`okq --bundle <dir> index`), whether a `_template.md` exists per folder, and — most importantly — **what unit it documents 1:1** (e.g. "one feature doc per command"). If the repo has a script or CI job gating docs (`scripts/check-*.sh`, a `docs` job in `.github/workflows/`), read it: it encodes the invariants in executable form.
4. **The bundle's own rules win over anything in this command.** Where they conflict, follow the bundle and say you did.

## Step 2 — Take inventory and classify, before editing anything

<!-- include-block: shared/batched-discovery.md -->
### Discovery runs as one batched pass

This is a step of the workflow, not a habit to recall. Run it whenever a phase of this command has to look at more than one file.

1. **Enumerate before reading.** Name every path, pattern, and read-only probe the phase needs. Where naming them takes a search — `rg --files`, `git diff --name-only`, a PR's file list — that search is the phase's first call, and its output *is* the enumeration.
2. **Send the whole enumeration in one turn.** Every `Read`, `rg`, `ls`, and read-only `git` call on that list goes out as parallel tool calls in a single assistant turn. Only a call whose arguments depend on another call's result may wait for the next turn. "I will decide what to read after this one" is not a dependency when the path was already on the list, and four or more consecutive read-only calls with no decision between them means the enumeration was skipped.
3. **Never loop per file.** One `Read` per entry of a list you already hold, or one `git diff <base> -- <path>` per path, is the shape this step exists to stop. Pass every path to a single `git diff <base>...HEAD -- <path> <path> …`, and send every `Read` as one block. Reviews and doc audits are where the loop reappears, because there the file list arrives complete and then gets walked.
4. **Read each file once.** A file already in this session's transcript is already in context, and wanting a *different* symbol from it is not a reason to read it again. Locate every symbol you now want with one `rg -n 'foo|bar' <file>`, then pull only the range you still need with numeric `offset`/`limit`. The one legitimate re-read is after the file actually changed — your own `Edit`, a hook, a formatter, a generator, or another agent — and then only the changed range.
5. **Re-establish the read-before-write precondition after a compaction.** `Edit` and `Write` reject a file this *session* has not read. Inherited context, a continuation summary, and shell output do not satisfy that precondition, even though the summary reads as though they do. So after any compaction boundary, session continuation, or hand-off into this command, treat the precondition as unmet: enumerate the files the next edit pass will write, `Read` them in one batch (a targeted `offset`/`limit` slice counts), and edit only once that batch returns. Re-running the rejected `Edit` cannot clear the error — the batched `Read` is the fix, and doing it for the whole pass at once is what stops the same rejection repeating file after file.
<!-- /include-block -->

1. Structural health, from `okq-maintain`: `okq --bundle <dir> validate`, `deadlinks`, `orphans`, `stats`. Record what they report; these are inputs to the passes, not the passes themselves.
2. List every concept (`okq --bundle <dir> find --type <type>` per type in `stats`, or `find` unfiltered).
3. Enumerate the **documentable units in the code** using the 1:1 rule from Step 1 (e.g. every `src/commands/*.md`, every CLI entry point, every public package export). Derive the rule from the bundle's spec and gate script — do not invent your own.
4. Reconcile the two lists into three buckets and report the table before acting:
   - **CHECK** — unit and doc both exist → Step 3 audits it.
   - **MISSING** — unit with no doc → Step 4 writes one.
   - **OBSOLETE** — doc whose unit is gone → Step 5 prunes it.
   - Docs that aren't 1:1 with a unit (ADRs, process specs, index/landing pages) are **CHECK only**. They are never "missing" and never auto-pruned.
5. Apply the scope filter from `<command-args>`, if any, to all three buckets.
6. **`--dry-run` stops here**, having reported the table, what each reconciliation pass would do, and the projected Step 6 queue: docs already marked dirty plus docs expected to be updated or added. Make no density edits and clear no flags.

## Step 3 — Refresh pass: audit each doc individually

Check docs **one at a time** — a doc is stale relative to its own subject, and a bundle-wide skim misses exactly the specific drift that matters.

**Cheap signals first, to rank suspicion (never as proof):**

- `git log -1 --format=%cI -- <doc>` versus the same for each source file the doc describes. Source newer than doc = suspect.
- The doc's `timestamp`/`updated` frontmatter versus the source's last commit date.
- Anything `validate`/`deadlinks` flagged in Step 2.

Every suspect still gets the real audit — a doc can be stale with a newer mtime — and docs with no signal get a quick claim spot-check, not a free pass.

**The audit itself, per `okq-maintain`'s "audit a document against the code":**

1. `okq --bundle <dir> get <id>` (or `--section` for a big doc). Pull out the **checkable claims** — commands, flags, defaults, file paths, function/type names, exit codes, described behavior — not the prose.
2. Find the implementation and compare each claim to it. Mark every claim **matches**, **drifted** (code changed under the doc), or **wrong** (the doc was never right). Record `old value → current value`.
3. Then walk the graph and re-check what the doc's fix implicates: `okq --bundle <dir> neighbors <id> --depth 1` and `backlinks <id>`. Drift rarely sits in one doc — a renamed flag is usually wrong in the spec that references it too.

**Dispatch each doc's audit to its own fresh subagent** via the `Agent` tool, in parallel batches of about four. Each audit means reading a doc in full plus its implementation, and that is context this session does not need to keep — only the verdict is. Give each subagent the bundle dir, the concept id, the source paths it maps to, and the required output shape: verdict per claim, `old → current` for each discrepancy, and the concrete edit it proposes. Keep only the findings here.

**Applying what comes back:**

- **Doc is stale** → update the doc to match the code, bump `updated`/`timestamp` if the bundle tracks it, and set `dirty: true` (Step 3.5).
- **Code looks like the regression** → do **not** rewrite the doc to bless it. A doc can legitimately record intended behavior the code drifted from. Report it as a code-side finding for me to decide; without `--yes`, ask before treating either side as the source of truth.
- **A committed ADR is now wrong** → never rewrite the decision. Supersede it with a new record following the bundle's convention (a new ADR, and `status: superseded` on the old one if the bundle uses status).
- Edit prose only where a claim changed. Density belongs to Step 6; the `dirty` flag hands the corrected doc to that final phase.

## Step 3.5 — Mark what you touched as `dirty`

Every doc this run **updates** (Step 3) or **creates** (Step 4) gets `dirty: true` in its frontmatter. That flag is a work queue, not a defect: it says the doc's claims are now correct but its prose has not been evaluated for density since it changed. Step 6 consumes that queue with [truncate](truncate.md)'s rules before the surrounding `/task` commits.

- Set it on updated and added docs only. A doc you audited and found **fresh** is not dirty — nothing changed in it.
- Set it as a plain boolean (`dirty: true`) at the top level of the frontmatter, alongside `type` and `title`. `okq find --where` reads arbitrary frontmatter keys, so no schema change or okq upgrade is needed.
- Leave an already-set `dirty: true` in place during reconciliation. Only the Step 6 density phase or a standalone `/truncate` run clears it.
- **The bundle's own contract wins.** If it names a different key or tracks this some other way, follow the bundle and say you did.
- `--dry-run` sets nothing, like every other write in this command.

## Step 4 — Add pass: docs for undocumented features

For each **MISSING** unit from Step 2:

1. Start from a template — don't hand-roll frontmatter. A bundle-local `<folder>/_template.md` wins if it exists; otherwise `okq --bundle <dir> new <type> "<name>"`, which stamps correct frontmatter, a section skeleton, and today's date, then prints the path.
2. Fill the skeleton **from the actual source you read** — the real flags, the real defaults, the real behavior. Never describe a feature from its name. Keep the template's headings; match the length and shape of an existing doc of the same type.
3. Cross-link so the doc isn't born an orphan: a `Related` section (and/or frontmatter `related:`) pointing at the sibling docs and the spec it follows, **plus at least one inbound link** from wherever it belongs (the relevant index, spec, or hub doc). `okq --bundle <dir> orphans` at the end must not name it.
4. Reuse the bundle's existing tags (`okq --bundle <dir> stats` lists them) instead of inventing near-duplicates.
5. Set `dirty: true` per Step 3.5 — a doc written in one pass has never been evaluated for density, so it starts in `/truncate`'s queue.

Also add a doc for genuinely undocumented **user-facing** behavior you hit while auditing, even where it isn't a 1:1 unit — a flag nobody wrote down, a documented-nowhere workflow. Keep it to features people invoke; internals don't need a doc, and a thin doc nobody needed is its own kind of rot.

## Step 5 — Prune pass: docs for things that no longer exist

Candidates are the **OBSOLETE** bucket plus orphans from Step 2 that look genuinely dead. Confirm each against history (`git log --diff-filter=D -- <path>`, `git log --oneline -- <path>`) before believing it.

Rules that override "it looks unused":

- **A rename is not a removal.** If the unit was renamed or moved, rename/rewrite the doc and repoint every inbound link (`okq --bundle <dir> backlinks <old-id>`) — don't delete and re-add.
- **Never delete an ADR.** Decisions are append-only; mark it superseded/deprecated per the bundle's convention instead.
- **Never delete a generated `index.md`.** It is output — regenerate it in Step 7.
- **Orphan ≠ obsolete.** A landing or root doc legitimately has no inbound links, and a doc can be correct but simply unlinked — that's an add-a-link fix, not a delete.
- **Confirm every deletion with me before it happens** unless `--yes` was given, with the evidence (the unit is gone as of commit X). Delete with `git rm` so it stays recoverable.

After removing anything, fix what pointed at it: `okq --bundle <dir> deadlinks` must come back clean, and the removed doc's entry must be gone from any hand-maintained list that named it.

## Step 6 — Truncate the dirty queue

Run the density pass **inside the existing `/task` workflow**. Do not invoke `/truncate` and do not create another worktree, commit sequence, or PR.

1. Build the queue with `okq --bundle <dir> find --where dirty=true --json` after reconciliation. This intentionally includes dirty docs from earlier hand edits or interrupted runs as well as docs updated or added above. Exclude generated indexes and anything the bundle marks generated. Record each queued doc's body lines and characters. An empty queue is a successful clean result.
2. Evaluate each doc independently, in parallel subagents where allowed. Inventory every actionable claim first: commands, flags, defaults, exit codes, paths, environment variables, behavior, ordering, guardrails, non-obvious constraints, links, and the **force** of an instruction — must, should, and may are three different obligations, and flattening one into another changes the doc as surely as deleting a flag.
3. Cut narration, ceremony, unactionable justification, repetition, linked-doc duplication, hedging, filler, and redundant examples. Preserve every inventoried claim, required section, ADR rationale, frontmatter `description`, command line, code block, and table. Never add claims, fix suspected drift, rewrite voice, or bump `updated` / `timestamp`. Shape each surviving sentence by the **Rewrite toward** rules below.
4. Re-derive the claim inventory after each edit and restore anything missing. A missing claim is a bug, not a successful truncation. Confirm a cut over 40% of the body unless `--yes` / `-y` was given.
5. Remove `dirty` from every evaluated doc, including one already lean enough to receive a `reviewed` verdict. If a doc cannot be evaluated safely, defer it, keep it dirty, and report why rather than silently declaring the queue clean.

<!-- include-block: shared/rewrite-toward.md -->
### Rewrite toward

These govern **how a sentence you are already shortening comes out**. They are not a license to rewrite voice — the `Never rewrite for voice` rule still holds — and they are not a reason to touch a sentence you were not otherwise cutting.

- **One instruction per sentence.** Split a sentence carrying two.
- **One term per concept.** Reuse the doc's existing word every time it appears. A synonym introduced for variety reads as a second thing.
- **The warning before the step it guards.** A caveat trailing its instruction arrives after the reader has acted.
- **Active voice, imperative for an action.** "Run the gate", not "the gate should be run" — the passive drops the actor, and the actor is usually the claim.
- **Literal over idiomatic.** Replace "paper over", "silently under-check", "fakes a pass" with what they actually mean.
- **At most three nouns in a row.** Break a longer cluster with `of` or `for`.
- **Explicit conjunction scope.** "Never do A or B" leaves how far the negation reaches ambiguous. Name each side.
- **Uppercase MUST / MUST NOT / SHOULD / MAY** where the obligation is the point ([RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)). Preserve the doc's existing force; never soften or strengthen it to fit the form.

Deliberately **not** adopted from [ASD-STE100](https://asd-ste100.org) Simplified Technical English, which these rules are drawn from: its closed ~900-word dictionary, its sentence-length caps, and its restriction to simple tenses. Those serve a human reader with a limited English vocabulary. Here they cost precision and buy nothing.
<!-- /include-block -->

## Step 7 — Reconcile, verify, report

1. Regenerate what's generated: `okq --bundle <dir> index` if the bundle has generated `index.md` files.
2. Re-run the health checks until clean: `okq --bundle <dir> validate`, `deadlinks --check`, `orphans` (exit code 3 means the gate tripped — branch on `$?`, not the text).
3. Run the repo's own doc gate if it has one (e.g. `pnpm run check:commands`, the `docs` CI job's command). Report exactly what you ran.
4. Report the reconciliation table — doc | verdict (`fresh` / `updated` / `added` / `pruned` / `flagged`) | what changed — then the density table — doc | verdict (`truncated` / `reviewed` / `deferred`) | lines before → after | what was cut. Then, separately, the **code-side findings** — places the code, not the doc, looked wrong — since those need my decision. Close with the remaining dirty count. A successful run leaves the queue empty; report every deferred dirty doc as incomplete work with its reason.
5. Apply edits directly, then let the surrounding `/task` run take it from here — its Step 2 commits the complete reconciliation-and-density change, and its Step 3 runs `/clean`, `/pr`, and worktree teardown. Report the tables above as this pass's result rather than opening the PR yourself. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include --> Under `--dry-run` there is nothing to hand off.

## Notes

- **Every claim you write traces to source you read.** Never fill a doc from the feature's name, and never soften a doc to match code you didn't verify.
- **Docs are a contract, not a cache.** When doc and code disagree, that's a judgment call for me — this command surfaces it rather than silently picking the code.
- **Correctness before density.** Steps 1–5 may make a doc longer to make it right; Step 6 then applies [truncate](truncate.md)'s claim-preserving density rules. Keeping the phases ordered prevents a style edit from deciding what a claim should say while still completing both in one PR.
- `okq` over `grep` throughout: `search`/`find`/`get`/`neighbors` are ranked and structure-aware, and `get --section` keeps whole files out of context.
- **Quote any Bash argument holding `*` or `?` that the invoked program — not the shell — should expand** (`okq --bundle docs find 'docs/adrs/*'`, `grep --include='*.md'`). The shell is zsh: an unquoted glob that matches nothing aborts the whole command with `no matches found`.
- This command edits **docs only** — never source code, never tests. Code problems get reported, not fixed. That holds inside the `/task` run too: the PR it opens is a docs-only PR.
- Delegating to `/task` means `/task`'s own rules apply. A doc-vs-code conflict still comes back to me before anything is blessed, and `--yes` / `-y` governs those confirmations, not whether a PR gets opened.
- Hand-editing a generated `index.md` is always wrong; regenerate it.
- `--dry-run` writes nothing at all — no `okq new` scaffolds, and no worktree, commit, or PR either.
- If the bundle turns out to be healthy, say so plainly and stop. A no-op run is a real result — don't manufacture churn to look busy.

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no marker to type: the `- done:` line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close here in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
