---
description: Take a task from criteria to PR — set up an isolated branch/worktree, implement, then /clean and /pr
argument-hint: "[--here|-h] [--base <branch>] [--draft|-d] [--add|-a <command + prompt>[, <command + prompt>]] <task criteria>"
---

Take a task from a plain-language description all the way to an open PR. The task can be a new feature, a bug fix, an update, a refactor — anything. The end goal is always a PR, and I always run `/clean` before `/pr`.

The task is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the **task criteria**.

## Flags

- `--here` / `-h` — do NOT create a worktree. Work on the **current branch** as it is now.
- `--base <branch>` — branch off `<branch>` instead of `main`. Ignored when `--here` is set.
- `--draft` / `-d` — open the resulting PR as a draft. Passed straight through to `/pr` in step 3. Default is **not** draft. It does **not** keep the worktree around — step 3's teardown still removes it.
- `--add` / `-a` — register one or more commands available to the user for the agent to weave into this `/task` run, each paired with a prompt that guides its use. See Step 0 below.
- Anything not a recognized flag is part of the task criteria.

### Parsing `--add`

`--add` takes a **comma-separated list** of entries. Each entry names a user-available command followed by a plain-language prompt describing how it relates to this run. There is no separate timing flag; the agent running `/task` interprets the prompt and decides whether and when to invoke the command.

- The leading command token identifies the command to invoke; a leading `/` is optional. The rest of the entry is the prompt associated with that command.
- Entries are separated by a comma that precedes the next command. A comma inside an associated prompt (not followed by a command) stays part of that prompt.

## Step 0 — Incorporate added commands

Run this step only when `--add` / `-a` is present, before setting up the workspace or starting the task pipeline.

1. Use the command discovery available in the current session and on the user's device to resolve every command named in the `--add` list, including user, project, and plugin commands. Base the result on what is actually installed and available; do not infer availability from a command's name.
2. Skip any list entry whose command cannot be found. An unavailable added command does not block the task.
3. Load each available command's instructions into the current context without invoking it. Combine those instructions with the prompt associated with that list entry so the agent running `/task` can determine whether, when, and how the command belongs in this run.
4. Update the pipeline in context with the resulting command steps. Added commands interleave with the built-in steps and never replace them. Preserve list order when multiple added commands belong at the same point.
5. Report the updated pipeline, including where each available added command fits. Then continue with Step 1 and follow the updated pipeline through completion.

Honor any condition implied by an associated prompt at the relevant point. If it does not hold, skip that command and say why. If the prompt is too vague to determine safe usage, ask one focused question before invoking that command. If an available command is invoked and fails, stop and surface the failure rather than silently continuing.

## Step 1 — Set up the workspace

Decide where the work happens **before** touching any code. Base every workspace decision on **live** git state (`git rev-parse --abbrev-ref HEAD`, `git status`), never the session's startup snapshot — it can be stale.

- **Default (no flags):** create a fresh worktree branched off the latest `main`.
  - Derive a branch name from the criteria: `<type>/<kebab-summary>`, where `<type>` is `feat` (new feature), `fix` (bug fix), `chore` (maintenance/refactor), or `docs` (docs only). Keep the summary short and specific (e.g. `fix/artifact-panel-scroll`).
  - **Fetch latest `main` first.** Run `git fetch origin` before creating the worktree — `EnterWorktree`'s base is only as fresh as the local remote-tracking ref, so a stale `origin/main` silently plants your work on old code.
  - Use the `EnterWorktree` tool with that branch name; it branches from the remote default branch.
  - **Then confirm the base really is the latest `main`.** Right after entering, compare `git rev-parse HEAD` with `git rev-parse origin/<default-branch>` — depending on the `worktree.baseRef` setting, `EnterWorktree` can branch off local HEAD rather than the freshest `origin/<default>`. If they differ and the new branch has no commits yet, plant it on the latest with `git reset --hard origin/<default-branch>`.
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
- **Commits are explicitly allowed here.** Invoking `/task` is your standing permission to commit **on this branch** (never on `main`) — commit the work in logical commits with clear messages without asking again.
  - Only commit files **you** created or changed for this task. Do **not** commit pre-existing untracked files that carried over from the original workspace (e.g. via a worktree or a dirty checkout) — stage paths explicitly rather than `git add -A`/`git add .`, and leave anything unrelated to your task alone.
- If the repo tracks a changelog (e.g. a `changelog` command or `CHANGELOG.md`), add an entry.

## Step 3 — Clean, then PR (in fresh subagents)

Once implementation is committed and verified, run the clean and PR stages **in fresh subagents** via the `Agent` tool, not inline. Both derive their inputs from git (`/clean` from the branch diff, `/pr` from `git log`/`git diff`/`gh`), so a fresh context loses nothing while shedding this task's stale file reads. Run them in order, each finishing before the next. The subagents share this worktree but not this conversation — hand each the branch name and enough context to act alone.

1. **Clean.** Dispatch a subagent to run **`/clean`** on this branch, then commit any edits it makes. `/clean` is branch-aware (committed + staged + unstaged), so it picks up step 2's commits; if nothing changes, there's nothing to commit.
2. **PR.** After the clean subagent returns, dispatch a subagent to run **`/pr`** — push and open (or update) the PR with a concise bulleted description, passing `--draft` when `--draft`/`-d` was given, plus any title/context I supplied. Tell it **not** to tear down the worktree — leave that to step 3.
3. **Teardown.** After the PR subagent returns, if this run used a worktree, remove it here with `ExitWorktree` (`action: "remove"`); the branch is already pushed, so this only discards the local copy. **Remove it even when the PR is a draft** — `--draft`/`-d` controls the PR's review state on GitHub, not the local workspace, and a draft's commits are on origin just the same, so there is nothing left to preserve locally. Skip teardown only for `--here`.

## Notes

- Never implement or commit directly on `main`.
- If the criteria are too vague to act on, ask me one focused clarifying question before setting up the workspace — don't spin up a worktree for a guess.
- Report the branch name up front and the PR number/URL at the end.
