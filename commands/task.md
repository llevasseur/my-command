---
description: Take a task from criteria to PR — set up an isolated branch/worktree, implement, then /my-command:clean and /my-command:pr
argument-hint: "[--here|-h] [--base <branch>] [--draft|-d] [--add <cmd> -w <when>[, <cmd> -w <when>]] <task criteria>"
---

Take a task from a plain-language description all the way to an open PR. The task can be a new feature, a bug fix, an update, a refactor — anything. The end goal is always a PR, and I always run `/my-command:clean` before `/my-command:pr`.

$ARGUMENTS is the task. Parse leading flags off the front; everything else is the **task criteria**.

## Flags

- `--here` / `-h` — do NOT create a worktree. Work on the **current branch** as it is now.
- `--base <branch>` — branch off `<branch>` instead of `main`. Ignored when `--here` is set.
- `--draft` / `-d` — open the resulting PR as a draft. Passed straight through to `/my-command:pr` in step 3. Default is **not** draft.
- `--add <cmd> -w <when>[, <cmd> -w <when>]` — register one or more **extra commands** to weave into this `/my-command:task` run. See "Added commands" below.
- Anything not a recognized flag is part of the task criteria.

### Parsing `--add`

`--add` takes a **comma-separated list** of entries. Each entry is:

```
<command> --when <prompt>
```

- `<command>` — a slash-command to invoke (e.g. `/review`, `/test`, `/my-command:changelog`). Leading `/` optional.
- `--when` / `-w` — a plain-language **prompt** that tells you *at what point in the `/my-command:task` flow* to run that command, or under what condition (e.g. `-w after implementing, before /my-command:clean`, `-w only if I touched migrations`).
- Entries are separated by commas; everything between a command's `-w` and the next `, <command>` is that entry's `when` prompt.

Example:

```
/my-command:task --add /review -w after implement before clean, /db-check -w if any schema file changed --base develop fix the pagination cursor
```

parses to: base `develop`, criteria "fix the pagination cursor", plus two added commands — run `/review` after implementing (before `/my-command:clean`), and run `/db-check` when a schema file changed.

## Step 1 — Set up the workspace

Decide where the work happens **before** touching any code. Base every workspace decision on **live** git state (`git rev-parse --abbrev-ref HEAD`, `git status`), never the session's startup snapshot — it can be stale.

- **Default (no flags):** create a fresh worktree branched off `main`.
  - Derive a branch name from the criteria: `<type>/<kebab-summary>`, where `<type>` is `feat` (new feature), `fix` (bug fix), `chore` (maintenance/refactor), or `docs` (docs only). Keep the summary short and specific (e.g. `fix/artifact-panel-scroll`).
  - Use the `EnterWorktree` tool with that branch name. It branches from the remote default branch by default — correct for the `main` case.
  - **This counts as an explicit worktree request.** ALWAYS create the worktree via `EnterWorktree`, even in a background/in-place session under `worktree.bgIsolation: "none"`. Do not work in place on the default path — that requires the explicit `--here` / `-h` flag.
- **`--base <branch>` given:** branch off `<branch>` instead of `main`.
  - `EnterWorktree` can't target an arbitrary base, so create it manually: `git fetch`, then `git worktree add .claude/worktrees/<branch-name> -b <branch-name> <base>`, then switch into it with `EnterWorktree` using `path: .claude/worktrees/<branch-name>`.
- **`--here` / `-h` given:** stay on the current branch — no worktree.
  - Check it first: `git rev-parse --abbrev-ref HEAD`. If it's `main` (or the repo's default branch), don't implement on `main` — create a feature branch in place (`git checkout -b <type>/<kebab-summary>`) and tell me you did.

## Step 1.5 — Bootstrap the worktree

**Skip this entirely for `--here`** (the current checkout is already bootstrapped). A fresh worktree has no `node_modules`, no `.env` files, and no generated code — without them `tsc`/`biome`/tests silently under-check or fail outright, so do this **before** implementing.

**Prefer the repo's own bootstrap.** Check for a repo-provided worktree bootstrap first — a `scripts/bootstrap-worktree.sh` (or similar) or a "Worktree Setup" section in `AGENTS.md`/`CLAUDE.md` — and run/follow that. This command must not hardcode any one repo's paths.

