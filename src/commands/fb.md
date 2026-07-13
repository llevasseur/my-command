---
description: Implement a feedback request via /task — on the current branch by default, or inside a worktree of a named existing branch with --target
argument-hint: "[--target|-t <branch>] <feedback request>"
---

Implement a feedback request. This is a thin wrapper around `/task`: it decides **where** the work happens, then hands the feedback to `/task` to take it from criteria to a PR.

$ARGUMENTS is the input. Parse leading flags off the front; everything else is the **feedback request** (the task criteria for `/task`).

## Flags

- `--target <branch>` / `-t <branch>` — apply the feedback onto an **existing** branch inside a fresh worktree.
- Anything not a recognized flag is part of the feedback request.

## Behavior

### Default (no `--target`)

Run `/task --here <feedback request>` on the **current branch**.

- `/task -h` stays on the current branch and does not create a worktree.
- If the current branch is `main` (or the repo's default branch), `/task` will create a feature branch in place — that's expected; let it.

### `--target <branch>` / `-t <branch>` given

1. Confirm the branch exists: `git fetch` then `git rev-parse --verify <branch>` (or `git rev-parse --verify origin/<branch>`). If it doesn't exist, stop and tell me — do **not** create a new branch. This flag is for applying feedback onto existing work.
2. Create a worktree checking out that **existing** branch (no `-b`):
   `git worktree add .claude/worktrees/<branch> <branch>`
   (use the branch's last path segment for the worktree dir if the name contains slashes).
3. Switch into it with the `EnterWorktree` tool using `path: .claude/worktrees/<branch>`.
4. Once inside the worktree, run `/task --here <feedback request>`. `-h` keeps `/task` on the checked-out branch — no nested worktree, no new branch.

## Notes

- Either path ends by delegating to `/task`, so `/task`'s own rules apply: it restates scope, implements, verifies, then runs `/clean` and `/pr`, and it has standing permission to commit on the branch (never on `main`).
- If the feedback request is too vague to act on, ask me one focused clarifying question before setting anything up.
- Report the branch name up front and the PR number/URL at the end (from `/task`/`/pr`).
