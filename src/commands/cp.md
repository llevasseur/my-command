---
description: Compose another command's invocation and copy it to the clipboard, ready to paste into another agent
argument-hint: [--verbatim] [--again [slot]] <command> <prompt>
allowed-tools: Bash
---

Put a ready-to-paste invocation of another command on the clipboard. **Never run that command, load its instructions, or print the composed text.** This command's whole point is to spend as few tokens as possible, so every step below is about what *not* to do.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed. **Then close it out:** "until it is the only item left" is the trigger to resolve it, not a reason to leave it open forever — once it is the last item and the work is done, mark it completed with the run's **final tool call**, and send the text-only message after that call returns. Both constraints hold at once that way: the task list ends clean and the closing message still carries zero tool calls. Never hand back with the anchor still open — a finished run reads as abandoned in the job list.<!-- /include -->

## Flags

- `--verbatim` / `-v` — copy the prompt exactly as typed; skip the shaping in step 2.
- `--again` / `-a` `[slot]` — restore the last copy to the clipboard from the stash instead of composing anything. Takes no command and no prompt. An optional slot number reaches an older ring entry (`/cp --again 2`).

## Steps

1. **Restore, with `--again` / `-a`.** This flag short-circuits the whole command: do not compose, do not read anything, do not enrich anything, and ignore any command or prompt tokens rather than acting on them. One Bash call, which spends no tokens on the text it restores:

   ```bash
   pbcopy < ~/.claude/cp-last.txt
   ```

   A slot number reads an older ring entry instead — `/cp --again 2` restores `~/.claude/cp-last.2.txt`, valid through slot 4. Off macOS, substitute the platform's clipboard sink exactly as in step 3. If the stash file does not exist, say so plainly and write nothing: an empty clipboard is worse than whatever is on it now. Then stop — steps 2 and 3 do not run.
2. **Compose.** The first token of `$ARGUMENTS` is the target command (a leading `/` is optional); everything after it is the prompt. Rewrite the prompt so it stands alone for an agent that cannot see this conversation — resolve `this`/`that`/`it`, name files, branches, and PR numbers explicitly, and keep every constraint the user stated. Add no scope. Preserve any flags the user typed for the target command as typed. With `--verbatim`, use the prompt as given.
3. **Copy.** One Bash call. It rotates the stash ring, writes the composed line to `~/.claude/cp-last.txt`, and then feeds the clipboard *from that file* — so the clipboard and the stash carry identical bytes, and a later copy from anywhere else can be undone with step 1. The heredoc is single-quoted so the shell expands and escapes nothing:

   ```bash
   mkdir -p ~/.claude
   rm -f ~/.claude/cp-last.4.txt
   for i in 3 2 1; do
     [ -f ~/.claude/cp-last.$i.txt ] && mv ~/.claude/cp-last.$i.txt ~/.claude/cp-last.$((i + 1)).txt
   done
   [ -f ~/.claude/cp-last.txt ] && mv ~/.claude/cp-last.txt ~/.claude/cp-last.1.txt
   cat > ~/.claude/cp-last.txt <<'CPEOF'
   /<command> <composed prompt>
   CPEOF
   pbcopy < ~/.claude/cp-last.txt
   ```

   The stash write happens on **every** platform; only the last line is platform-detected. Off macOS, substitute the platform's clipboard sink (`wl-copy`, `xclip -selection clipboard`, `clip.exe`). If none is available, the stash is already written either way: say so and print the composed line — that is the only case where printing it is correct.

## Recovering without an agent

The stash is a plain file, so the cheapest recovery spends no tokens at all. Add to `~/.zshrc`:

```bash
cpagain() { pbcopy < ~/.claude/cp-last.txt; }
```

Or the variant that takes an optional slot number matching the ring:

```bash
cpagain() { pbcopy < "$HOME/.claude/cp-last${1:+.$1}.txt"; }
```

`cpagain` restores the most recent copy, `cpagain 2` the entry two copies back.

## Notes

- Never read files, grep, or touch git to enrich the prompt. Whatever is already in context is all you get; a prompt needing research is the receiving agent's job, not yours.
- Never verify the target command exists. An unrecognized name lands on the clipboard as typed and the receiving agent reports it.
- The stash is plain text and lives under `~/.claude` only — no markdown, no doc artifact, and nothing written into the repository you happen to be in. The ring is five deep: `cp-last.txt` plus `cp-last.1.txt` through `cp-last.4.txt`, the oldest dropped on each copy.
- `--again` is a restore and nothing else: no compose step, no target command, no reads, no enrichment, no tokens spent on the text it puts back. A missing stash file is reported plainly — never copied as an empty clipboard.
- If the arguments are too vague to compose, ask one focused question instead of guessing — no clipboard write.
- The whole reply is `Done!` on its own line, then at most one short line naming the direction taken (what you resolved, assumed, or preserved verbatim). Nothing else — no preamble, no composed command, no next steps. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no marker to type: the `- done:` line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor item as the last tool call.** The todo item that held this turn open is the one thing still owed once the work lands: mark it completed, let that call return, then send the message. It is the natural final call, and it keeps the closing message free of tool calls exactly as this step requires. Handing back with it still open makes a finished run read as abandoned.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
