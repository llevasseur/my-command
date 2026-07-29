---
name: pr
description: Create or update the current branch's pull request with a concise, accurate description.
---

# Pull Request

Parse `--draft` / `-d`; treat remaining text as optional title or context.

1. Refuse the default branch. Push the current branch to its named remote without embedding credentials.
2. Resolve an existing PR, then derive an accurate title and concise bulleted body from commits and the full branch diff.
3. Create the PR against the remote default branch, or update the existing PR without replacing unrelated existing body assets. Convert to draft only when requested; never silently mark a draft ready.
4. Do not create commits. If the owning workflow asks this skill not to tear down its worktree, leave it intact. Otherwise remove a linked worktree only after confirming it is clean and its HEAD exists on the remote branch.
5. Report the PR number and URL.
