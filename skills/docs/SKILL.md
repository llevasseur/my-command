---
name: docs
description: Reconcile an okq documentation bundle with the code by refreshing stale docs, adding missing docs, and pruning obsolete docs.
---

# Reconcile Documentation

Parse `--here`, `--base <branch>`, `--dry-run`, `--bundle <dir>`, pass filters, `--yes`, and optional scope. Except for dry run, hand the complete reconciliation criteria to `$task` so it owns workspace, commits, `$clean`, and `$pr`.

1. Discover the bundle and read its own contract, templates, generated indexes, and validation commands.
2. Inventory documentable code concepts and classify docs as check, missing, or obsolete before editing.
3. Refresh docs by comparing claims to current code. Use git history only to rank suspicion; verify flags, defaults, paths, behavior, and neighboring references directly.
4. Add missing docs using bundle templates. Treat ADRs as immutable decisions: supersede rather than rewrite.
5. Prune only with evidence that the documented concept is gone; repoint renames instead of deleting them.
6. Regenerate indexes, run bundle validation, and report stale, added, pruned, and intentionally retained docs. Dry run reports the plan without mutation.