Only if the repo provides nothing, do the generic equivalent:

- **Symlink the gitignored `.env` files** from the main checkout so env stays a single source of truth (never copy or edit — I manage the values). The main checkout is the repo root the worktree branched from; link each `.env` that exists there at the same relative path.
- **Install dependencies:** run the repo's install (`pnpm install` / `npm ci` / etc.) at the worktree root.
- **Generate lazily — only what the task touches.** Generated code (Prisma clients, GraphQL `__generated__` types, route trees) is derived from schema files in *this* worktree, so regenerate it here — **never symlink or copy it in** (a symlink reflects the wrong branch or corrupts the main checkout when written through; a copy goes stale and hides schema drift). Find the repo's generate commands in its `package.json` scripts. Docs-only tasks can skip generation.

Treat typecheck errors like "cannot find generated module" or a missing `*.gen.ts` as environment setup, not code bugs — bootstrap, then re-typecheck.

## Step 2 — Implement the task

- Restate the criteria in one line so we agree on scope, then implement it.
- For "create/initialize X" criteria, inspect the target path first — X may already exist, and the real work is extending it rather than scaffolding greenfield.
- Once isolated in a worktree, the worktree directory is the only writable root — resolve every read/edit/commit path under it, never the original shared checkout.
- Follow the repo's own conventions (read `CLAUDE.md`/`AGENTS.md` and match surrounding code — style, naming, tests).
- For anything non-trivial or ambiguous, plan before coding; for a bug, reproduce before fixing. Use the relevant superpowers skills (brainstorming, systematic-debugging, TDD) rather than guessing.
- **Verify before claiming done** — run the repo's typecheck / tests / build for what you touched and confirm they pass. Report what you ran.
- **Commits are explicitly allowed here.** Invoking `/my-command:task` is your standing permission to commit **on this branch** (never on `main`) — commit the work in logical commits with clear messages without asking again.
  - Only commit files **you** created or changed for this task. Do **not** commit pre-existing untracked files that carried over from the original workspace (e.g. via a worktree or a dirty checkout) — stage paths explicitly rather than `git add -A`/`git add .`, and leave anything unrelated to your task alone.
- If the repo tracks a changelog (e.g. a `changelog` command or `CHANGELOG.md`), add an entry.

## Step 3 — Clean, then PR

Always in this order, once implementation is committed and verified:

1. Run **`/my-command:clean`** to tidy comments in the branch's changes. It's branch-aware — it cleans committed + staged + unstaged work on a feature branch — so it will pick up the commits from step 2. Commit any edits it makes.
2. Run **`/my-command:pr`** to push and open (or update) the PR with a concise bulleted description. If `--draft`/`-d` was given, invoke it as `/my-command:pr --draft` so the PR opens as a draft. `/my-command:pr` also removes the worktree on its way out when applicable.

## Added commands (`--add`)

`--add` lets me extend a `/my-command:task` run with extra commands without changing this file. Each added command carries a `--when` prompt describing where it fits in the flow above.

- **Plan the placement up front.** Right after parsing flags, list the added commands and, for each, decide which step it hooks into based on its `when` prompt (e.g. "after implement, before clean" → run at the end of Step 2; "if migrations changed" → a conditional gate). Report this plan in the same up-front message where you report the branch name.
- **Honor conditions.** A `when` prompt may be conditional ("only if …", "when X changed"). Evaluate the condition at the relevant point and skip the command if it doesn't hold — say you skipped it and why.
- **Run each at its point**, invoking the named slash-command as if I'd typed it. If an added command fails, stop and surface it rather than silently continuing — same as any other step.
- **Ordering with built-in steps.** Added commands never replace Steps 1–3; they interleave. If two added commands map to the same point, run them left-to-right as listed.
- If a `when` prompt is too vague to place, ask me one focused question before running that command — don't guess a placement for something side-effectful.

## Notes

- Never implement or commit directly on `main`.
- If the criteria are too vague to act on, ask me one focused clarifying question before setting up the workspace — don't spin up a worktree for a guess.
- Report the branch name up front and the PR number/URL at the end.
