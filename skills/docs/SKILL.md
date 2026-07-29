---
name: docs
description: Reconcile an okq documentation bundle with the code by refreshing stale docs, adding missing docs, and pruning obsolete docs.
---

# Reconcile Documentation

Parse `--here`, `--base <branch>`, `--dry-run`, `--bundle <dir>`, pass filters, `--yes`, and optional scope. Except for dry run, hand the complete reconciliation criteria to `$task` so it owns workspace, commits, `$clean`, and `$pr`.

1. Discover the bundle and read its own contract, templates, generated indexes, and validation commands.
2. Inventory documentable code concepts and classify docs as check, missing, or obsolete before editing.
3. Refresh docs by comparing claims to current code. Use git history only to rank suspicion; verify flags, defaults, paths, behavior, and neighboring references directly. Edit prose only where a claim changed, then set top-level `dirty: true` so `$truncate` can perform the separate density pass. Preserve an existing dirty flag; never clear it here.
4. Add missing docs using bundle templates and start each new doc with `dirty: true`. Treat ADRs as immutable decisions: supersede rather than rewrite. Audited-but-unchanged docs are not dirty, and dry runs set nothing.
5. Prune only with evidence that the documented concept is gone; repoint renames instead of deleting them.
6. Regenerate indexes, run bundle validation, and report stale, added, pruned, and intentionally retained docs, followed by the dirty queue count and the `$truncate` invocation that would clear it. Dry run reports the plan without mutation.

The bundle's own contract wins if it uses a different density-work-queue key.
