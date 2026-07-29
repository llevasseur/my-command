---
name: truncate
description: Rewrite an okq documentation bundle for density without changing any claim, using dirty frontmatter as the default work queue.
---

# Truncate Documentation

Parse `--here`, `--base <branch>`, `--bundle <dir>`, `--all`, `--dry-run`,
`--yes`, and optional scope. Except for dry run, hand the resolved density-pass
criteria to `$task`; it owns workspace setup, commits, `$clean`, `$pr`, and
teardown.

1. Discover the bundle with `okq`, read its contract and templates, and resolve
   installed okq reference/maintenance skills when available.
2. Build the queue from `dirty: true` by default, every concept with `--all`, or
   exactly the explicit id/path/topic scope. Exclude generated indexes. An empty
   queue is a successful no-op.
3. Evaluate each doc independently, using Codex subagents in parallel only when
   delegation is allowed. Inventory every actionable claim first: commands,
   flags, defaults, paths, environment variables, behavior, ordering,
   guardrails, links, and non-obvious constraints.
4. Cut narration, ceremony, unactionable justification, repetition, filler, and
   redundant examples. Preserve every inventoried claim, required section, ADR
   rationale, frontmatter description, command line, code block, and table.
   Never fix suspected drift, add claims, rewrite voice, or bump timestamps.
5. Re-derive the claim inventory after each edit and restore anything missing.
   Confirm cuts over 40% unless `--yes`. Remove `dirty` from every evaluated doc;
   dry run changes nothing.
6. Regenerate indexes and run bundle validation, deadlink, orphan, and repository
   doc gates. Report verdict and before/after size per doc, plus suspected drift
   left for `$docs`.

Use `okq` for bundle queries rather than text grep. Quote glob-bearing arguments
for zsh. The goal is higher signal per token, not shorter text at any cost.
