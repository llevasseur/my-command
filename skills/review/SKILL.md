---
name: review
description: Independently review an open pull request, produce actionable feedback, and apply validated findings on its existing branch.
---

# Review and Apply Feedback

Parse `--target <PR-number-or-branch>`, `--here`, and optional focus. Resolve the PR with `gh`; never approve, comment on, or merge it.

1. Unless valid here mode targets the current branch's PR, fetch and use a fresh existing-branch worktree under `.codex/worktrees/`.
2. Independently inspect the PR body, full diff, repository instructions, surrounding code, and relevant checks. Verify every finding and cover correctness, regressions, security, reliability, conventions, generated output, and docs.
3. Report concrete path-anchored findings. If findings exist, compose and execute one `$fb` request in the same PR workspace; if clean, say no feedback run is needed.
4. Let `$fb`/`$task` own commits, cleanup, PR update, and teardown. Report the final PR state in a text-only outcome.

Use `my-command-tools state`, `verify`, and worktree operations when available.
