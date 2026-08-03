---
description: Rewrite-for-style pass over a doc bundle via /my-command:task — cut docs down to high-signal tokens without losing a single claim
argument-hint: "[--here|-h] [--base <branch>] [--bundle|-b <dir>] [--all|-A] [--dry-run|-n] [--yes|-y] [doc id / path / topic to scope to]"
---

Make this repo's docs lean. A doc earns its tokens by carrying claims a reader can act on — flags, defaults, paths, behavior, the non-obvious constraint. Everything else is packaging: narration, restated headings, justification nobody asked for, the same mechanism explained three times in three sections. This command strips the packaging and leaves the claims **exactly** as they were.

This is the density pass [docs](docs.md) runs after reconciliation. `/my-command:docs` owns the whole correctness-then-density flow in one task; standalone `/my-command:truncate` runs the same claim-preserving rules for hand edits, an explicit scope, or a whole-bundle sweep without reconciling first.

The two are wired together by a `dirty` frontmatter flag: `/my-command:docs` marks every doc it refreshes or adds as `dirty: true`, then consumes the resulting queue in its final phase. Standalone `/my-command:truncate` treats the same flag as its default work queue. See Step 2.

The run happens inside a `/my-command:task` workflow (Step 0). Like `/my-command:task`, it defaults to a fresh worktree off the latest `main`.

