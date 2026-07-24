---
description: Reconcile an okq doc bundle with the code — refresh stale docs, add docs for undocumented features, prune docs for things that no longer exist
argument-hint: "[--bundle|-b <dir>] [--refresh|-r] [--add|-a] [--prune|-p] [--dry-run|-n] [--yes|-y] [doc id / path / topic to scope to]"
---

Bring this repo's doc bundle back in line with the code it describes. Docs rot in three directions, and this command handles all three: a doc that no longer matches the code (**stale**), a feature with no doc at all (**missing**), and a doc for something that was removed (**obsolete**).

The bundle is an [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) collection of Markdown-with-frontmatter docs, queried with [okq](https://github.com/mikevalstar/okq). Use `okq` to explore, write, and check it — not `grep`. The `okq-reference`, `okq-explore`, `okq-write-okf`, and `okq-maintain` skills are the contract; load them via the `Skill` tool as each step needs them.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; anything left over **scopes** the run (see Flags).

## Flags

- `--bundle <dir>` / `-b <dir>` — the bundle directory. Default: discover it (Step 1).
- `--refresh` / `-r` — run only the staleness pass (Step 3).
- `--add` / `-a` — run only the missing-docs pass (Step 4).
- `--prune` / `-p` — run only the obsolete-docs pass (Step 5).
- Pass flags combine (`-r -p` = refresh and prune, no additions). **With none of them, run all three** — that's the default.
- `--dry-run` / `-n` — report the full plan and change nothing. Stop after Step 2.
- `--yes` / `-y` — apply without pausing for confirmation, including deletions. Without it, every deletion and every doc-vs-code conflict is confirmed with me first.
- Anything left after flags scopes the run to a concept id (`features/pr`), a path or glob (`docs/adrs/*`), or a topic (`worktree handling`) — resolve a topic with `okq --bundle <dir> search "<topic>"` and audit the hits. Unscoped means the whole bundle.

## Step 1 — Locate the bundle and learn its rules

1. Confirm `okq` is installed (`command -v okq`). If it isn't, say so, point at the install instructions in the [okq repo](https://github.com/mikevalstar/okq) (`cargo install okq`, unless this repo documents its own way), and stop — this command is built on it.
2. Resolve the bundle directory, in order: `--bundle` if given; the path this repo's own docs use (grep `AGENTS.md`/`CLAUDE.md`/`README.md` for `okq --bundle <dir>`); then a conventional directory that exists and holds Markdown with frontmatter (`docs/`, `.okf/`, `notes/`); then the repo root. Confirm the choice with `okq --bundle <dir> stats` — if it reports no concepts, you picked wrong. If two plausible bundles exist, ask me which rather than guessing.
3. **Read the bundle's own contract before touching a file.** Its README/index, and any process spec it keeps about itself, define: which frontmatter keys it uses (`timestamp`, `updated`, `status`, `related`), whether directory `index.md` files are generated (`okq --bundle <dir> index`), whether a `_template.md` exists per folder, and — most importantly — **what unit it documents 1:1** (e.g. "one feature doc per command"). If the repo has a script or CI job gating docs (`scripts/check-*.sh`, a `docs` job in `.github/workflows/`), read it: it encodes the invariants in executable form.
4. **The bundle's own rules win over anything in this command.** Where they conflict, follow the bundle and say you did.

## Step 2 — Take inventory and classify, before editing anything

1. Structural health, from `okq-maintain`: `okq --bundle <dir> validate`, `deadlinks`, `orphans`, `stats`. Record what they report; these are inputs to the passes, not the passes themselves.
2. List every concept (`okq --bundle <dir> find --type <type>` per type in `stats`, or `find` unfiltered).
3. Enumerate the **documentable units in the code** using the 1:1 rule from Step 1 (e.g. every `src/commands/*.md`, every CLI entry point, every public package export). Derive the rule from the bundle's spec and gate script — do not invent your own.
4. Reconcile the two lists into three buckets and report the table before acting:
   - **CHECK** — unit and doc both exist → Step 3 audits it.
   - **MISSING** — unit with no doc → Step 4 writes one.
   - **OBSOLETE** — doc whose unit is gone → Step 5 prunes it.
   - Docs that aren't 1:1 with a unit (ADRs, process specs, index/landing pages) are **CHECK only**. They are never "missing" and never auto-pruned.
5. Apply the scope filter from `<command-args>`, if any, to all three buckets.
6. **`--dry-run` stops here**, having reported the table and what each pass would do.

## Step 3 — Refresh pass: audit each doc individually

Check docs **one at a time** — a doc is stale relative to its own subject, and a bundle-wide skim misses exactly the specific drift that matters.

**Cheap signals first, to rank suspicion (never as proof):**

- `git log -1 --format=%cI -- <doc>` versus the same for each source file the doc describes. Source newer than doc = suspect.
- The doc's `timestamp`/`updated` frontmatter versus the source's last commit date.
- Anything `validate`/`deadlinks` flagged in Step 2.

A doc can be stale with a newer mtime and fresh with an older one, so every suspect still gets the real audit; docs with no signal get a quick claim spot-check, not a free pass.

**The audit itself, per `okq-maintain`'s "audit a document against the code":**

1. `okq --bundle <dir> get <id>` (or `--section` for a big doc). Pull out the **checkable claims** — commands, flags, defaults, file paths, function/type names, exit codes, described behavior — not the prose.
2. Find the implementation and compare each claim to it. Mark every claim **matches**, **drifted** (code changed under the doc), or **wrong** (the doc was never right). Record `old value → current value`.
3. Then walk the graph and re-check what the doc's fix implicates: `okq --bundle <dir> neighbors <id> --depth 1` and `backlinks <id>`. Drift rarely sits in one doc — a renamed flag is usually wrong in the spec that references it too.

**Dispatch each doc's audit to its own fresh subagent** via the `Agent` tool, in parallel batches of about four. Each audit means reading a doc in full plus its implementation, and that is context this session does not need to keep — only the verdict is. Give each subagent the bundle dir, the concept id, the source paths it maps to, and the required output shape: verdict per claim, `old → current` for each discrepancy, and the concrete edit it proposes. Keep only the findings here.

**Applying what comes back:**

- **Doc is stale** → update the doc to match the code and bump `updated`/`timestamp` if the bundle tracks it.
- **Code looks like the regression** → do **not** rewrite the doc to bless it. A doc can legitimately record intended behavior the code drifted from. Report it as a code-side finding for me to decide; without `--yes`, ask before treating either side as the source of truth.
- **A committed ADR is now wrong** → never rewrite the decision. Supersede it with a new record following the bundle's convention (a new ADR, and `status: superseded` on the old one if the bundle uses status).
- Edit prose only where a claim changed. This pass is not a rewrite-for-style pass.

## Step 4 — Add pass: docs for undocumented features

For each **MISSING** unit from Step 2:

1. Start from a template — don't hand-roll frontmatter. A bundle-local `<folder>/_template.md` wins if it exists; otherwise `okq --bundle <dir> new <type> "<name>"`, which stamps correct frontmatter, a section skeleton, and today's date, then prints the path.
2. Fill the skeleton **from the actual source you read** — the real flags, the real defaults, the real behavior. Never describe a feature from its name. Keep the template's headings; match the length and shape of an existing doc of the same type.
3. Cross-link so the doc isn't born an orphan: a `Related` section (and/or frontmatter `related:`) pointing at the sibling docs and the spec it follows, **plus at least one inbound link** from wherever it belongs (the relevant index, spec, or hub doc). `okq --bundle <dir> orphans` at the end must not name it.
4. Reuse the bundle's existing tags (`okq --bundle <dir> stats` lists them) instead of inventing near-duplicates.

Also add a doc for genuinely undocumented **user-facing** behavior you hit while auditing, even where it isn't a 1:1 unit — a flag nobody wrote down, a documented-nowhere workflow. Keep it to features people invoke; internals don't need a doc, and a thin doc nobody needed is its own kind of rot.

## Step 5 — Prune pass: docs for things that no longer exist

Candidates are the **OBSOLETE** bucket plus orphans from Step 2 that look genuinely dead. Confirm each against history (`git log --diff-filter=D -- <path>`, `git log --oneline -- <path>`) before believing it.

Rules that override "it looks unused":

- **A rename is not a removal.** If the unit was renamed or moved, rename/rewrite the doc and repoint every inbound link (`okq --bundle <dir> backlinks <old-id>`) — don't delete and re-add.
- **Never delete an ADR.** Decisions are append-only; mark it superseded/deprecated per the bundle's convention instead.
- **Never delete a generated `index.md`.** It is output — regenerate it in Step 6.
- **Orphan ≠ obsolete.** A landing or root doc legitimately has no inbound links, and a doc can be correct but simply unlinked — that's an add-a-link fix, not a delete.
- **Confirm every deletion with me before it happens** unless `--yes` was given, with the evidence (the unit is gone as of commit X). Delete with `git rm` so it stays recoverable.

After removing anything, fix what pointed at it: `okq --bundle <dir> deadlinks` must come back clean, and the removed doc's entry must be gone from any hand-maintained list that named it.

## Step 6 — Reconcile, verify, report

1. Regenerate what's generated: `okq --bundle <dir> index` if the bundle has generated `index.md` files.
2. Re-run the health checks until clean: `okq --bundle <dir> validate`, `deadlinks --check`, `orphans` (exit code 3 means the gate tripped — branch on `$?`, not the text).
3. Run the repo's own doc gate if it has one (e.g. `pnpm run check:commands`, the `docs` CI job's command). Report exactly what you ran.
4. Report a table: doc | verdict (`fresh` / `updated` / `added` / `pruned` / `flagged`) | what changed. Then, separately, the **code-side findings** — places the code, not the doc, looked wrong — since those need my decision.
5. Apply edits directly. Don't commit unless the repo's flow expects docs committed with the work (invoked from `/task`, it will commit for you).

## Notes

- **Every claim you write traces to source you read.** Never fill a doc from the feature's name, and never soften a doc to match code you didn't verify.
- **Docs are a contract, not a cache.** When doc and code disagree, that's a judgment call for me — this command surfaces it rather than silently picking the code.
- `okq` over `grep` throughout: `search`/`find`/`get`/`neighbors` are ranked and structure-aware, and `get --section` keeps whole files out of context.
- This command edits **docs only** — never source code, never tests. Code problems get reported, not fixed.
- Hand-editing a generated `index.md` is always wrong; regenerate it.
- `--dry-run` writes nothing at all, including no `okq new` scaffolds.
- If the bundle turns out to be healthy, say so plainly and stop. A no-op run is a real result — don't manufacture churn to look busy.
