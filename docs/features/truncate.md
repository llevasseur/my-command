---
type: feature
title: truncate
description: Rewrite-for-style pass over an okq doc bundle via /task — cut docs to high-signal tokens without losing a claim, driven by the dirty frontmatter flag.
tags: [command, docs, process]
timestamp: 2026-07-28
---

# truncate

## Summary

Cuts narration, restated headings, unactionable justification, and repeated
mechanisms while preserving every claim—flags, defaults, paths, behavior,
guardrails, and links. [docs](docs.md) owns correctness; `/truncate` owns
density, keeping style churn out of correctness PRs. It delegates worktree,
commit, `/clean`, `/pr`, and teardown to [task](task.md), so a run normally ends
at a docs-only PR.

## The `dirty` flag

The two commands are wired together by one frontmatter key:

```yaml
dirty: true
```

`/docs` sets it on updated or added docs, never audited-fresh ones. It is a work
queue for correct claims whose prose needs density review. `/truncate` selects
and exclusively clears it:

    okq --bundle docs find --where dirty=true

`find --where <FIELD=VALUE>` reads arbitrary frontmatter keys; an unset key
matches nothing. Hand-edited docs also get the flag; see
[Adding a command](../specs/adding-a-command.md).

Truncating never bumps `updated` / `timestamp`: no claim changed, and those
dates rank `/docs` staleness.

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

Selection and scope become plain-language `/task` criteria; `--dry-run` skips
the handoff.

It reads the bundle's own frontmatter, required sections (`_template.md` where
present), and generated indexes first; those rules win. The queue is dirty docs
by default, all docs with `--all`, or exactly the explicit scope. Generated
indexes are excluded; an empty queue is a reported clean result.

Each doc is evaluated in a fresh subagent, in parallel batches of about four, so
only its proposed edit returns to the main context. Evaluation starts with a
claim inventory: commands, flags, defaults, exit codes, paths, environment
variables, behavior, ordering, guardrails, and links.

It cuts narration, ceremony, unactionable justification, repetition, linked-doc
duplication (replaced by its link), hedging, filler, redundant examples, and
heading-restating items.
It preserves every claim in the same words where wording is material,
non-obvious constraints and edge cases, ADR Context and Consequences, required
sections, frontmatter `description`, and code blocks, command lines, and tables
verbatim.

It never adds anything, never rewrites for voice, and never fixes a claim it
believes is wrong: drift is reported as a `/docs` finding and the words are left
alone.

After editing it re-derives and compares the inventory; a missing claim is a
bug. Cuts over 40% require confirmation unless `--yes`. Every evaluated doc
loses `dirty`, whether cut or merely reviewed.

Finally it regenerates `okq index`; runs `validate`, `deadlinks --check`,
`orphans`, and repository doc gates until clean; and reports each doc's verdict
(`truncated`, `reviewed`, or `deferred`), before/after lines, and cuts, with
suspected drift separate. A lost last inbound link appears as a new orphan.
`/task` commits and opens the PR.

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
