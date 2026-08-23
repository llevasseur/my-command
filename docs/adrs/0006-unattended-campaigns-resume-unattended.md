---
type: adr
title: A campaign recorded as unattended resumes unattended
description: Record the unattended mode in the wayfinder map at start and generate the map's kickoff prompt to carry --unattended, so a resume does not silently downgrade a campaign to stopping at every pull request.
tags: [process, commands, decisions, wayfinder]
timestamp: 2026-08-23
dirty: true
decided-by: /god
ratified: false
needs-human: true
---

# A campaign recorded as unattended resumes unattended

## Status

Accepted, and **proposed by the command rather than ratified by a human**. It was
written by an unattended run under [ADR
0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s convention:
`decided-by: /god`, `ratified: false`, and `needs-human: true`, because it
loosens a merge authorisation and that is a human's call to confirm. It carries
no wayfinder slug or grill round — it came from a task's criteria rather than
from a griller's question.

It **overrides one clause** of [wayfinder](../features/wayfinder.md)'s
never-inherited rule. That rule is otherwise unchanged, and everything it covers
outside this one path still holds.

## Context

A wayfinder campaign runs for days or weeks across many agent sessions. The map's
**Agent kickoff prompt** is what carries it between them: it is not documentation
*about* the campaign, it is the literal text a fresh agent is handed to pick the
campaign back up. Resuming a campaign means running that prompt.

`--unattended` authorises the run to merge the pull requests it opens and routes
ticket execution through [god](../features/god.md) instead of
[task](../features/task.md). The rule around it was that it must be **typed on
the invocation that acts and is never inherited** — not from the map, not from
the kickoff prompt the map carries, not from an invoking command, not from an
earlier operation. The reasoning was sound and is worth restating rather than
discarding: a campaign multiplies whatever it authorises, and N unattended merges
out of one invocation is a different risk from one.

Applied to the kickoff prompt, though, that rule produced a result nobody chose.
The prompt was generated with its "stop after opening the pull request so a human
can review it" line written as-is **even for a campaign started with
`--unattended`**. So the resume path for an unattended campaign was a prompt that
instructed the resuming agent to stop at every pull request. Each resume silently
downgraded the campaign to the attended default, and a resume is the normal event
in a long campaign, not the exception — `paused` and `blocked-limit` exist in the
status vocabulary precisely because a multi-week campaign stops and restarts
routinely.

The failure mode is quiet and terminal. Nothing errors. Every ticket produces a
correct, reviewed, open pull request, and the campaign accumulates open pull
requests instead of a merged base branch. A campaign whose whole premise was **no
human in the loop** cannot finish without one, and the only signal is that it
never ends.

The alternatives were worse. Requiring whoever resumes to remember the flag makes
correctness depend on a human reading the map header and editing the prompt they
were handed — which is the same human-in-the-loop the campaign was started to
avoid, moved to a step nobody will notice missing. Dropping `--unattended` as a
concept and inferring the mode inside each operation would relax the rule
everywhere at once, including the paths the rule is actually protecting.

## Decision

**A campaign records its unattended mode in the map at `start`, and the kickoff
prompt the map carries is generated from that record.**

- `start` writes `**Unattended:** yes` or `**Unattended:** no` into the map
  header, resolved from whether `--unattended` was typed on that `start`
  invocation. Like the integration branch, it is resolved once, at start, and
  read from the map afterwards.
- On `yes`, the generated kickoff prompt tells the resuming agent to carry
  `--unattended`, and its closing line says to carry the ticket through to merged
  into the campaign base branch instead of stopping at the pull request.
- On `no`, the prompt is generated exactly as it is today, stop line and all.
  Every campaign started before this change reads as `no`.

**The flag is still read only from the invocation that acts.** The map does not
authorise anything by itself, and no operation infers the mode from it: a run
without `--unattended` typed on it still merges nothing, whatever the map says.
What changed is that the campaign's own resume instruction now tells the next
agent to type it. Every other inheritance path the rule closed stays closed — an
invoking command, an earlier operation in the same campaign, a start run
authorising a later execute run.

**The guardrail text in `src/commands/wayfinder.md` and
`skills/wayfinder/SKILL.md` names this ADR** as the justification for the
exception, so the exception is documented where someone hits it rather than
merely present in the behaviour.

## Consequences

An unattended campaign finishes. The resume path carries the mode the campaign
was started with, and a multi-week campaign no longer has to be nursed past every
pull request by the person who started it.

**The risk this accepts, stated plainly: a map is a file in the repository.**
Anyone who can edit that file can flip `**Unattended:** no` to `yes`, and a later
resume run — reading the prompt the map now carries — will merge. That is a real
escalation path and it did not exist before, because the flag previously could not
travel through any file at all.

**And `--unattended` is no longer a per-invocation *human* act for campaigns
started unattended.** It is still per-invocation, but the invocation may now be
one an agent composed from the map's prompt. The reviewed default is unchanged
for every campaign started without the flag, and the escalation still requires a
`start` run that a human gave the flag to, or a commit to the map — both of which
land in a diff. That reviewability is what the decision trades on: the campaign's
authorisation is legible in the repository rather than held in one person's
memory of how they started it.

The narrowness is the mitigation, so it has to be kept. This is one path — the
map's own kickoff prompt, for a campaign whose map records the mode. A later
change that reads the map's `**Unattended:**` line as authorisation *inside* an
operation, rather than as input to prompt generation, is a different decision
from this one and needs its own record.
