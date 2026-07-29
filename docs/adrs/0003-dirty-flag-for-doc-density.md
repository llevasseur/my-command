---
type: adr
title: A dirty frontmatter flag hands changed docs to a separate density pass
description: Track docs whose prose has not been evaluated since it changed with dirty:true, and split the density rewrite out of the correctness pass into /truncate.
tags: [process, docs, commands]
timestamp: 2026-07-28
---

# A dirty frontmatter flag hands changed docs to a separate density pass

## Status

Accepted.

## Context

[docs](../features/docs.md) reconciles the bundle against the code, and it
deliberately stops at correctness: "edit prose only where a claim changed. This
pass is not a rewrite-for-style pass." Nothing else covered density either —
[clean](../features/clean.md) is scoped to comments in code across a branch
diff, and Markdown prose has no comments. So a doc could be perfectly accurate
and still cost three times the tokens it needed, and nothing in the suite would
ever notice.

Merging the density rewrite into `/docs` was the obvious fix and the wrong one.
The two passes have opposite relationships to a claim: the correctness pass
*changes* claims and may make a doc longer to do it, while the density pass must
preserve every claim exactly. Running them together produces a diff where a
genuine correction is indistinguishable from a paraphrase, which is the review
problem that makes doc PRs get rubber-stamped.

That leaves the question of which docs a separate pass should look at. Re-reading
the whole bundle every run is expensive and mostly wasted — a doc nobody has
touched since it was last tightened is still tight. Git recency (`git log -1`
per doc) was the alternative signal, but it can't distinguish a claim edit from a
whitespace fix or a link repoint, and it goes stale the moment the doc is
committed for any reason.

## Decision

Track the queue explicitly in frontmatter.

- `/docs` sets `dirty: true` on every doc it **updates** or **adds**, and on
  nothing else. The flag means: the claims are correct, the prose has not been
  evaluated for density since it changed.
- A new command, [truncate](../features/truncate.md), selects on that flag
  (`okq --bundle docs find --where dirty=true`), cuts packaging without touching
  a claim, and is the only thing that clears the key.
- Hand-edited docs get the flag too, per
  [Adding a command](../specs/adding-a-command.md), so the queue reflects every
  change and not just agent-driven ones.
- Truncating does **not** bump `updated` / `timestamp`. Those dates feed `/docs`'
  staleness ranking; bumping them on a style edit would push a doc down the audit
  queue without any claim having been re-verified.

okq needs no change. `okq find --where <FIELD=VALUE>` (0.5.0) matches arbitrary
frontmatter keys, `validate` accepts keys beyond the OKF core, and an unset key
matches nothing rather than erroring — so the convention rides on existing
behavior.

## Consequences

Density work is bounded to what actually changed, and the audit trail is visible
in the file itself rather than inferred from git. Correctness PRs and density
PRs stay separate and separately reviewable.

The cost is a flag that only stays honest if `/docs` sets it and `/truncate`
clears it — a hand-edited doc that skips the convention is silently missing from
the queue, and the only symptom is a doc that never gets tightened. The
`--all` / `-A` sweep exists as the recovery path for exactly that drift.

Docs will also sit `dirty: true` in `main` between the two runs. That is
intended: the flag is a queue, not a defect, and a bundle with no dirty docs is
simply one whose density pass has caught up.
