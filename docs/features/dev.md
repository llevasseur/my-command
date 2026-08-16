---
type: feature
title: dev
description: Take one complex idea to merged unattended — grill it against the repo's specs and ADRs, record every decision the run made as a real ADR, chart it as a wayfinder campaign, build the tickets in waves through /manage, and land the campaign PR.
tags: [command, orchestration, decisions, unattended]
timestamp: 2026-08-16
dirty: true
---

# dev

## Summary

`/dev` takes **one complex idea** and drives it to merged into the default branch
with no human in the loop. It composes the existing suite rather than
reimplementing any of it: [`/wayfinder`](wayfinder.md) charts the campaign and
tracks it, [`/manage`](manage.md) schedules the tickets into waves,
[`/god`](god.md) merges, and [`/task`](task.md) implements. `/dev` cuts no branch,
writes no ticket code, opens no PR, and issues no merge of its own.

The part it does own is the part nothing else covers: **the decisions it makes on
the human's behalf, and the record of them.** A run of this size makes calls a
human would otherwise make, and every such call is written to `docs/adrs/` as a
real ADR rather than left in the campaign map, which is deleted when the campaign
closes.

## Flags / Parameters

- `--slug <s>` — the campaign slug handed to `/wayfinder start`. Absent it,
  `/wayfinder` picks one.
- `--parallel <n>` / `-p <n>` — cap how many tickets are in flight at once.
  Forwarded to `/manage`, whose hard cap is **8**; a larger value is clamped there
  and the clamp is reported.
- `--sequential` — one ticket at a time regardless of file-scope independence.
  The escape hatch from waves.
- `--rounds <n>` — override the grill's 12-round cap.
- `--dry-run` / `-n` — grill, print the campaign that would be charted (tickets,
  waves, the branch names the map would own, and every decision that would be
  recorded), then stop. No ADR, no branch, no PR, nothing dispatched.
- `--no-grill` — skip phase 1 entirely.
- `--resume <slug>` — resume the surviving campaign named by that slug. Mutually
  exclusive with an idea.
- The remaining text is the **idea**.

**Resume is always explicit.** `/dev <idea>` always starts a new campaign and never
infers that an idea matches an existing map.

## Behavior

Four phases, one run.

### Phase 1 — Grill

`/dev` spawns **exactly one** read-only adversarial griller subagent, handed the
idea plus the repo's okq specs index (`docs/specs/index.md`) and ADR index
(`docs/adrs/index.md`). Every round after that initial spawn is a message to that
**same long-lived agent**, so its repo context is paid for once rather than
re-derived per round. Sending resumes the agent and returns on acceptance; the
griller's reply arrives afterwards as a notification, so a round is send, wait,
answer.

The griller asks **one question at a time**, mirroring the `grilling` skill, which
is explicit that multiple questions at once are bewildering — batching lets a weak
answer hide among strong ones, and the weak answer is the one that becomes an
unrecorded decision. `/dev` answers each question and **grounds every answer in the
repo's okq specs and ADRs, citing the spec or ADR by path**.

The grill is **one pass, on the idea only** — not on the resulting decomposition,
not on a ticket's implementation. It ends when the griller declares no open
questions or at **12 rounds**, whichever comes first. `--rounds <n>` overrides the
cap; `--no-grill` skips the phase.

### Decision traceability

Any answer `/dev` could **not** ground in an existing spec or ADR is a decision
`/dev` made itself, and it is recorded immediately as a real ADR in `docs/adrs/`,
committed alongside the work that depends on it — **never only in the wayfinder
map**, which is ephemeral scaffolding deleted when the campaign closes.

Each such ADR carries `decided-by: /dev`, `ratified: false`, the wayfinder slug,
and the grill round it came from. Its Status section states it was proposed by
`/dev` and not ratified by a human; its Context section quotes the griller's
question **verbatim**. A decision that also looks like a human's call to make — a
product or otherwise irreversible choice rather than an implementation detail —
additionally carries `needs-human: true`.

