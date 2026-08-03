---
description: Interview a repo's tech stack, then generate that repo's own worktree bootstrap (scripts/bootstrap-worktree.sh and/or a "Worktree Setup" doc section) that /task's Step 1.5 discovers. One-time per repo; keeps /task device- and project-agnostic.
argument-hint: "[--here|-h] [--base <branch>] [--draft|-d] [notes about the stack]"
---

Set up a **repo-local worktree bootstrap** so a fresh `git worktree` behaves like the main checkout — and so the device-wide `/task` command never has to hardcode this repo's paths. `/task` Step 1.5 looks for exactly this: a `scripts/bootstrap-worktree.sh` (or a "Worktree Setup" section in `AGENTS.md`/`CLAUDE.md`).

Run it **once per repo** — or to update an existing bootstrap when the stack changes.

The `<command-args>` block above: parse leading flags off the front; anything else is free-text **notes about the stack** that seed the interview.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed. **Then close it out:** "until it is the only item left" is the trigger to resolve it, not a reason to leave it open forever — once it is the last item and the work is done, mark it completed with the run's **final tool call**, and send the text-only message after that call returns. Both constraints hold at once that way: the task list ends clean and the closing message still carries zero tool calls. Never hand back with the anchor still open — a finished run reads as abandoned in the job list.<!-- /include -->

## Flags (where the work happens — mirrors /task)

- `--here` / `-h` — work on the current branch; no worktree.
- `--base <branch>` — branch the worktree off `<branch>` instead of `main`.
- `--draft` / `-d` — open the PR as a draft (passed to `/pr`).

## Step 1 — Set up the workspace

Same as `/task` Step 1, based on **live** git state from `my-command-tools state`:

- **Default:** `my-command-tools worktree begin --branch chore/worktree-bootstrap`, then `EnterWorktree` at the `path` it reports.
- **`--base <branch>`:** the same call plus `--base <branch>`.
- **`--here`:** stay on the current branch; if `state` reports `onDefaultBranch`, create a feature branch first and say so.

Don't pass `--bootstrap` — the bootstrap you're creating doesn't exist yet, so this command's own worktree can't use it. That's expected; a fresh worktree here only needs git, which it has.

## Step 2 — Detect the stack (before asking anything)

Read the repo so you ask only about what you can't infer:

- **Package manager + install:** lockfile decides it — `pnpm-lock.yaml`→`pnpm install`, `package-lock.json`→`npm ci`, `yarn.lock`→`yarn install`, `bun.lockb`→`bun install`. Non-JS stacks: `Cargo.toml`, `go.mod`, `pyproject.toml`/`poetry.lock`, `Gemfile`, etc.
- **Monorepo layout:** `workspaces` in `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`.
- **Gitignored env files:** find `.env` / `.env.*`, then test each with `git check-ignore` — only the **gitignored** ones are symlink candidates (tracked env like `.env.example` stays put).
- **Derived/generated code + its generator:** `schema.prisma`→`prisma generate`; `codegen.ts`/`codegen.yml`→`graphql-codegen`; TanStack route trees; `*.proto`; etc. Map each generator to the `package.json` script that runs it **and the package dir it runs in**.
- **Repo conventions:** existing `scripts/` shebang style + `set -euo pipefail`; whether a `CHANGELOG.md` or changelog command exists; `shellcheck` availability.

## Step 3 — Interview to confirm + fill gaps

Present what you detected and ask only for the unknowns and confirmations — one tight round, using AskUserQuestion for structured choices. If the notes in the arguments already answer something, don't re-ask.

- Confirm the **env files** to symlink.
- Confirm the **install** command.
- For each **generator**: confirm command + package dir; add any you missed.
- **Generation granularity:** lazy by target (recommended for monorepos) vs all-at-once; name the targets.
- **Extra setup:** native builds, `docker compose up`, DB migrate/seed, config-file copies, tool installs.
- **Output form:** committed `scripts/bootstrap-worktree.sh` (recommended) / a "Worktree Setup" doc section / both.

## Step 4 — Recommendations (rules the generated bootstrap MUST follow)

Design the bootstrap around these, and explain each as you apply it:

