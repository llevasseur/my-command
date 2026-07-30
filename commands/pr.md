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
   - **Assets already in the description are kept — always.** Before editing, the verb reads the PR's current body and carries every image, video, and GitHub attachment link it finds into the new one, appending any your rewrite left out under an `## Assets` heading. Write the description from the diff as you normally would: don't re-paste assets by hand, don't try to preserve them yourself, and never justify dropping one because it isn't in your bullets. An update reports how many it carried over as `assetsPreserved`.
   - Pass `--draft` when `--draft`/`-d` was given. The verb only ever moves a PR *toward* draft; without the flag an existing draft stays a draft rather than being flipped in front of reviewers early.
   - **Never take a PR out of draft.** Updating a draft PR updates its body (and title with `--retitle`) and nothing else — its draft state is not yours to change here. Do not run `gh pr ready`, and do not "helpfully" mark it ready because the work looks finished; only `/my-command:god` promotes a draft, deliberately, right before merging.
   - The verb's own `number`/`url` is the confirmation — **never sleep-poll for the PR to appear** (`sleep 90 && gh pr list …`). A foreground `sleep` is blocked by the harness, and so is a `sleep`-and-check chain; if you genuinely need to wait on a condition, use the `Monitor` tool with an until-loop.
4. If this session is running in a git worktree (`worktree: true` from step 1), teardown is yours **only if this session created that worktree and no command that invoked you owns its teardown**:
   - **Dispatched as a subagent? Skip teardown entirely.** `/my-command:task --sub` Step 3 runs `/my-command:clean` + `/my-command:pr` in a fresh subagent and removes the worktree itself once you return; any other command that hands you a workspace it set up works the same way. You are not the owner, `ExitWorktree` will refuse, and `git worktree remove` refuses too while the owning session's liveness lock is live — so don't call either. Report the PR and leave the directory alone.
   - **Invoked inline by a command that owns the worktree? Skip it too.** Without `--sub`, `/my-command:task` runs `/my-command:clean` + `/my-command:pr` inline, so you're in the very session that created the worktree and `ExitWorktree` would not refuse — but teardown is still that command's Step 3, immediately after you return, and it has a push check to run first. Report the PR and leave the workspace alone.
   - **Otherwise remove it** — the branch is already pushed, so dropping the local copy keeps the branch checkout-able later without losing work. Call the `ExitWorktree` tool with `action: "remove"` **and** `discard_changes: true` in the same call. Expect this task's commits to live on the worktree — step 3 pushed them, so force-removing discards only the redundant local copy, not the remote branch. Passing `discard_changes: true` up front avoids the refuse-then-retry round-trip.
   - **If `ExitWorktree` refuses because this session doesn't own the worktree**, don't retry `remove`. Call `ExitWorktree` with `action: "keep"` to step back out, then try `my-command-tools worktree end --branch <branch>` — that verb re-checks the work is on origin before removing, and it is the right follow-up when you merely entered a pre-existing worktree via `EnterWorktree({path})` (e.g. the `/my-command:fb --target` flow). If git refuses that too because another running session still holds the worktree, **stop**: that session owns the cleanup and removes it on exit. Report the path as left in place, and never force past a live lock.
   - If NOT in a worktree, skip this step entirely (do not touch the working tree).
5. Report back the PR number and URL, in a **text-only turn** — after the last tool call, never in the same turn as one, or the run reads as unfinished even though the PR is open.

## Notes

- The `<command-args>` block above, after flags are stripped, is the title and/or extra context for the description.
- Do NOT commit or create new commits — only push existing commits and write the PR metadata.
- Keep bullets terse and technical. Group under short headers if there are many.
