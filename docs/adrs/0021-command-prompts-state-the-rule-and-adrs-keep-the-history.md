---
type: adr
title: Command prompts state the current rule, and ADRs keep the history behind it
description: A command prompt says what to do now plus a one-line reason; the incident, the old behaviour, and the recorded counts that justified the rule move into an ADR the prompt cites by number, because the built commands install outside this repo where a relative link resolves to nothing.
tags: [process, commands, docs, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: true
---

# Command prompts state the current rule, and ADRs keep the history behind it

## Status

Accepted, and **proposed by `/task` rather than ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md)'s convention. It
carries `needs-human: true` because it sets a writing rule for every command in the repo.

## Context

Every MyCommand prompt is read in full by an agent at the start of each run. Over time the
prompts collected history: "used to", "the old `/improve`", "before this flag existed",
"ten recorded runs took that refusal", "a recorded run found 393 processes". Each passage
was true when written and explained why a rule exists. Three costs came with them:

- **The agent pays for the history on every run** and gets nothing to act on from it.
  "`/clean` used to carry this check" tells the run nothing about what to do in Step 2.5.
- **A then/now contrast invites the agent to reason about a state that is gone.** A
  sentence that names an old flag, an old file, or an old status is one more thing a run
  can misread as current.
- **The history drifts.** "`worktree end` now does this itself" stays "now" long after the
  change is the only behaviour anyone has seen.

The prompts install outside this repository: `build-plugin.sh` copies them into
`commands/`, and the installers place them under `~/.claude` and `~/.codex`. A relative
link such as `../../docs/adrs/0014-…md` resolves to nothing there.

## Decision

**A command prompt states the current rule plus at most a one-line reason. The backstory
lives in an ADR, cited by number in prose ("ADR 0022"), never by relative link.**

- The reason line says what goes wrong if the rule is broken, as a fact about the present.
- Incident counts, old file names, old flags, old statuses, and the order in which things
  shipped belong in the ADR.
- "Now", "no longer", and "until now" stay only where they describe time inside a run (a
  port owner "right now", a criterion that "is no longer what to build"), never a contrast
  with an earlier version of the command.
- Default behaviour is stated as the default, not as "the behaviour every run had before
  this flag existed". A record that predates a field reads as that field's default, stated
  as a rule ("a map with no `Unattended` line reads as `no`").

ADRs 0022 to 0034 hold the history moved out of the prompts when this rule was adopted.

## Consequences

- A prompt reader who wants the why looks up the ADR number in this repo's `docs/adrs/`.
- Existing relative ADR links in `src/commands/task.md`'s `--jev` section predate this rule
  and resolve only inside the repo; converting them is a follow-up.
- The Codex skills follow the same rule, since they are installed the same way.