`/dev` **never blocks and never asks a question**: it decides, marks the ADR, and
carries on. The campaign PR body then **leads with the list of `needs-human`
decisions**, so the human's review is where those calls actually get made.

The keys need no tooling change and are queryable — `okq validate` accepts
frontmatter beyond the OKF core and `okq --bundle docs find --where <KEY=VALUE>`
matches arbitrary keys, per
[ADR 0003](../adrs/0003-dirty-flag-for-doc-density.md) and
[ADR 0005](../adrs/0005-agent-authored-decisions-are-marked-in-frontmatter.md). So
`okq --bundle docs find --where ratified=false` lists everything a run decided.

### Phase 2 — Chart

`/dev` invokes `/wayfinder start` **directly, not through `/manage`**, because
`/manage` plans a branch name per unit and the wayfinder map already owns those
names. `/wayfinder start` writes the campaign map and its task plans and opens the
planning PR through [`/pr`](pr.md); that planning PR merges to the default branch
via `/god --into <default branch>`.

### Phase 3 — Build

`/dev` hands **only the ticket set** to `/manage` — one unit per ticket, each unit
being `/wayfinder --unattended execute NN` — so the map keeps naming the branches
and `/manage` only schedules them into waves.

**Waves are the default:** as many tickets in parallel as the file-scope lanes
allow, bounded by `/manage`'s hard cap of 8. Two tickets editing one file on a
shared base branch is a conflict this run would pay unattended, with no human at
the merge. Each ticket lands on the campaign base branch via
`/god --base wayfinder/<slug> --into wayfinder/<slug>` — the campaign base named
twice, as cut point and as merge target. `/dev` then invokes
`/wayfinder complete NN` for each landed ticket.

A campaign of fewer than three tickets skips `/manage` entirely, since `/manage`
documents that a goal decomposing into fewer than three units is not worth an
orchestrator.

### Phase 4 — Land

`/wayfinder close` opens the campaign PR through `/pr`, and
`/god --into <default branch>` merges it. `/wayfinder` then retires its own
scaffolding.

### Failure handling

When a ticket fails and `/manage`'s own single retry also fails, `/dev` spends
**exactly one additional round**: it re-grills that ticket with the same griller,
re-plans it, and re-dispatches it. The bound exists so the orchestrator terminates
— `/manage` documents that an orchestrator which re-plans until everything
succeeds does not.

If that round also fails, `/dev` **falls back**: `/wayfinder close` still runs so
there is a campaign PR to review, but `/dev` does **not** merge it to the default
branch and does **not** retire the wayfinder scaffolding — the map and the failed
ticket's plan are kept alive — and it reports. `/dev --resume <slug>` then reads
that surviving map, skips completed tickets, re-dispatches the outstanding ones,
and closes.

### Nesting

`/dev` → `/manage` → `/wayfinder` → `/god` → `/task` → `/clean` + `/pr` +
`/review` is six levels deep, and the closing-turn contract holds at every level:
a nested run that spends a text-only turn strands every step its parent still
owes. `/dev` distinguishes the outermost, nested-inline, and subagent cases, and
treats a subagent's report — the griller's included — as never being its own
closing turn.

## Related

- Command source: `src/commands/dev.md`
- Command: [wayfinder](wayfinder.md) — charts the campaign and executes each ticket
- Command: [manage](manage.md) — schedules the tickets into waves
- Command: [god](god.md) — merges the planning, ticket, and campaign PRs
- Command: [task](task.md) — implements each ticket
- Command: [pr](pr.md) — opens the planning and campaign PRs
- ADR: [0005 Agent-authored decisions are marked in frontmatter](../adrs/0005-agent-authored-decisions-are-marked-in-frontmatter.md)
- ADR: [0003 A dirty frontmatter flag hands changed docs to a separate density pass](../adrs/0003-dirty-flag-for-doc-density.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
