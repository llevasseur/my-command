---
description: Implement a feedback request via /task — on the current branch by default, or inside a worktree of a named existing branch with --target
argument-hint: "[--target|-t <branch>] <feedback request>"
---

Implement a feedback request. This is a thin wrapper around `/task`: it decides **where** the work happens, then hands the feedback to `/task` to take it from criteria to a PR.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the **feedback request** (the task criteria for `/task`).

## Flags

- `--target <branch>` / `-t <branch>` — apply the feedback onto an **existing** branch inside a fresh worktree.
- Anything not a recognized flag is part of the feedback request.

## Behavior

During implementation, read each file immediately before `Edit`. Re-read it if any external action, hook, formatter, generator, or another agent may have changed it since the prior read.

### Default (no `--target`)

Run `/task --here <feedback request>` on the **current branch**.

- `/task -h` stays on the current branch and does not create a worktree.
- If the current branch is `main` (or the repo's default branch), `/task` will create a feature branch in place — that's expected; let it.

### `--target <branch>` / `-t <branch>` given

If the target repo is not the repo this session started in, prefer starting a new session in the target repo. Otherwise, use the steps below without `EnterWorktree`: do all work through absolute paths under the returned `path`, then tear down with `my-command-tools worktree end`, which re-verifies the branch reached origin before removing it.

1. `my-command-tools worktree begin --branch <branch> --existing --bootstrap`. It fetches first, then checks out that **existing** branch into a worktree and reports the `path`. `--existing` is what makes this safe: without it the verb would create a new branch, silently abandoning the work already on `<branch>`.
   - If it errors with `branch does not exist locally or on origin`, stop and tell me — do **not** create a new branch. This flag is for applying feedback onto existing work.
2. When the target and session-start repo are the same, switch into the reported `path` with the `EnterWorktree` tool. For a cross-repo run, stay outside it and use absolute paths under `path`.
3. Run `/task --here <feedback request>` against the reported worktree: from inside it for a same-repo run, or through its absolute paths for a cross-repo run. `-h` keeps `/task` on the checked-out branch — no nested worktree, no new branch.
4. Tear the worktree down yourself once `/task` reports the PR — **`/pr` will not do it for you.** It skips teardown for any worktree its session didn't create, and this one is yours.
   - **Same repo:** you entered it with `EnterWorktree({path})`, so `ExitWorktree` refuses to remove it. Call `ExitWorktree` with `action: "keep"` to step back out to the original checkout, then run `my-command-tools worktree end --branch <branch>` from there.
   - **Cross-repo:** you never entered it — just run `my-command-tools worktree end --branch <branch>` from outside `path`.
   - Either way the verb re-verifies the branch reached origin before removing, and refuses if it hasn't. If it refuses, push first rather than forcing.

## Notes

- Either path ends by delegating to `/task`, so `/task`'s own rules apply: it restates scope, implements, verifies, then runs `/clean` and `/pr`, and it has standing permission to commit on the branch (never on `main`).
- If the feedback request is too vague to act on, ask me one focused clarifying question before setting anything up.
- Report the branch name up front and the PR number/URL at the end (from `/task`/`/pr`), in a **text-only turn** — after the last tool call, never in the same turn as one, or the run is recorded as unfinished even though the feedback shipped.
