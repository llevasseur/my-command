---
type: feature
title: cp
description: Compose another command's invocation from a prompt and copy it to the clipboard, ready to paste into another agent.
tags: [command, clipboard, cheap]
timestamp: 2026-08-02
dirty: true
---

# cp

## Summary

Turns `<command> <prompt>` into a single ready-to-paste invocation on the system
clipboard, for handing to another agent. It never runs the named command, loads
its instructions, or prints what it copied — the reply is `Done!` plus at most one
line of context. Minimizing tokens is the feature, not a side effect.

## Flags / Parameters

- `--verbatim` / `-v` — copy the prompt exactly as typed, skipping the shaping
  step.
- First non-flag token — the target command; a leading `/` is optional.
- Everything after it — the prompt.

## Behavior

Rewrites the prompt so it stands alone for an agent with no view of this
conversation (pronouns resolved; files, branches, and PR numbers named; stated
constraints kept; the user's flags preserved as typed), then writes
`/<command> <prompt>` to the clipboard in one heredoc-quoted `pbcopy` call —
`wl-copy`, `xclip -selection clipboard`, or `clip.exe` off macOS. With no
clipboard sink available it prints the line instead, the only case where printing
is correct.

It does no research: no file reads, no grep, no git, and no check that the target
command exists — an unrecognized name is copied as typed and the receiving agent
reports it. Arguments too vague to compose get one focused question and no
clipboard write.

## Related

- Command source: `src/commands/cp.md`
- Spec: [Adding a command](../specs/adding-a-command.md)
