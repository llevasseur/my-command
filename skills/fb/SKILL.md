---
name: fb
description: Implement feedback through the task workflow on the current branch or an existing target branch.
---

# Apply Feedback

Parse `--target <branch>` / `-t <branch>` and treat the remaining prompt as task criteria.

- Without a target, invoke `$task --here <feedback>` in the current checkout.
- With a target, fetch and verify the existing local or remote branch, then use
  `my-command-tools worktree begin --existing` when available to create a fresh
  worktree at `.codex/worktrees/<safe-branch>` without creating a new branch.
  Work there and invoke `$task --here <feedback>`.

Never create a missing target branch. The `$task` workflow owns implementation, verification, commits, `$clean`, `$pr`, and safe worktree teardown. Report the branch before work and the PR number and URL at completion.
