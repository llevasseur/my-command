---
description: Create or update a PR for the current branch with a concise bulleted description, written directly to GitHub
argument-hint: "[optional title or extra context]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(my-command-tools:*), ExitWorktree
---

You have explicit permission to write the PR description directly to GitHub.

## Flags

Parse these off the front of the `<command-args>` block above; everything else is the title/extra context.

- `--draft` / `-d` — mark the PR as a draft. Default is **not** draft.

## Steps

1. Read the state: `my-command-tools state`. If `onDefaultBranch` is true, stop and tell me to switch to a feature branch first. Note `worktree` — step 4 needs it.
2. Review what changed so the description is accurate. The same `state` output carries `commits` (subject lines since the base) and `diffStat` (per-file added/deleted); pull the actual diff only if those leave you guessing.
3. Write the PR description in **concise bullet-point form** — what changed and why, grouped logically. No filler, no "this PR does X" preamble. Lead with the most important changes. Then apply it:

   ```
   my-command-tools pr --title "<title>" --body - [--draft] [--retitle]
   ```

   with the body on stdin. One call does all of it: pushes the branch, finds the branch's open PR if it has one, and either creates or edits accordingly. It reports `action` (`created`/`updated`), `number`, and `url`.
   - Derive the title from the branch/commits unless I provided one in the arguments. On an **existing** PR the title is left alone unless you pass `--retitle` — add it only if the current title is clearly stale or I gave one.
   - Pass `--draft` when `--draft`/`-d` was given. The verb only ever moves a PR *toward* draft; without the flag an existing draft stays a draft rather than being flipped in front of reviewers early.
   - The verb's own `number`/`url` is the confirmation — **never sleep-poll for the PR to appear** (`sleep 90 && gh pr list …`). A foreground `sleep` is blocked by the harness, and so is a `sleep`-and-check chain; if you genuinely need to wait on a condition, use the `Monitor` tool with an until-loop.
4. If this session is running in a git worktree (`worktree: true` from step 1), remove it now — the branch is already pushed, so removing the local worktree keeps the branch checkout-able later without losing work:
   - Call the `ExitWorktree` tool with `action: "remove"` **and** `discard_changes: true` in the same call. Expect this task's commits to live on the worktree — step 3 pushed them, so force-removing discards only the redundant local copy, not the remote branch. Passing `discard_changes: true` up front avoids the refuse-then-retry round-trip.
   - **If `ExitWorktree` refuses because this session doesn't own the worktree** (it was entered via `EnterWorktree({path})` — e.g. the `/fb --target` flow — rather than created by the tool), don't retry `remove`: call `ExitWorktree` with `action: "keep"`, then remove it with `my-command-tools worktree end --branch <branch>`. That verb re-checks the work is on origin before removing, and refuses if it isn't.
   - If NOT in a worktree, skip this step entirely (do not touch the working tree).
5. Report back the PR number and URL, in a **text-only turn** — after the last tool call, never in the same turn as one, or the run reads as unfinished even though the PR is open.

## Notes

- The `<command-args>` block above, after flags are stripped, is the title and/or extra context for the description.
- Do NOT commit or create new commits — only push existing commits and write the PR metadata.
- Keep bullets terse and technical. Group under short headers if there are many.
