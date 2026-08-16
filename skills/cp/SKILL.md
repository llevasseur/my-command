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
   my-command-tools stash restore
   ```

   An optional slot number reaches an older ring entry — `--again 2` is
   `my-command-tools stash restore 2`, valid through slot 4. The verb detects the
   clipboard sink itself, so there is nothing to substitute per platform. If the
   slot holds nothing it says so and leaves the clipboard alone: repeat that
   plainly and write nothing rather than copying an empty clipboard. Then stop.
2. **Compose.** The first argument token names the target skill (`$name` or a bare
   name); the rest is the prompt. Rewrite it to stand alone for an agent that
   cannot see this conversation — resolve pronouns, name files, branches, and PR
   numbers, keep every stated constraint, and add no scope. Keep the user's flags
   as typed. With `--verbatim` / `-v`, copy the prompt unchanged.
3. **Copy.** Two calls. Write `$<skill> <composed prompt>` to
   `~/.claude/cp-compose.txt` with the file-writing tool, spelling the home
   directory out, then hand that path to the stash — it rotates the ring, installs
   the line as the newest entry, and feeds the clipboard from it, so the stash and
   the clipboard carry identical bytes and a later copy can be undone with step 1:

   ```bash
   my-command-tools stash write --content-file /Users/<you>/.claude/cp-compose.txt --consume
   ```

   **`--consume` is not optional, and it is why that path can be a fixed one.** The
   compose file is a hand-off, not a document: once its bytes are in the ring the
   verb deletes it. Left behind, it survives to the next run of this skill, whose
   write then lands on a path that session never read — which the file-writing tool
   rejects, and a recorded run hit that same rejection on that same file every time.

   **The entry travels as a file path, never as a shell-composed string.**
   Composing a file in the shell is refused inside an isolated worktree, which is
   where this skill is often invoked from, and an argument would need every quote,
   backslash, and newline escaped correctly. The file-writing tool takes the
   content literally and the verb copies the bytes.

   **The rotation belongs to the verb because a loop cannot be allowlisted.** The
   ring used to be a `for i in 3 2 1` loop over `$((i + 1))` paths pasted into this
   prompt. Every path in it was under `~/.claude`, so it carried no repository
   write — and it was refused every time anyway, because an isolated session cannot
   resolve a loop-computed path by reading it.

   The stash write happens on every platform; only the clipboard call is
   platform-detected, and the verb does that itself — `pbcopy`, `wl-copy`,
   `xclip -selection clipboard`, `clip.exe`. With no clipboard sink the stash is
   written anyway: print the composed line and say why.
4. **Report.** `Done!`, then at most one short line naming the direction taken.
   Nothing else.

The stash is plain text under `~/.claude` only — never markdown, a doc artifact,
or anything inside the repository. The ring is five deep: `cp-last.txt` plus
`cp-last.1.txt` through `cp-last.4.txt`, oldest dropped on each copy. For
recovery with no agent at all, add to `~/.zshrc`:

<!-- not-run: a shell function the user pastes into ~/.zshrc; no agent ever executes it -->

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

Which turn that is depends on how this run was invoked, and there are exactly
three cases. Invoked directly by the user, this is the outermost run and it
closes in a text-only turn as above. Invoked inline by another command in the
same session, as a step of that invoker's own pipeline, it hands back without
spending a text-only turn: the report and the return marker go out as text in
the same message that carries the invoker's next tool call, so the turn
continues into the invoker's next step instead of returning control to the user.
A text-only turn there ends the whole assistant turn and strands every step the
invoker still owes, which is how a live pipeline comes to read as abandoned.
Dispatched as a subagent, it closes in its own text-only turn like an outermost
run, because its final message is a report to the parent session rather than a
turn in the parent's conversation. The return marker is written exactly once in
all three cases, alone on the last line of the message that hands control back —
never weakened, deferred to a later message, or dropped because the turn
continues.

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
