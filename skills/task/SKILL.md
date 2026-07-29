---
name: task
description: Take a plain-language task from criteria through implementation, verification, cleanup, and an open pull request.
---

# Task to Pull Request

Parse `--here`, `--base <branch>`, `--draft`, and `--add <skill prompt,...>`; remaining text is the task criteria.

1. Resolve requested add-on skills from the skills installed on this device, read their complete instructions, and place them in the pipeline according to their prompts.
2. Set up the workspace before editing. Unless `--here`, fetch and create a dedicated `.codex/worktrees/<type>/<summary>` worktree from the latest requested base. Verify the branch, worktree, and base; never implement on the default branch.
3. Run repository bootstrap when available. Otherwise link only ignored environment files, install dependencies separately, and regenerate touched artifacts in the worktree.
4. State the criteria, inspect existing targets, follow `AGENTS.md`, plan non-trivial work, reproduce bugs, implement completely, and run relevant checks. Use Codex-native tools available in the session, including shell/filesystem tools, installed skills, browser or computer-use tools for required visual proof, and subagents only when the user or repository instructions allow delegation.
5. Add changelog work when the repository tracks it. Commit logical scoped changes with explicit paths; never sweep in unrelated work.
6. If the run produced no relevant commits or edits, report that the criteria already hold and safely remove any worktree.
7. Otherwise run `$clean`, commit any cleanup, then run `$pr`. After the PR exists, confirm the worktree is clean and its HEAD is on the remote branch, remove it from outside the worktree, and report branch, checks, commits, PR, and teardown.

Validation limitations do not stop PR creation when useful in-scope recovery is exhausted; document them in the PR. Never force-remove dirty or unpushed work.
