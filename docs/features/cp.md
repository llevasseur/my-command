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
its instructions, or prints what it copied — the reply is `Done!`, the stash slot
the copy landed in, and at most one line of context.

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
`/<command> <prompt>` to `~/.claude/cp-compose-<unique>.txt` **with the `Write`
tool** and hands that path to
`my-command-tools stash write --content-file <path> --consume`, which rotates the
ring, installs the line as the newest entry, and feeds the clipboard from it — so
the stash and the clipboard carry identical bytes.

That verb reports the `slot` its entry landed in — always 0, the newest — and the
reply names it, so the copy goes back on the clipboard with `/cp --again 0`
without reading or recomposing anything. `stash restore` already named the slot
it read, so both paths report the same field rather than a number the command
worked out for itself.

### Why the compose path is unique per invocation

`Write` refuses to overwrite a file the current session has not read. A single
fixed compose path is therefore rejected on the first write of every session
after the first — the previous run's file is still sitting there — and the only
way past the rejection is to `Read` roughly two kilobytes of a completely
unrelated composed prompt into context, then retry the identical write. That is
one guaranteed failed tool call plus a stale read on every invocation of the one
command whose stated purpose is to spend as few tokens as possible.

Minting the filename per invocation — the UTC date and time to the second plus a
few random characters — means the path cannot already exist, so the
read-before-overwrite precondition never applies and no stale bytes are ever
read. `--consume` then deletes the file once its bytes are in the ring, which is
what keeps one compose file per run from accumulating under `~/.claude`. The
entry still travels as a **path** rather than a shell-composed string, and the
five-deep rotation still lives inside the verb; only the filename changed.

**The entry travels as a file path, never as a shell-composed string.**
`cat > … <<'EOF'` composes a file in the shell, which is refused outright inside
an isolated worktree — and `/cp` is invoked from inside one often — while an
argument would need every quote, backslash, and newline in the prompt escaped
correctly. `Write` takes the content literally and the verb copies the bytes.

The clipboard sink is platform-detected — `pbcopy`, `wl-copy`,
`xclip -selection clipboard`, `clip.exe`, in that order — and the verb does that
detection itself, while the stash write happens everywhere. With no clipboard
sink available the entry is stashed anyway and `/cp` prints the line instead, the
only case where printing is correct.

The stash is a five-deep ring: each copy rotates `cp-last.txt` into
`cp-last.1.txt`, shifts `cp-last.1.txt` through `cp-last.3.txt` down one slot,
and drops what was in `cp-last.4.txt`. It is plain text under `~/.claude` only
(or `$CLAUDE_CONFIG_DIR` where that is set) — no markdown, no doc artifact,
nothing written into the repository the session happens to be in.

### Why the ring is a verb

That rotation used to be a `for i in 3 2 1` loop over `$((i + 1))` paths, pasted
into this command's prompt. Every path in it was under `~/.claude`, so it carried
no git operation and no repo-relative write — and it was **refused on every run**,
because a worktree-isolated session cannot resolve a loop-computed path by
reading it, and `/cp` runs from inside a worktree most of the time.

The fix is the name rather than the paths. `Bash(my-command-tools:*)` is
allowlisted in `src/hooks/settings-fragment.json`, so a verb call is one
approval-free command a gate can read, while a snippet that is a different string
on every run can never be allowlisted. It is the same move that put the concept
store in `concepts` and prose in `commit --message-file`. `check-commands.sh` now
holds every command file to it: see
[Workflow gates](../specs/workflow-gates.md).

## Recovering a clobbered copy

Any later copy from any application overwrites the clipboard, and recomposing
would spend the tokens again. `--again` restores the stash without recomposing,
reading, or enriching anything: `/cp --again` puts `~/.claude/cp-last.txt` back,
`/cp --again 2` reaches `~/.claude/cp-last.2.txt`. The slot printed after `Done!`
is what that argument takes — a fresh copy is slot 0, and each copy after it
shifts that entry one slot older. A missing stash file is
reported plainly rather than copied as an empty clipboard — `my-command-tools
stash restore` leaves the clipboard alone rather than clearing it, since an empty
clipboard is worse than whatever is on it now.

Recovery needs no agent at all. In `~/.zshrc`:

<!-- not-run: a shell function the user pastes into ~/.zshrc; no agent ever executes it -->

```bash
cpagain() { pbcopy < ~/.claude/cp-last.txt; }
```

or, accepting an optional slot number matching the ring naming above:

<!-- not-run: a shell function the user pastes into ~/.zshrc; no agent ever executes it -->

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
