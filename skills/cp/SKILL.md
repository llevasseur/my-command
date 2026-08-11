---
name: cp
description: Compose another skill's invocation from a prompt and copy it to the system clipboard, without running it.
---

# Copy a prompt to the clipboard

Hand the user a ready-to-paste invocation of another workflow. Never run that
workflow, load its `SKILL.md`, or print the composed text. Spend as few tokens as
possible.

1. **Restore, with `--again` / `-a`.** This flag short-circuits everything below:
   no composing, no reading, no enrichment, and no target skill or prompt
   arguments. One shell call puts the last copy back on the clipboard without
   spending tokens on its text:

   ```bash
   pbcopy < ~/.claude/cp-last.txt
   ```

   An optional slot number reaches an older ring entry — `--again 2` restores
   `~/.claude/cp-last.2.txt`, valid through slot 4. Substitute the platform's
   clipboard sink as in step 3. If the stash file is missing, say so plainly and
   write nothing rather than copying an empty clipboard. Then stop.
2. **Compose.** The first argument token names the target skill (`$name` or a bare
   name); the rest is the prompt. Rewrite it to stand alone for an agent that
   cannot see this conversation — resolve pronouns, name files, branches, and PR
   numbers, keep every stated constraint, and add no scope. Keep the user's flags
   as typed. With `--verbatim` / `-v`, copy the prompt unchanged.
3. **Copy.** Rotate the stash ring, write the composed line to
   `~/.claude/cp-last.txt`, then feed the clipboard from that file, so both carry
   identical bytes and a later copy can be undone with step 1. Rotate the ring in
   the shell:

   ```bash
   mkdir -p ~/.claude
   rm -f ~/.claude/cp-last.4.txt
   for i in 3 2 1; do
     [ -f ~/.claude/cp-last.$i.txt ] && mv ~/.claude/cp-last.$i.txt ~/.claude/cp-last.$((i + 1)).txt
   done
   [ -f ~/.claude/cp-last.txt ] && mv ~/.claude/cp-last.txt ~/.claude/cp-last.1.txt
   ```

   Write `$<skill> <composed prompt>` to `~/.claude/cp-last.txt` with the
   file-writing tool, spelling the home directory out, then:

   ```bash
   pbcopy < ~/.claude/cp-last.txt
   ```

   **Write the stash with the file-writing tool, never with a heredoc.** Composing
   a file in the shell is refused inside an isolated worktree, which is where this
   skill is often invoked from, and a file-writing tool takes the content literally
   so nothing expands or escapes either way.

   The stash write happens on every platform; only the clipboard call is
   platform-detected. Use `wl-copy`, `xclip -selection clipboard`, or `clip.exe`
   where `pbcopy` does not exist. With no clipboard sink the stash is written
   anyway: print the composed line and say why.
4. **Report.** `Done!`, then at most one short line naming the direction taken.
   Nothing else.

The stash is plain text under `~/.claude` only — never markdown, a doc artifact,
or anything inside the repository. The ring is five deep: `cp-last.txt` plus
`cp-last.1.txt` through `cp-last.4.txt`, oldest dropped on each copy. For
recovery with no agent at all, add to `~/.zshrc`:

```bash
cpagain() { pbcopy < ~/.claude/cp-last.txt; }
```

or the slot-aware variant, `cpagain() { pbcopy < "$HOME/.claude/cp-last${1:+.$1}.txt"; }`.

Never read files, search, or inspect git to enrich the prompt, and never verify
the target skill exists — an unknown name goes to the clipboard as typed. If the
arguments are too vague to compose, ask one focused question and write nothing.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. Resolve it in the same tool-call turn as the run's last piece of real work,
so the list is already clean when that turn returns and the only thing left
to do is speak. Never leave marking it as a call of its own after the work
ends: a run whose last scheduled action is a bookkeeping tool call ends on
that call — the mark lands every time, and the message meant to follow it
never arrives. A
compaction boundary is a checkpoint, not an ending — a recap prompt, a
background-task notification, or a session-continuation preamble each mean the
run is still owed its turn, so answer in text alone, say where the run stands,
and restore the todo item if it did not survive. Each side of a boundary
records its own standing, because a run split across two transcripts is two
runs to the record. Every message from the
user opens a task in the same transcript, and only a reply carrying text
and no tool call closes it, so answer a mid-run question, correction, or
recap in text before returning to tool calls. A reply to another session is
not that turn either: SendMessage is a tool call, so send the reply, let it
return, then close in text alone.
