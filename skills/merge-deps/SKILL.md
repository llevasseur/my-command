---
name: merge-deps
description: Safely batch-merge open dependency pull requests with conflict resolution and isolated verification.
---

# Merge Dependency Pull Requests

Parse `--label <name>` (default `dependencies`), one merge method (default squash), `--auto`, and `--dry-run`.

1. Confirm authenticated git and GitHub CLI state, no unrelated in-progress merge, and a clean worktree. Fetch and fast-forward the default branch.
2. List open non-draft PRs against the default branch with the label. Skip forks, sort oldest first, and make dry run report-only.
3. Process one PR fully before the next: fetch its head freshly, invoke `$mc --target <branch>`, and skip unresolved conflicts.
4. Verify in `.codex/worktrees/deps-<safe-branch>` using repository bootstrap and fast checks. Remove it only after confirming it has no authored or unpushed work.
5. Merge through `gh pr merge`, respecting branch protection. Refresh the default branch between PRs and report merged, queued, conflict-resolved, and blocked items.
