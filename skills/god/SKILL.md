---
name: god
description: Take a task unattended through implementation, review, CI repair, merge into the default branch, and local default-branch update.
---

# Unattended Task to Merge

Use only when the user explicitly invokes `$god`, `/god`, or requests an unattended task-to-merge workflow. Parse task workspace flags, `--auto`, merge method, `--fix <n>`, and `--no-review`; reject draft mode.

1. Record the main checkout and task branch. Invoke `$task` with `--sub` so its
   cleanup and PR stage runs as one delegated subagent, weaving in
   `$review --here` there unless disabled, and require the resulting PR to belong
   to this run's branch.
2. Re-resolve the PR from GitHub. Detect default-branch conflicts locally with `git merge-tree --write-tree`; invoke `$mc --target <branch>` when needed and stop on unresolved conflicts.
3. Unless `--auto`, watch required checks without foreground sleeps. For red CI, inspect the failing job log and spend at most the requested repair rounds through `$fb --target <branch>`.
4. Merge with `gh pr merge` using the requested method and branch protection. Never use `--admin`, force-push, or push directly to the default branch. If checks are pending, enable auto-merge; if the base moved, refresh conflicts once.
5. Fast-forward the local default branch in the recorded main checkout. Stop on divergence.
6. Report task, review, repairs, checks, merge, and local update in a final text-only outcome.

Use `my-command-tools doctor`, `state`, and `verify` for deterministic repository checks when available.
