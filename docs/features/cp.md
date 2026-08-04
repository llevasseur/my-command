---
type: feature
title: cp
description: Compose another command's invocation from a prompt and copy it to the clipboard, ready to paste into another agent.
tags: [command, clipboard, cheap]
timestamp: 2026-08-02
---

# cp

## Summary

Turns `<command> <prompt>` into a single ready-to-paste invocation on the system
clipboard, for handing to another agent. It never runs the named command, loads
its instructions, or prints what it copied — the reply is `Done!` plus at most one
line of context.

## Flags / Parameters

- `--verbatim` / `-v` — copy the prompt exactly as typed, skipping the shaping
  step.
- `--again` / `-a` `[slot]` — restore the last copy from the stash instead of
  composing anything. Takes no command and no prompt; an optional slot number
  reaches an older ring entry.
- First non-flag token — the target command; a leading `/` is optional.
- Everything after it — the prompt.

## Behavior

Rewrites the prompt so it stands alone for an agent with no view of this
conversation (pronouns resolved; files, branches, and PR numbers named; stated
constraints kept; the user's flags preserved as typed), then writes
`/<command> <prompt>` to a plain-text stash at `~/.claude/cp-last.txt` in one
single-quoted heredoc and feeds the clipboard from that file, so both carry
identical bytes. The clipboard sink is platform-detected — `pbcopy`, or
`wl-copy`, `xclip -selection clipboard`, or `clip.exe` off macOS — while the
stash write happens everywhere. With no clipboard sink available it prints the
line instead, the only case where printing is correct.

The stash is a five-deep ring: each copy rotates `cp-last.txt` into
`cp-last.1.txt`, shifts `cp-last.1.txt` through `cp-last.3.txt` down one slot,
and drops what was in `cp-last.4.txt`. It is plain text under `~/.claude` only —
no markdown, no doc artifact, nothing written into the repository.

## Recovering a clobbered copy

Any later copy from any application overwrites the clipboard, and recomposing
would spend the tokens again. `--again` restores the stash without recomposing,
reading, or enriching anything: `/cp --again` puts `~/.claude/cp-last.txt` back,
`/cp --again 2` reaches `~/.claude/cp-last.2.txt`. A missing stash file is
reported plainly rather than copied as an empty clipboard.

Recovery needs no agent at all. In `~/.zshrc`:

```bash
cpagain() { pbcopy < ~/.claude/cp-last.txt; }
```

or, accepting an optional slot number matching the ring naming above:

```bash
cpagain() { pbcopy < "$HOME/.claude/cp-last${1:+.$1}.txt"; }
```

It does no research: no file reads, no grep, no git, and no check that the target
command exists — an unrecognized name is copied as typed and the receiving agent
reports it. Arguments too vague to compose get one focused question and no
clipboard write.

## Related

- Command source: `src/commands/cp.md`
- Spec: [Adding a command](../specs/adding-a-command.md)
