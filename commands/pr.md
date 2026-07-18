---
description: Create or update a PR for the current branch with a concise bulleted description, written directly to GitHub
argument-hint: "[optional title or extra context]"
allowed-tools: Bash(git:*), Bash(gh:*), ExitWorktree
---

You have explicit permission to write the PR description directly to GitHub.

## Flags

Parse these off the front of $ARGUMENTS; everything else is the title/extra context.

- `--draft` / `-d` — mark the PR as a draft. Default is **not** draft.

## Steps

1. Determine current branch: `git rev-parse --abbrev-ref HEAD`. If it's `main`, stop and tell me to switch to a feature branch first.
2. Push the branch if needed: `git push -u origin HEAD`.
3. Check whether a PR already exists for this branch: `gh pr view --json number,url,title,isDraft 2>/dev/null`.
4. Review what changed so the description is accurate: `git log main..HEAD --oneline` and `git diff main...HEAD --stat`.
5. Write the PR description in **concise bullet-point form** — what changed and why, grouped logically. No filler, no "this PR does X" preamble. Lead with the most important changes.
6. Apply it:
   - **If a PR exists:** `gh pr edit <number> --body "..."` (and `--title` only if clearly stale or if I gave a title in $ARGUMENTS). If `--draft`/`-d` was given and the PR is not already a draft, also run `gh pr ready <number> --undo` to convert it to a draft. Without the flag, leave its draft state as-is (don't flip an existing draft to ready).
   - **If no PR exists:** `gh pr create --title "..." --body "..."` with `--base main`, adding `--draft` when `--draft`/`-d` was given. Derive the title from the branch/commits unless I provided one in $ARGUMENTS.
7. If this session is running in a git worktree, remove it now — the branch is already pushed to origin, so removing the local worktree keeps the branch checkout-able later without losing work:
   - Detect it: `git rev-parse --git-common-dir` and `git rev-parse --git-dir` return different paths when in a linked worktree (they're equal in the main working tree).
   - If in a worktree, call the `ExitWorktree` tool with `action: "remove"` **and** `discard_changes: true` in the same call. Expect this task's commits to live on the worktree — they were pushed to origin in step 2, so force-removing discards only the redundant local copy, not the remote branch. Passing `discard_changes: true` up front avoids the refuse-then-retry round-trip.
   - **If `ExitWorktree` refuses because this session doesn't own the worktree** (it was entered via `EnterWorktree({path})` — e.g. the `/my-command:fb --target` flow — rather than created by the tool), don't retry `remove`: call `ExitWorktree` with `action: "keep"`, confirm the commits are on origin (`git log origin/<branch> -1`), then remove it manually with `git worktree remove <path>`.
   - If NOT in a worktree, skip this step entirely (do not touch the working tree).
8. Report back the PR number and URL.

## Notes

- $ARGUMENTS, after flags are stripped, is the title and/or extra context for the description.
- Do NOT commit or create new commits — only push existing commits and write the PR metadata.
- Keep bullets terse and technical. Group under short headers if there are many.
