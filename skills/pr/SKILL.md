---
name: pr
description: Create or update the current branch's pull request with a concise, accurate description.
---

# Pull Request

Parse `--draft` / `-d`; treat remaining text as optional title or context.

1. Refuse the default branch. Derive an accurate title and concise bulleted body
   from commits and the full branch diff.
2. Use `my-command-tools pr` when available to push and create or update the PR
   without embedding credentials. Preserve existing body assets. Convert to
   draft only when requested; never silently mark a draft ready.
   - A `must be a collaborator` GraphQL error is the wrong identity, not a
     permission to request. `gh`'s GraphQL-backed writes (`gh pr create`,
     `gh pr edit`) resolve to an account that is not a collaborator on
     `llevasseur`-owned repos, while REST succeeds. Select the right account
     (`gh auth switch`, or `GH_TOKEN="$(gh auth token --user llevasseur)"`) or use
     the REST equivalent.
3. Do not create commits. If the owning workflow asks this skill not to tear down
   its worktree, leave it intact. Otherwise remove a linked worktree only after
   confirming it is clean and its HEAD exists on the remote branch.
   - Remove a worktree through the same mechanism that created it. One this
     session merely entered is not owned by the session worktree tool; step back
     out, then remove it through the repository helper from outside the worktree,
     which re-verifies the branch reached origin. If another live session still
     holds it, stop and report the path as left in place.
4. Report the PR number and URL.

## Git call shape

- A classifier refusal is not evidence that repository protections should be
  weakened. Inspect the refused command first; when the intended operation is
  safe and the refusal looks incidental to the command's shape — an over-broad
  chain, pipe, or extra flag — retry only the smallest exact command, never an
  allowlisted Bash pattern or a permission-settings change.
