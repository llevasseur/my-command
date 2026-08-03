---
type: feature
title: truncate
description: Rewrite-for-style pass over an okq doc bundle via /task — cut docs to high-signal tokens without losing a claim, driven by the dirty frontmatter flag.
tags: [command, docs, process]
timestamp: 2026-07-28
updated: 2026-08-02
dirty: true
---

# truncate

## Summary

Cuts narration, restated headings, unactionable justification, and repeated
mechanisms while preserving every claim—flags, defaults, paths, behavior,
guardrails, and links. [docs](docs.md) runs these rules after reconciling
correctness. Standalone `/truncate` applies density alone to hand edits, an
explicit scope, or a whole-bundle sweep. It delegates worktree, commit,
`/clean`, `/pr`, and teardown to [task](task.md), so a run normally ends at a
docs-only PR.

## The `dirty` flag

The two commands are wired together by one frontmatter key:

```yaml
dirty: true
```

`/docs` sets it on updated or added docs, never audited-fresh ones, and consumes
the resulting queue in its final phase. It is a work queue for correct claims
whose prose needs density review. Standalone `/truncate` selects and clears the
same queue:

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
variables, behavior, ordering, guardrails, links, and the force of an
instruction (must, should, or may).

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

A sentence it does shorten comes out against a stated vocabulary standard: one
instruction per sentence; one term per concept; the warning before the step it
guards; active voice and imperative for an action; literal wording over idiom;
at most three nouns in a row; explicit conjunction scope; and uppercase
MUST / MUST NOT / SHOULD / MAY ([RFC 2119](https://www.rfc-editor.org/rfc/rfc2119))
where the obligation is the point. These govern how an already-cut sentence
comes out and do not license a voice rewrite. Force is part of the claim, so
`must`, `should`, and `may` survive at their original strength. The rules come
from [ASD-STE100](https://asd-ste100.org) Simplified Technical English; its
closed ~900-word dictionary, sentence-length caps, and tense restrictions are
deliberately not adopted, because they serve a human reader with a limited
English vocabulary and cost precision here. That list lives once, in
`src/shared/rewrite-toward.md`; this command and [docs](docs.md) Step 6 both take
it as a `<!-- include-block: -->`, so neither can drift from the other.

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
- Complete workflow: [docs](docs.md) — reconciles correctness, then runs these
  density rules inline over the resulting dirty queue
- Sibling: [clean](clean.md) — the same lean-up for **code comments** across a
  branch diff. Doc prose is out of scope there and in scope here
- ADR: [0004 Docs completes the density pass](../adrs/0004-docs-completes-density-pass.md)
- Superseded ADR: [0003 Dirty flag for doc density](../adrs/0003-dirty-flag-for-doc-density.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
