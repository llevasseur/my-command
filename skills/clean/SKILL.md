---
name: clean
description: Clean up comments across a branch's committed and uncommitted changes without altering behavior.
---

# Clean Comments

Only touch comments—never code, logic, formatting, or behavior.

1. Resolve the target branch from the request or use the current branch. Do not switch branches.
2. Diff from the target's merge base with its upstream, plus staged and unstaged changes when the target is current.
3. Inspect only comments on added or modified lines; ignore generated files and out-of-scope earlier work. Markdown prose is always out of scope because `$truncate` owns density with claim-preservation rules; comments inside fenced code blocks are out of scope too.
4. Delete comments that restate code or narrate steps. Tighten verbose comments to the essential fact. Preserve licenses, directives, annotations, non-obvious constraints, JSX structural labels, and load-bearing empty-block comments.
5. Never add comments. Report removed and tightened counts by file.
6. Do not commit — a rule scoped to this skill, not to whatever invoked it. The edits are left for the invoking workflow to commit as part of its own run; when one invoked you, hand back and continue it at its next step instead of stopping at uncommitted cleanup. If the invoker never says who commits, flag the uncommitted edits in the summary.
7. Teardown is never yours. Never remove a worktree here, by any route — whoever invoked this skill owns that workspace and its teardown.
