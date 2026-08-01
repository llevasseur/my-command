---
description: Implement a feedback request via /my-command:task — on the current branch by default, or inside a worktree of a named existing branch with --target
argument-hint: "[--target|-t <branch>] <feedback request>"
---

Implement a feedback request. This is a thin wrapper around `/my-command:task`: it decides **where** the work happens, then hands the feedback to `/my-command:task` to take it from criteria to a PR.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the **feedback request** (the task criteria for `/my-command:task`).

## Flags

- `--target <branch>` / `-t <branch>` — apply the feedback onto an **existing** branch inside a fresh worktree.
- Anything not a recognized flag is part of the feedback request.

## Behavior

### Default (no `--target`)

Run `/my-command:task --here <feedback request>` on the **current branch**.

- `/my-command:task -h` stays on the current branch and does not create a worktree.
- If the current branch is `main` (or the repo's default branch), `/my-command:task` will create a feature branch in place — that's expected; let it.

### `--target <branch>` / `-t <branch>` given

If the target repo is not the repo this session started in, prefer starting a new session in the target repo. Otherwise, use the steps below without `EnterWorktree`: do all work through absolute paths under the returned `path`, then tear down with `my-command-tools worktree end`, which re-verifies the branch reached origin before removing it.

1. `my-command-tools worktree begin --branch <branch> --existing --bootstrap`. It fetches first, then checks out that **existing** branch into a worktree and reports the `path`. `--existing` is what makes this safe: without it the verb would create a new branch, silently abandoning the work already on `<branch>`.
   - If it errors with `branch does not exist locally or on origin`, stop and tell me — do **not** create a new branch. This flag is for applying feedback onto existing work.
   - If it says the branch is already used by a worktree, do **not** retry `worktree begin`: inspect `my-command-tools worktree list`, validate the reported owner path and branch, then work in that existing checkout when it is this run's target. A live owner belonging to another session is a stop, not a reason to force or remove the worktree.
2. When the target and session-start repo are the same, switch into the reported `path` with the `EnterWorktree` tool. For a cross-repo run, stay outside it and use absolute paths under `path`.
3. Run `/my-command:task --here <feedback request>` against the reported worktree: from inside it for a same-repo run, or through its absolute paths for a cross-repo run. `-h` keeps `/my-command:task` on the checked-out branch — no nested worktree, no new branch.
4. Tear the worktree down yourself once `/my-command:task` reports the PR — **`/my-command:pr` will not do it for you.** It skips teardown for any worktree its session didn't create, and this one is yours.
   - **Same repo:** you entered it with `EnterWorktree({path})`, so `ExitWorktree` refuses to remove it. Call `ExitWorktree` with `action: "keep"` to step back out to the original checkout, then run `my-command-tools worktree end --branch <branch>` from there.
   - **Cross-repo:** you never entered it — just run `my-command-tools worktree end --branch <branch>` from outside `path`.
   - Either way the verb re-verifies the branch reached origin before removing, and refuses if it hasn't. If it refuses, push first rather than forcing.

## Notes

- Either path ends by delegating to `/my-command:task`, so `/my-command:task`'s own rules apply.
- If the feedback request is too vague to act on, ask me one focused clarifying question before setting anything up.
- Report the branch name up front and the PR number/URL at the end (from `/my-command:task`/`/my-command:pr`). <!-- include: shared/text-only-turn.md -->Deliver that report in a **text-only turn** — after the last tool call, never in the same turn as one, or the run is recorded as unfinished even though the work landed.<!-- /include -->
