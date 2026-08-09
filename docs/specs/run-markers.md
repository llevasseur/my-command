---
type: spec
title: Run markers
description: The STEP and RETURN markers every command emits, so a recorded run's steps and a nested run's span are read from what the run stated rather than inferred from its prose.
tags: [process, commands, observability]
timestamp: 2026-08-09
updated: 2026-08-09
dirty: true
---

# Run markers

## Summary

A recorded run is read back by claude-proxy's commands eval, which places every
node of a transcript against the command's declared steps and totals the tokens
each step spent. Until now it had nothing to read but prose: it matched a step
number wherever the agent happened to mention one, and it had no signal at all
for where a nested run ended. Two markers close that. **`STEP <n>/<N>`** says
which step a run is entering. **`RETURN /<command>`** says where a run handed
control back.

Both are emitted from `src/shared/`, so the format lives in one file per marker
and cannot drift per command.

## The step marker

`src/shared/step-marker.md`, pulled into every command with
`<!-- include-block: shared/step-marker.md -->`.

**Format:** the word `STEP` in capitals, the number written in the `## Step …`
heading being entered, a slash, and the count of `## Step …` headings the
command declares — `STEP 2/6`, `STEP 0/7`, `STEP 1.5/6`. It goes on the first
line of the message that enters the step.

- `<n>` is the heading's own number, not a position in the file. A fractional
  heading keeps its fraction, and a command whose headings start at `Step 0`
  writes `0` for its first step.
- `<N>` is the number of `## Step …` headings in that command file, which is the
  same count the eval reports as `stepsDeclared`.
- A command with no `## Step …` headings has nothing to anchor against and emits
  no marker. It still carries the include, so a command that later gains step
  headings gets the marker without an edit.

**Why one include rather than one per step.** The snippet states the rule; it
does not carry a literal marker. A command with twenty steps holds one directive,
the format cannot diverge between two commands, and a step added tomorrow is
marked by the rule already present.

**The snippet writes `STEP <n>/<N>` with placeholders on purpose.** A command
file is itself part of a transcript, so a literal example with real digits in it
would anchor a step in every run that loaded the command.

## The return marker

Carried by `src/shared/closing-turn.md`, which every command already includes as
its terminal step. It needs no include of its own.

**Format:** the word `RETURN` in capitals, a space, then the name the run was
invoked under with its leading slash — `RETURN /task`, `RETURN /clean`, or
`RETURN /my-command:clean` where the invocation carried the plugin namespace. It
is the last line of the closing turn.

The closing turn is the one place a nested run provably passes on its way out,
which is what makes the span exact. Without the marker a nested run's span ran to
the next nested invocation, or to the end of the transcript for the last one, so
a `/clean` nested under a `/task` was charged with everything `/task` did after
`/clean` returned.

## Limits, both deliberate

**The prose anchors stay.** Every transcript recorded before these markers
existed has none, and those runs must keep reading as they do. The eval matches
the marker first and falls back to the step number an agent narrates, so the
narration is the legacy path rather than dead weight — which is why the step
marker snippet requires the step to be named in words as well.

**A run that ends abnormally writes no return marker.** A crash, a kill, or a
context that runs out never reaches the closing turn, so that run's span still
runs to the end of the transcript exactly as it did before. The marker makes the
normal exit exact; it does not fix the abnormal one.

## What this unblocks and does not do

A nested run's cost lands in both its own total and its host's. Netting the child
out of the parent needed the child's span to have a known end, which the return
marker now gives it. Deciding whether the index should net it out, and doing so,
belongs to claude-proxy and is not part of this.

## Acceptance criteria

- [ ] `src/shared/step-marker.md` exists and is included by every
      `src/commands/*.md`.
- [ ] `src/shared/closing-turn.md` states the return marker.
- [ ] The emitted `STEP <n>/<N>` literal matches claude-proxy's `STEP_MARKER_RE`,
      and the emitted `<n>` is a step id the command declares.
- [ ] Neither snippet's own text matches either marker's pattern.
- [ ] `check-commands.sh` fails when a command drops the step marker include or
      the closing turn drops the return marker.

## Related

- Spec: [Adding a command](adding-a-command.md)
- Spec: [Workflow gates](workflow-gates.md)
