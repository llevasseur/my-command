---
type: feature
title: docs
description: Reconcile an okq doc bundle with the code via /task — refresh stale docs, add docs for undocumented features, prune docs for things that no longer exist.
tags: [command, docs, process]
timestamp: 2026-07-24
updated: 2026-07-28
---

# docs

## Summary

Audits an OKF bundle against its code for stale, missing, and obsolete docs.
It uses [okq](https://github.com/mikevalstar/okq), never `grep`, edits docs only,
and reports code problems rather than changing code. Reconciliation runs through
[task](task.md), which owns the worktree, commits, `/clean`, `/pr`, and teardown;
the default is a fresh worktree off latest `main` and a docs-only PR.

## Flags / Parameters

**Workspace** (passed through to `/task`, same meaning as there):

- `--here` / `-h` — no worktree; reconcile on the **current branch**.
- `--base <branch>` — branch off `<branch>` instead of `main`. Ignored with
  `--here`.
- Neither given: fresh worktree off the latest `main`, on a `docs/<summary>`
  branch.

**Passes and scope** (local to this command — never forwarded to `/task` as
flags):

- `--bundle` / `-b <dir>` — the bundle directory. Default: discovered (the path
  the repo's own docs use, then `docs/`, `.okf/`, `notes/`, then the repo root).
- `--refresh` / `-r` — run only the staleness pass.
- `--add` / `-a` — run only the missing-docs pass.
- `--prune` / `-p` — run only the obsolete-docs pass.
- Pass flags combine; with **none** given, all three run. That's the default.
- `--dry-run` / `-n` — report the plan and change nothing (stops after
  classification).
- `--yes` / `-y` — apply without confirmation, including deletions. Without it,
  every deletion and every doc-vs-code conflict is confirmed first.
- Anything left after flags scopes the run to a concept id, a path/glob, or a
  topic (resolved with `okq search`).

Note that `-a` is overloaded across the two commands: here it is the missing-docs
pass, in `/task` it registers extra commands to weave in.

## Behavior

Pass flags and scope become plain-language `/task` criteria; `/docs` never
creates a second, nested worktree. `--dry-run` skips the handoff and creates no
worktree, commit, or PR.

It locates the bundle and reads its own contract first: frontmatter keys,
generated `index.md` files, folder `_template.md`s, the 1:1 unit documented
(here, one feature doc per command), and docs gates. Those rules win.

Before editing, it inventories concepts with `okq find` and documentable code
units into **CHECK** / **MISSING** / **OBSOLETE**. ADRs, process specs, and index
pages are CHECK-only: never missing or auto-pruned.

The refresh pass audits each doc independently in a fresh subagent, in parallel
batches of about four. Git and frontmatter dates only rank suspicion. The audit
classifies checkable claims—flags, defaults, paths, exit codes, behavior—as
matching, drifted, or wrong with `old → current`, then checks `neighbors` and
`backlinks`. Stale docs are updated; suspected code regressions are flagged
instead, and wrong ADRs are superseded rather than edited.

Every updated or added doc—not an audited-fresh one—gets `dirty: true`, meaning
correct claims whose prose still needs [truncate](truncate.md). `/docs` never
clears it or shortens for style; it reports the dirty count and `/truncate`
invocation without running the separate density pass.

The add pass uses `_template.md` or `okq new`, source actually read, existing
tags, and cross-links. The prune pass repoints renames, never deletes an ADR or
generated index, never equates orphan with obsolete, confirms deletions with
evidence, and uses `git rm`.

Finally it regenerates `okq index`, runs `validate`, `deadlinks --check`,
`orphans`, and repository doc gates until clean, then reports per-doc verdicts
separately from code findings. It edits directly; `/task` commits and opens the
PR.

## Related

- Command source: `src/commands/docs.md`
- Wrapper target: [task](task.md) — owns the worktree, commits, `/clean`, `/pr`,
  and teardown for every non-`--dry-run` `/docs` run; [fb](fb.md) wraps `/task`
  the same way, defaulting to `--here` instead
- Spec: [Adding a command](../specs/adding-a-command.md) — the invariants this
  command audits (a command needs a feature doc; a flag change needs a doc update)
- ADR: [0002 Command docs as okq specs](../adrs/0002-command-docs-as-okq-specs.md)
- Follow-up pass: [truncate](truncate.md) — consumes and clears the `dirty` flag
  this command sets, cutting docs to high-signal tokens without touching a claim
- ADR: [0003 Dirty flag for doc density](../adrs/0003-dirty-flag-for-doc-density.md)
- Related commands: [clean](clean.md) does the same lean-up for comments;
  [changelog](changelog.md) records the change once docs are right
