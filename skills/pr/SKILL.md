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
3. Do not create commits. If the owning workflow asks this skill not to tear down
   its worktree, leave it intact. Otherwise remove a linked worktree only after
   confirming it is clean and its HEAD exists on the remote branch.
4. Report the PR number and URL.
