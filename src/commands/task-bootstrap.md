---
description: Interview a repo's tech stack, then generate that repo's own worktree bootstrap (scripts/bootstrap-worktree.sh and/or a "Worktree Setup" doc section) that /task's Step 1.5 discovers. One-time per repo; keeps /task device- and project-agnostic.
argument-hint: "[--here|-h] [--base <branch>] [--draft|-d] [notes about the stack]"
---

Set up a **repo-local worktree bootstrap** so a fresh `git worktree` behaves like the main checkout — and so the device-wide `/task` command never has to hardcode this repo's paths. `/task` Step 1.5 looks for exactly this: a `scripts/bootstrap-worktree.sh` (or a "Worktree Setup" section in `AGENTS.md`/`CLAUDE.md`). This command detects the stack, interviews you to confirm the gaps, generates the bootstrap, verifies it, and opens a PR.

Run it **once per repo** — or to update an existing bootstrap when the stack changes.

$ARGUMENTS: parse leading flags off the front; anything else is free-text **notes about the stack** that seed the interview.

## Flags (where the work happens — mirrors /task)

- `--here` / `-h` — work on the current branch; no worktree.
- `--base <branch>` — branch the worktree off `<branch>` instead of `main`.
- `--draft` / `-d` — open the PR as a draft (passed to `/pr`).

## Step 1 — Set up the workspace

Same as `/task` Step 1, based on **live** git state (`git rev-parse --abbrev-ref HEAD`, `git status`):

- **Default:** fresh worktree off `main` via `EnterWorktree` (branch `chore/worktree-bootstrap`).
- **`--base <branch>`:** `git fetch`, then `git worktree add .claude/worktrees/<name> -b <name> <base>`, then `EnterWorktree` by `path`.
- **`--here`:** stay on the current branch; if it's `main`, create a feature branch first and say so.

The bootstrap you're creating doesn't exist yet, so this command's own worktree can't use it — that's expected. A fresh worktree here only needs git, which it has.

## Step 2 — Detect the stack (before asking anything)

Read the repo so you ask only about what you can't infer:

- **Package manager + install:** lockfile decides it — `pnpm-lock.yaml`→`pnpm install`, `package-lock.json`→`npm ci`, `yarn.lock`→`yarn install`, `bun.lockb`→`bun install`. Non-JS stacks: `Cargo.toml`, `go.mod`, `pyproject.toml`/`poetry.lock`, `Gemfile`, etc.
- **Monorepo layout:** `workspaces` in `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`.
- **Gitignored env files:** find `.env` / `.env.*`, then test each with `git check-ignore` — only the **gitignored** ones are symlink candidates (tracked env like `.env.example` stays put).
- **Derived/generated code + its generator:** `schema.prisma`→`prisma generate`; `codegen.ts`/`codegen.yml`→`graphql-codegen`; TanStack route trees; `*.proto`; etc. Map each generator to the `package.json` script that runs it **and the package dir it runs in**.
- **Repo conventions:** existing `scripts/` shebang style + `set -euo pipefail`; whether a `CHANGELOG.md` / `/changelog` exists; `shellcheck` availability.

## Step 3 — Interview to confirm + fill gaps

Present what you detected and ask only for the unknowns and confirmations — one tight round, using AskUserQuestion for structured choices. If the notes in $ARGUMENTS already answer something, don't re-ask.

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
- Commit only the files you created — stage paths explicitly (never `git add -A`). Invoking this command is standing permission to commit on this branch (never on `main`).
- Run **`/clean`**, then **`/pr`** (`/pr --draft` if `--draft`/`-d`).

## Notes

- One-time per repo. If a bootstrap already exists, **update** it rather than scaffolding a new one — inspect it first.
- Keep this command device- and project-agnostic: everything project-specific comes from detection + the interview, never hardcoded here.
- Report the branch up front and the PR number/URL at the end.