The bundle is an [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) collection of Markdown-with-frontmatter docs, queried with [okq](https://github.com/mikevalstar/okq). Use `okq` to find and read them — not `grep`. The `okq-reference`, `okq-explore`, and `okq-maintain` skills are the contract; load them via the `Skill` tool as each step needs them.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; anything left over **scopes** the run (see Flags).

## Flags

**Workspace** — where the pass happens. Passed through to `/my-command:task` in Step 0; they mean exactly what they mean there.

- `--here` / `-h` — do NOT create a worktree. Truncate on the **current branch** as it is now.
- `--base <branch>` — branch off `<branch>` instead of `main`. Ignored when `--here` is set.
- With neither, the default is a fresh worktree off the latest `main`.

**Selection and scope** — what gets truncated. These stay here; they are not `/my-command:task` flags.

- `--bundle <dir>` / `-b <dir>` — the bundle directory. Default: discover it (Step 1).
- `--all` / `-A` — evaluate **every** doc in the bundle, not just the dirty ones. Use after a bulk import, or the first time this command runs against a bundle that has never been truncated.
- `--dry-run` / `-n` — report the queue and the proposed cuts, change nothing. Stop after Step 3.
- `--yes` / `-y` — apply without pausing, including cuts past the size guard in Step 4. Without it, any doc that would lose more than 40% of its body is confirmed with me first.
- Anything left after flags scopes the run to a concept id (`features/pr`), a path or glob (`docs/adrs/*`), or a topic (`worktree handling`) — resolve a topic with `okq --bundle <dir> search "<topic>"`. **An explicit scope overrides the dirty filter**: those docs are evaluated whether or not they are marked, and `--all` is redundant with it.

**`-a` is not a flag here.** The whole-bundle flag is `--all` / `-A` precisely because `-a` already means the missing-docs pass in `/my-command:docs` and extra woven-in commands in `/my-command:task`. Never forward this command's `-A`, `-b`, `-n`, or `-y` to `/my-command:task` as flags — they belong in the criteria text, not the invocation.

## Step 0 — Choose the workspace, then hand the pass to `/my-command:task`

This command does no branching, committing, or PR work of its own. It resolves **where** the pass happens, then delegates to `/my-command:task`, which owns workspace setup, commits, `/my-command:clean`, `/my-command:pr`, and worktree teardown. Do this **before** Step 1 — the bundle you edit must be the one inside the workspace `/my-command:task` set up, not the checkout you started in.

1. Map the workspace flag to the `/my-command:task` invocation:
   - **Default (neither flag):** `/my-command:task <criteria>` — a fresh worktree off the latest `main`. The branch type is always `docs` (this command only ever changes docs), so: `docs/<kebab-summary>` — e.g. `docs/truncate-bundle`, or scope-specific like `docs/truncate-task-doc`.
   - **`--here` / `-h`:** `/my-command:task --here <criteria>` — truncate on the current branch, no worktree. If that branch is `main`, `/my-command:task` creates a feature branch in place; let it.
   - **`--base <branch>`:** `/my-command:task --base <branch> <criteria>` — worktree branched off `<branch>`.
2. The `<criteria>` you hand `/my-command:task` is **this command's Steps 1–6 with the selection and scope already resolved** — state them in plain language rather than as flags (e.g. "run the `/my-command:truncate` density pass per Steps 1–6 over the dirty docs only, scoped to `features/`"). `/my-command:task`'s Step 2 *is* this pipeline.
3. **Don't create the worktree yourself** — `/my-command:task` Step 1 does it. Doing both nests a worktree inside a worktree. Report the branch name once `/my-command:task` has it.
4. `/my-command:task`'s Step 1.5 bootstrap can skip code generation (this is a docs-only change), but the workspace still needs `okq` on `PATH` — it's a device-level install, so a fresh worktree inherits it.
5. **`--dry-run` / `-n` skips this step entirely.** A dry run writes nothing, so there is nothing to isolate, commit, or open a PR for: stay in the current checkout, run Steps 1–3 in place, report the proposed cuts, and stop. Never spin up a worktree or call `/my-command:task` for a dry run.

## Step 1 — Locate the bundle and learn its rules

1. Confirm `okq` is installed (`command -v okq`). If it isn't, say so, point at the install instructions in the [okq repo](https://github.com/mikevalstar/okq) (`cargo install okq`, unless this repo documents its own way), and stop.
2. Resolve the bundle directory, in order: `--bundle` if given; the path this repo's own docs use (grep `AGENTS.md`/`CLAUDE.md`/`README.md` for `okq --bundle <dir>`); then a conventional directory that exists and holds Markdown with frontmatter (`docs/`, `.okf/`, `notes/`); then the repo root. Confirm with `okq --bundle <dir> stats`.
3. **Read the bundle's own contract before touching a file.** Its README/index and any process spec it keeps about itself define which frontmatter keys it uses, which sections a doc type is required to carry (a folder `_template.md` is the clearest statement of this), and whether directory `index.md` files are generated. A required section is never cut, even when empty of claims — tighten it instead.
4. **The bundle's own rules win over anything in this command.** Where they conflict, follow the bundle and say you did.

## Step 2 — Build the queue

1. **Default — dirty docs only:** `okq --bundle <dir> find --where dirty=true --json`. These are the docs `/my-command:docs` (or a human following the bundle's spec) touched since the last density pass. `No concepts match` means nothing is queued — that is a clean result, not a failure; report it and stop.
2. **`--all` / `-A`:** every concept — `okq --bundle <dir> find --json`.
3. **Explicit scope:** resolve it to concrete concepts (id, path/glob, or `okq search` for a topic) and use exactly those, ignoring `dirty` entirely.
4. Exclude from every mode: generated directory `index.md` files (they are output — regenerate, never edit) and anything the bundle marks as generated.
5. Record each queued doc's current body size (lines and characters, frontmatter excluded) — Step 5 reports the reduction against these numbers.
6. Report the queue before touching anything.

## Step 3 — Evaluate each doc, one at a time

**Dispatch each doc's evaluation to its own fresh subagent** via the `Agent` tool, in parallel batches of about four. Each evaluation means reading a doc in full, and that is context this session does not need to keep — only the proposed edit is. Give each subagent the bundle dir, the concept id, the rules below, and the required output shape: the claim inventory, the proposed cuts with a reason each, and the before/after size. Keep only the findings here.

Every evaluation starts by taking a **claim inventory** — the list of things the doc asserts that a reader could act on or be wrong about:

- command names, flags, and their short forms
- defaults, exit codes, thresholds, file paths, env vars
- described behavior and ordering ("X runs before Y")
- guardrails — what never to do, and any non-obvious constraint or gotcha
- an instruction's **force** — must, should, and may are three different obligations, and flattening one into another changes the doc as surely as deleting a flag
- links to other concepts

That inventory is the contract for Step 4: it must survive the edit unchanged, one for one.

### Cut

- **Narration and ceremony** — "This document describes…", "In this section we will…", a `## Summary` that restates the title, a sentence announcing what the next sentence says.
- **Justification that carries no claim** — the "why" behind a decision the reader cannot act on differently. If knowing the why changes nothing a reader does, it is packaging. (**ADRs are the exception** — see Keep.)
- **Repetition across sections** — the same mechanism explained in Summary, then Behavior, then Notes. Keep the fullest statement, cut the echoes, and let the doc's own structure carry the reader.
- **Content duplicated from a linked doc** — replace it with the link. One canonical statement, everywhere else a pointer.
- **Hedging and filler** — "it's worth noting that", "generally", "basically", "in order to", "please note", adverb stacks that survive deletion intact.
- **Redundant examples** — where two examples demonstrate the same thing, keep the clearer one. Where an example only restates the sentence above it, cut the example.
- **List items that restate their own heading.**

### Keep

- **Every claim in the inventory**, in the same words wherever the words are the claim (a flag spelling, a path, a command line).
- **The non-obvious.** A gotcha, an edge case, an external constraint, a "this looks wrong but is deliberate" — that is the highest-signal content in any doc and the first thing a careless pass deletes.
- **ADR reasoning.** An ADR's Context and Consequences *are* its payload: a decision without its reasoning cannot be revisited later. Tighten an ADR's wording; never remove why it was decided. The same holds for any doc whose stated job is to explain a rationale.
- **Required sections** from the bundle's template or spec, even when short.
- **Frontmatter** — `description` is what `okq search` and `find` surface, so it stays a full sentence.
- **Code blocks, command lines, and tables** verbatim. Cut the prose *around* an example, never inside it.

### Never

- **Never add** a claim, a section, or an explanation. This command only removes and shortens.
- **Never fix a claim you believe is wrong.** Drift is `/my-command:docs`' job. Record it as a finding for Step 6 and leave the words alone — a doc that is wrong and short is worse than one that is wrong and flagged.
- **Never bump `updated` / `timestamp`.** No claim changed, and those dates feed `/my-command:docs`' staleness ranking: bumping them would make a doc *look* freshly reconciled and push it down the audit queue on the strength of a style edit. Truncating is not reconciling.
- **Never rewrite for voice.** Match the doc's existing tone and the surrounding docs. The output should read like the same author with less to say, not like a different author.

### Rewrite toward

These govern **how a sentence you are already shortening comes out**. They are not a license to rewrite voice — the rule directly above still holds — and they are not a reason to touch a sentence you were not otherwise cutting.

- **One instruction per sentence.** Split a sentence carrying two.
- **One term per concept.** Reuse the doc's existing word every time it appears. A synonym introduced for variety reads as a second thing.
- **The warning before the step it guards.** A caveat trailing its instruction arrives after the reader has acted.
- **Active voice, imperative for an action.** "Run the gate", not "the gate should be run" — the passive drops the actor, and the actor is usually the claim.
- **Literal over idiomatic.** Replace "paper over", "silently under-check", "fakes a pass" with what they actually mean.
- **At most three nouns in a row.** Break a longer cluster with `of` or `for`.
- **Explicit conjunction scope.** "Never do A or B" leaves how far the negation reaches ambiguous. Name each side.
- **Uppercase MUST / MUST NOT / SHOULD / MAY** where the obligation is the point ([RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)). Preserve the doc's existing force; never soften or strengthen it to fit the form.

Deliberately **not** adopted from [ASD-STE100](https://asd-ste100.org) Simplified Technical English, which these rules are drawn from: its closed ~900-word dictionary, its sentence-length caps, and its restriction to simple tenses. Those serve a human reader with a limited English vocabulary. Here they cost precision and buy nothing.

## Step 4 — Apply, with a size guard

1. Apply the accepted cuts directly with `Edit`.
2. **Verify the claim inventory survived.** Re-derive it from the edited doc and compare to the one from Step 3. Any claim that is missing is a bug in the edit, not a successful truncation — restore it. This check is the whole safety story of this command; do not skip it on a doc that looks obviously fine.
3. **The size guard:** a doc that would lose **more than 40% of its body** is confirmed with me first — show the before/after size and the cut list — unless `--yes` / `-y` was given. A cut that deep usually means the doc was mostly duplication (legitimate) or that whole claims are going out with it (not).
4. Remove the `dirty` key from the frontmatter of every doc you evaluated, whether or not anything was cut — the flag means "not yet evaluated for density", and evaluating it clears it. Under `--dry-run`, remove nothing.
5. Leave every other frontmatter key exactly as it was.

## Step 5 — Verify and report

1. Regenerate what's generated: `okq --bundle <dir> index` if the bundle has generated `index.md` files.
2. Re-run the health checks until clean: `okq --bundle <dir> validate`, `deadlinks --check`, `orphans` (exit code 3 means the gate tripped — branch on `$?`, not the text). A cut that removed the last link to a doc shows up here as a new orphan; restore the link.
3. Run the repo's own doc gate if it has one (e.g. `pnpm run check:commands`, the `docs` CI job's command). Report exactly what you ran.
4. Report a table: doc | verdict (`truncated` / `reviewed` / `deferred`) | lines before → after | what was cut. `reviewed` means it was evaluated and already lean — a real outcome, not a miss. Then, separately, the **claims that looked wrong** — drift you noticed but deliberately left alone — since those are a `/my-command:docs` run, not this one.
5. Apply edits directly, then let the surrounding `/my-command:task` run take it from here — its Step 2 commits the changes, and its Step 3 runs `/my-command:clean`, `/my-command:pr`, and worktree teardown. Report the table above as this pass's result rather than opening the PR yourself. <!-- include: shared/text-only-turn.md -->Deliver that report in a **text-only turn** — after the last tool call, never in the same turn as one, or the run is recorded as unfinished even though the work landed.<!-- /include --> Under `--dry-run` there is nothing to hand off.

## Notes

- **A claim is never a style choice.** If you cannot decide whether a sentence carries a claim, it does — keep it. The cost of a kept sentence is a few tokens; the cost of a cut claim is a doc that silently lies by omission.
- **This command edits docs only** — never source code, never tests, never a command's own instructions in `src/commands/`. Those are read as the source of truth, not rewritten.
- **Shorter is not the goal; higher signal per token is.** A doc that is already lean gets `reviewed` and no edit. Never manufacture cuts to show a number.
- `okq` over `grep` throughout: `find --where`, `get --section`, and `search` are structure-aware, and `get --section` keeps whole files out of context.
- **Quote any Bash argument holding `*` or `?` that the invoked program — not the shell — should expand** (`okq --bundle docs find 'docs/adrs/*'`). The shell is zsh: an unquoted glob that matches nothing aborts the whole command with `no matches found`.
- Delegating to `/my-command:task` means `/my-command:task`'s own rules apply. `--yes` / `-y` governs the size-guard confirmations, not whether a PR gets opened.
- `--dry-run` writes nothing at all — no edits, no `dirty` clearing, and no worktree, commit, or PR either.
- If the queue is empty, say so plainly and stop. Nothing to truncate is a real result.
