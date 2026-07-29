---
type: feature
title: truncate
description: Rewrite-for-style pass over an okq doc bundle via /task — cut docs to high-signal tokens without losing a claim, driven by the dirty frontmatter flag.
tags: [command, docs, process]
timestamp: 2026-07-28
dirty: true
---

# truncate

## Summary

Cuts docs down to the claims a reader can act on and removes the packaging
around them: narration, restated headings, justification nobody can act on, the
same mechanism explained in three sections. Every claim survives the edit
unchanged — flags, defaults, paths, behavior, guardrails, links.

This is the pass [docs](docs.md) deliberately skips. `/docs` owns
**correctness** and edits prose only where a claim changed; `/truncate` owns
**density** and never touches a claim. The split keeps style churn out of a
correctness PR. Like `/docs`, it runs inside a **`/task` workflow**: it resolves
where the work happens and delegates to [task](task.md), which owns the
worktree, the commits, `/clean`, `/pr`, and teardown — so a run normally ends at
a docs-only PR.

## The `dirty` flag

The two commands are wired together by one frontmatter key:

```yaml
dirty: true
```

`/docs` sets it on every doc it **updates** or **adds** (never on one it audited
and found fresh). It means the doc's claims are correct but its prose has not
been evaluated for density since it changed — a work queue, not a defect.
`/truncate` selects on it, and is the only command that clears it:

    okq --bundle docs find --where dirty=true

No okq change was needed: `find --where <FIELD=VALUE>` reads arbitrary
frontmatter keys, and an unset key simply matches nothing. Hand-edited docs get
the flag too — see [Adding a command](../specs/adding-a-command.md).

Truncating never bumps `updated` / `timestamp`. No claim changed, and those
dates feed `/docs`' staleness ranking, so bumping them would make a doc look
freshly reconciled on the strength of a style edit.

## Flags / Parameters

**Workspace** (passed through to `/task`, same meaning as there):

- `--here` / `-h` — no worktree; truncate on the **current branch**.
- `--base <branch>` — branch off `<branch>` instead of `main`. Ignored with
  `--here`.
- Neither given: fresh worktree off the latest `main`, on a `docs/<summary>`
  branch.

**Selection and scope** (local to this command — never forwarded to `/task` as
flags):

- `--bundle` / `-b <dir>` — the bundle directory. Default: discovered (the path
  the repo's own docs use, then `docs/`, `.okf/`, `notes/`, then the repo root).
- `--all` / `-A` — evaluate every doc, not just the dirty ones. For a bulk
  import or a bundle's first pass. It is `-A` and not `-a` because `-a` already
  means the missing-docs pass in `/docs` and woven-in commands in `/task`.
- `--dry-run` / `-n` — report the queue and proposed cuts, change nothing. No
  worktree, commit, or PR.
- `--yes` / `-y` — apply without pausing at the 40% size guard.
- Anything left after flags scopes the run to a concept id, a path/glob, or a
  topic (resolved with `okq search`). **An explicit scope overrides the dirty
  filter** — those docs are evaluated whether or not they are marked.

## Behavior

Resolves the workspace and hands off first: the selection and scope become plain
language criteria for `/task`, which sets up the worktree (or stays put for
`--here`) and runs the pipeline as its implementation step. `--dry-run`
short-circuits the handoff entirely.

Locates the bundle and reads the bundle's **own** contract first — its
frontmatter keys, its required sections per doc type (a folder `_template.md` is
the clearest statement of these), its generated `index.md` files. Those rules
win. Then it builds the queue: dirty docs by default, everything under `--all`,
or exactly the scoped concepts. Generated index files are always excluded. An
empty queue is a clean result, reported as such.

Each doc is evaluated in **its own fresh subagent** (parallel batches of ~4), so
full doc reads stay out of the main context and only the proposed edit comes
back. Every evaluation starts with a **claim inventory** — commands, flags,
defaults, exit codes, paths, env vars, described behavior and ordering,
guardrails, links — which is the contract the edit must preserve one for one.

Cut: narration and ceremony, justification carrying no actionable claim,
repetition across sections, content duplicated from a linked doc (replaced by
the link), hedging and filler, redundant examples, list items restating their
heading. Kept: every inventoried claim in the same words where the words *are*
the claim, anything non-obvious (gotchas, edge cases, external constraints),
**ADR reasoning** — Context and Consequences are an ADR's payload, and a
decision without its reasoning cannot be revisited — required template sections,
frontmatter `description`, and code blocks, command lines, and tables verbatim.

It never adds anything, never rewrites for voice, and never fixes a claim it
believes is wrong: drift is reported as a `/docs` finding and the words are left
alone.

Applying re-derives the claim inventory from the edited doc and compares it to
the original — a missing claim is a bug in the edit, not a successful
truncation. A doc losing more than 40% of its body is confirmed first unless
`--yes`. The `dirty` key is then removed from every doc evaluated, cut or not.

Finishes by regenerating `okq index`, running `validate` / `deadlinks --check` /
`orphans` until clean (a cut that removed the last inbound link surfaces here as
a new orphan), running the repo's own doc gate, and reporting a table of
doc | verdict (`truncated` / `reviewed` / `deferred`) | lines before → after |
what was cut, plus suspected drift separately. The surrounding `/task` run
commits and opens the PR.

## Related

- Command source: `src/commands/truncate.md`
- Wrapper target: [task](task.md) — owns the worktree, commits, `/clean`,
  `/pr`, and teardown for every non-`--dry-run` run
- Counterpart: [docs](docs.md) — correctness pass; sets the `dirty` flag this
  command consumes and clears
- Sibling: [clean](clean.md) — the same lean-up for **code comments** across a
  branch diff. Doc prose is out of scope there and in scope here
- ADR: [0003 Dirty flag for doc density](../adrs/0003-dirty-flag-for-doc-density.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
