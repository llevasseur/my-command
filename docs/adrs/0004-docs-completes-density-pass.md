---
type: adr
title: Docs completes the density pass in the same task
description: Run truncate's claim-preserving density rules after docs reconciliation so one workflow ships correct, concise documentation.
tags: [process, docs, commands]
timestamp: 2026-07-29
---

# Docs completes the density pass in the same task

## Status

Accepted.

## Context

[ADR 0003](0003-dirty-flag-for-doc-density.md) separated correctness and density
into different PRs so factual edits stayed distinguishable from style edits.
That separation protected reviewability but left an operational gap: `/docs`
could knowingly finish with noisy documents and a dirty queue that required a
second command, task, and PR. The default documentation workflow therefore did
not deliver its intended end state.

## Decision

[docs](../features/docs.md) keeps correctness and density as ordered phases but
runs both inside the same task. Reconciliation changes claims first and marks
updated or added docs `dirty: true`. The final phase applies
[truncate](../features/truncate.md)'s claim inventory, preservation rules, and
size guard inline over the resulting dirty queue, then clears evaluated flags.
It must not invoke `/truncate` or `$truncate` as a nested task.

Standalone truncate remains available for hand edits, explicit scopes,
interrupted queues, and whole-bundle sweeps. The dirty flag remains the boundary
between phases and makes incomplete work recoverable.

## Consequences

A normal docs run produces one PR whose documentation is both correct and
concise. Reviewers can still distinguish phases through the reconciliation and
density verdict tables, but both kinds of edits appear in one diff. The claim
inventory and post-edit comparison—not PR separation—now protect factual
content from style cleanup.
