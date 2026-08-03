---
name: docs
description: Reconcile an okq documentation bundle with the code, then truncate its dirty docs for density without changing claims.
---

# Reconcile Documentation

Parse `--here`, `--base <branch>`, `--dry-run`, `--bundle <dir>`, pass filters, `--yes`, and optional scope. Except for dry run, hand the complete reconciliation-and-density criteria to `$task` so it owns workspace, commits, `$clean`, and `$pr`. Run the density phase inline in that task; do not invoke `$truncate` and create a nested task.

1. Discover the bundle and read its own contract, templates, generated indexes, and validation commands.
2. Inventory documentable code concepts and classify docs as check, missing, or obsolete before editing.
3. Refresh docs by comparing claims to current code. Use git history only to rank suspicion; verify flags, defaults, paths, behavior, and neighboring references directly. Edit prose only where a claim changed, then set top-level `dirty: true` for the final density phase. Preserve an existing dirty flag during reconciliation.
4. Add missing docs using bundle templates and start each new doc with `dirty: true`. Treat ADRs as immutable decisions: supersede rather than rewrite. Audited-but-unchanged docs are not dirty, and dry runs set nothing.
5. Prune only with evidence that the documented concept is gone; repoint renames instead of deleting them.
6. Run the `$truncate` density rules inline over the resulting dirty queue, including dirty docs that predated this run. Exclude generated indexes. Inventory every actionable claim before cutting narration, repetition, filler, and redundant examples; preserve all claims, required sections, ADR reasoning, frontmatter descriptions, commands, code blocks, and tables. Re-derive the inventory after editing. Use `--yes` for the existing over-40% size guard. Do not fix suspected drift or bump claim timestamps. Remove `dirty` from every evaluated doc, including an already-lean doc. Treat an instruction's force as part of its claim, and shorten a surviving sentence toward the `$truncate` forms: one instruction per sentence; one term per concept; the warning before the step it guards; active voice and imperative for an action; literal wording over idiom; at most three nouns in a row; explicit conjunction scope; uppercase MUST, MUST NOT, SHOULD, and MAY (RFC 2119) at the doc's existing force. These govern only a sentence already being cut and never license a voice rewrite. Do not adopt ASD-STE100's closed dictionary, sentence-length caps, or tense restrictions.
7. Regenerate indexes, run bundle validation and repository doc gates, and report reconciliation verdicts plus density verdicts and before/after sizes. Report any deferred dirty docs as incomplete work; a successful run leaves the dirty queue empty. Dry run reports the reconciliation plan and projected density queue without mutation.

The bundle's own contract wins if it uses a different density-work-queue key.
