---
name: task
description: Take a plain-language task from criteria through implementation, verification, cleanup, and an open pull request.
---

# Task to Pull Request

Parse `--here`, `--base <branch>`, `--draft`, `--sub`, and `--add <skill prompt,...>`; remaining text is the task criteria.

1. Resolve requested add-on skills from the skills installed on this device, read their complete instructions, and place them in the pipeline according to their prompts.
2. Set up the workspace before editing. Unless `--here`, use
   `my-command-tools worktree begin --bootstrap` when available to fetch and
   create a dedicated `.codex/worktrees/<type>/<summary>` worktree from the
   latest requested base. Verify the branch, worktree, and base; never implement
   on the default branch.
3. Run repository bootstrap when available. Otherwise link only ignored environment files, install dependencies separately, and regenerate touched artifacts in the worktree.
4. State the criteria, inspect existing targets, follow `AGENTS.md`, plan
   non-trivial work, reproduce bugs, implement completely, and run
   `my-command-tools verify` when available. Use Codex-native tools in the
   session, including shell/filesystem tools, installed skills, browser or
   computer-use tools for required visual proof, and subagents only when the user
   or repository instructions allow delegation.
5. Add changelog work when the repository tracks it. Commit logical scoped
   changes with explicit paths through `my-command-tools commit` when available;
   never sweep in unrelated work.
6. Use `my-command-tools state` when available for the no-change gate. If the run
   produced no relevant commits or edits, report that the criteria already hold
   and safely remove any worktree.
7. Otherwise run `$clean`, commit any cleanup, then run `$pr`. Run that pair in
   this session by default and delegate it to a single subagent only when `--sub`
   was requested; the order, cleanup commit, and PR result are identical either
   way. After the PR exists, confirm the worktree is clean and its HEAD is on the
   remote branch, remove it from outside the worktree, and report branch, checks,
   commits, PR, and teardown.

Validation limitations do not stop PR creation when useful in-scope recovery is exhausted; document them in the PR. Never force-remove dirty or unpushed work.
