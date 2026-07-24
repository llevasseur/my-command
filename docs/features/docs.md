---
type: feature
title: docs
description: Reconcile an okq doc bundle with the code via /task — refresh stale docs, add docs for undocumented features, prune docs for things that no longer exist.
tags: [command, docs, process]
timestamp: 2026-07-24
updated: 2026-07-24
---

# docs

## Summary

Audits a repo's OKF doc bundle against the code it describes and fixes the three
ways docs rot: a doc that no longer matches the code (**stale**), a feature with
no doc at all (**missing**), and a doc for something that was removed
(**obsolete**). Built on [okq](https://github.com/mikevalstar/okq) — it explores,
writes, and gates the bundle with `okq`, never `grep`. Edits docs only; code
problems are reported, not changed.

The reconciliation runs inside a **`/task` workflow**: `/docs` resolves where the
work happens and delegates the passes to [task](task.md), which owns the
worktree, the commits, `/clean`, `/pr`, and teardown. Like `/task`, it defaults
to a fresh worktree off the latest `main`, so a `/docs` run normally ends at a
docs-only PR.

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

First resolves the workspace and hands off: the pass flags and scope become plain
language criteria for `/task`, which sets up the worktree (or stays put for
`--here`), then runs the pipeline below as its implementation step and finishes
with `/clean` and `/pr`. `/docs` never creates a worktree itself — doing both
would nest one inside another. `--dry-run` short-circuits the handoff entirely:
it stays in the current checkout, reports the plan, and creates no worktree,
commit, or PR.

Locates the bundle, then reads the bundle's **own** contract first — its
frontmatter keys, generated `index.md` files, folder `_template.md`s, the 1:1
unit it documents (here: one feature doc per command), and any docs gate script
or CI job. Those rules win over the command's defaults.

It then inventories both sides — every concept via `okq find`, every documentable
unit in the code — and reconciles them into **CHECK** / **MISSING** /
**OBSOLETE** before editing anything. ADRs, process specs, and index pages are
CHECK-only: never "missing", never auto-pruned.

The refresh pass audits docs **one at a time**, each in its own fresh subagent
(parallel batches of ~4) so full doc + implementation reads stay out of the main
context. Git recency and frontmatter dates only rank suspicion; the real audit
extracts each doc's checkable claims (flags, defaults, paths, exit codes,
behavior) and marks them matches / drifted / wrong with `old → current`, then
re-checks `neighbors` and `backlinks` for the same drift. A stale doc is updated;
code that looks like the regression is **flagged for the user**, not blessed by
rewriting the doc; a wrong ADR is superseded, never edited.

The add pass scaffolds from a bundle-local `_template.md` or `okq new`, fills it
from source actually read, reuses existing tags, and cross-links so the doc isn't
born an orphan. The prune pass treats a rename as a rename (repoint links, don't
delete), never deletes an ADR or a generated index, never equates orphan with
obsolete, confirms each deletion with evidence, and removes with `git rm`.

Finishes by regenerating `okq index`, running `validate` / `deadlinks --check` /
`orphans` until clean, running the repo's own doc gate, and reporting a
doc-by-doc verdict table plus code-side findings separately. Applies edits
directly; the surrounding `/task` run commits them and opens the PR.

## Related

- Command source: `src/commands/docs.md`
- Wrapper target: [task](task.md) — owns the worktree, commits, `/clean`, `/pr`,
  and teardown for every non-`--dry-run` `/docs` run; [fb](fb.md) wraps `/task`
  the same way, defaulting to `--here` instead
- Spec: [Adding a command](../specs/adding-a-command.md) — the invariants this
  command audits (a command needs a feature doc; a flag change needs a doc update)
- ADR: [0002 Command docs as okq specs](../adrs/0002-command-docs-as-okq-specs.md)
- Related commands: [clean](clean.md) does the same lean-up for comments;
  [changelog](changelog.md) records the change once docs are right
