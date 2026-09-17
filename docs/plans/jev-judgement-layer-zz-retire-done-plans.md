---
type: plan
title: jev-judgement-layer-zz — Retire the campaign's done plans
description: The campaign's final ticket — delete every jev-judgement-layer plan file including this one, regenerate the docs index, and leave the map for close to retire.
tags: [plan, wayfinder, judge]
timestamp: 2026-09-16
---

# jev-judgement-layer-zz — Retire the campaign's done plans

**Wayfinder:** `jev-judgement-layer`
**Branch:** `task/jev-judgement-layer-zz-retire-done-plans`
**Status:** active

**Execute last**, once no other task in the map is active. Running it earlier deletes
plans for tickets still to come.

## Why this ticket exists at all

Every other plan in this campaign is deliberately **kept** and marked done for the
campaign's whole life, so any ticket can be restarted from what was *asked* rather than
from a summary of what shipped. This ticket is therefore the **only** thing that ever
removes any of them.

Skip it and the campaign's scaffolding stays in the repository permanently — a directory
of done plans belonging to a campaign that ended, owned by nobody, that every later reader
has to work out is dead.

## Criteria

1. Delete every `docs/plans/jev-judgement-layer-*.md` plan file, **this one included**.
2. Regenerate the docs index: `okq --bundle docs index`, then
   `okq --bundle docs index --check` until it exits clean.
3. **Leave `docs/plans/wayfinder-jev-judgement-layer.md` in place.** The map is retired by
   the campaign's close operation, not here. Deleting it here would take the Completed log
   out from under the campaign PR that is about to summarise it.

## Constraints

- Delete plan files only. No source file, no doc outside `docs/plans/`, and above all
  **not the seven ADRs** — those are the durable record this campaign exists to leave
  behind, and they live in `docs/adrs/`.
- If `docs/plans/` holds a plan belonging to some *other* campaign, leave it alone. The
  glob is scoped to this slug for that reason.

## Done when

- [ ] No `docs/plans/jev-judgement-layer-*.md` file remains.
- [ ] `docs/plans/wayfinder-jev-judgement-layer.md` is untouched.
- [ ] `docs/adrs/0007` through `0013` are untouched.
- [ ] `okq --bundle docs index --check` exits clean.
- [ ] `./scripts/check-commands.sh` passes.