- **Auto-detect the main checkout** via `git rev-parse --git-common-dir` → its parent dir. Never hardcode absolute paths. This is what makes the script portable *and* independent of which branch the worktree sits on.
- **Branch/base-agnostic.** `/task` and its callers create worktrees off `main`, off a `--base <branch>`, or check out an existing `--target <branch>` — so the bootstrap must never assume `main` or any branch. Operate only on (a) the worktree's own working tree and (b) the main checkout as the env source of truth. Regenerate derived code from the **worktree's own** schema so a non-`main` base with a different schema is handled correctly — never symlink or copy generated artifacts in (they'd reflect the wrong branch and hide drift).
- **Symlink gitignored env** from the main checkout (single source of truth) — never copy or edit; skip any missing; never overwrite an existing file.
- **Install** with the repo's package manager at the worktree root.
- **Regenerate lazily** by target; docs-only work can skip generation.
- **Refuse to run from the main checkout** (guard: detected main == worktree root → exit non-zero).
- **Commit it, don't gitignore it.** Only *tracked* files land in fresh worktrees (where `/task` looks for it), and teammates who share the `/task` command should get the bootstrap too. Keeping it free of machine-specific paths (via auto-detection) is what makes committing safe.
- Match repo conventions: shebang + `set -euo pipefail`, `chmod +x`.

## Step 5 — Write the bootstrap

- Write `scripts/bootstrap-worktree.sh` (and/or the doc section) per the answers, following every rule in Step 4; `chmod +x` the script.
- If emitting a doc section, add a short **Worktree Setup** heading to `AGENTS.md`/`CLAUDE.md` (whichever the repo uses) that points at the script or lists the steps.
- Skeleton to adapt (JS/monorepo shown — swap in the detected stack):

```bash
#!/usr/bin/env bash
set -euo pipefail
WORKTREE_ROOT="$(git rev-parse --show-toplevel)"
# --git-common-dir points at the MAIN checkout's .git even from a linked worktree
GIT_COMMON_DIR="$(cd "$WORKTREE_ROOT" && cd "$(git rev-parse --git-common-dir)" && pwd)"
MAIN_CHECKOUT="$(dirname "$GIT_COMMON_DIR")"
cd "$WORKTREE_ROOT"
[ "$MAIN_CHECKOUT" = "$WORKTREE_ROOT" ] && { echo "run from a linked worktree, not the main checkout" >&2; exit 1; }
# symlink gitignored env from "$MAIN_CHECKOUT" (skip missing, never overwrite) …
# install deps at the worktree root …
# regenerate derived code lazily by target arg (default all) …
```

## Step 6 — Verify

- `bash -n scripts/bootstrap-worktree.sh`; run `shellcheck` if it's available.
- **Dry-run the logic without a slow real install:** shim the package manager onto `PATH` (a stub that just echoes its args), run the script, and confirm — env symlinks point at the main checkout, missing files are skipped, a re-run keeps existing files, target selection works, and it refuses to run from the main checkout.
- Optionally offer a real run to confirm install + codegen actually succeed.

## Step 7 — Changelog, then /clean and /pr

- If the repo tracks a changelog, add an entry.
- Commit only the files you created: `my-command-tools commit --message <text> <path> [<path>...]`. Staging is always explicit — the verb refuses whole-tree staging — so nothing you didn't author comes along. Invoking this command is standing permission to commit on this branch (never on `main`).
  - <!-- include: shared/signing-retry.md -->`1Password: failed to fill whole buffer` with `fatal: failed to write commit object` is an unapproved signing prompt, not a repository problem: the commit did not happen and the tree is untouched. Retry the same commit once after the prompt is approved. Never rewrite the commit, pass `--no-gpg-sign`, or change the repo's signing configuration to get around it.<!-- /include -->
- Run **`/clean`**, commit any edits it makes (it deliberately leaves them uncommitted for the invoker — that's you — and `/pr` never commits), then **`/pr`** (`/pr --draft` if `--draft`/`-d`).
- **Tear the worktree down yourself** if Step 1 created one; `/pr` skips teardown for a worktree its session didn't create. <!-- include: shared/worktree-ownership.md -->**Remove a worktree through the same mechanism that created it.** One created by `git worktree add` or `my-command-tools worktree begin` is not owned by the session worktree tool merely because the session later entered it via `EnterWorktree({path})` — `ExitWorktree` refuses to remove it. Step back out with `action: "keep"`, then run `my-command-tools worktree end --branch <branch>` from outside the worktree; it re-verifies the branch reached origin before removing, so push rather than forcing if it refuses. If it refuses because another live session still holds the worktree, stop and report the path as left in place — never force past a live lock. **Whatever removes the worktree, stop the processes rooted in it first.** `worktree end` now does this itself, but `ExitWorktree` does not: a dev server or watcher started inside a worktree outlives the directory, and where the repo symlinks shared state (a log directory, a database) into each worktree, the survivor keeps writing to that shared state through a path that no longer resolves — one whose reads now fail can reconcile the shared store down to empty and make the main checkout look like it has no data. Run `my-command-tools worktree reap --path <worktree path>` immediately before `ExitWorktree({action: "remove"})`, and pass `--no-reap` to `end` only when a survivor is deliberate.<!-- /include --> Here that branch is `chore/worktree-bootstrap`.

## Notes

- One-time per repo. If a bootstrap already exists, **update** it rather than scaffolding a new one — inspect it first.
- Keep this command device- and project-agnostic: everything project-specific comes from detection + the interview, never hardcoded here.
- Report the branch up front and the PR number/URL at the end. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

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
