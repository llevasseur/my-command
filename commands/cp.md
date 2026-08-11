---
description: Compose another command's invocation and copy it to the clipboard, ready to paste into another agent
argument-hint: [--verbatim] [--again [slot]] <command> <prompt>
allowed-tools: Bash, Write
---

Put a ready-to-paste invocation of another command on the clipboard. **Never run that command, load its instructions, or print the composed text.** This command's whole point is to spend as few tokens as possible, so every step below is about what *not* to do.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **Resolve it in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** Every run recorded before this marker existed is read from that prose, and the prose is still the only reading for any message the marker is missing from. Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

## Flags

- `--verbatim` / `-v` — copy the prompt exactly as typed; skip the shaping in step 2.
- `--again` / `-a` `[slot]` — restore the last copy to the clipboard from the stash instead of composing anything. Takes no command and no prompt. An optional slot number reaches an older ring entry (`/my-command:cp --again 2`).

## Steps

1. **Restore, with `--again` / `-a`.** This flag short-circuits the whole command: do not compose, do not read anything, do not enrich anything, and ignore any command or prompt tokens rather than acting on them. One Bash call, which spends no tokens on the text it restores:

   ```bash
   pbcopy < ~/.claude/cp-last.txt
   ```

   A slot number reads an older ring entry instead — `/my-command:cp --again 2` restores `~/.claude/cp-last.2.txt`, valid through slot 4. Off macOS, substitute the platform's clipboard sink exactly as in step 3. If the stash file does not exist, say so plainly and write nothing: an empty clipboard is worse than whatever is on it now. Then stop — steps 2 and 3 do not run.
2. **Compose.** The first token of `$ARGUMENTS` is the target command (a leading `/` is optional); everything after it is the prompt. Rewrite the prompt so it stands alone for an agent that cannot see this conversation — resolve `this`/`that`/`it`, name files, branches, and PR numbers explicitly, and keep every constraint the user stated. Add no scope. Preserve any flags the user typed for the target command as typed. With `--verbatim`, use the prompt as given.
3. **Copy.** Three calls, in this order — the stash and the clipboard end up carrying identical bytes, so a later copy from anywhere else can be undone with step 1. First rotate the ring:

   ```bash
   mkdir -p ~/.claude
   rm -f ~/.claude/cp-last.4.txt
   for i in 3 2 1; do
     [ -f ~/.claude/cp-last.$i.txt ] && mv ~/.claude/cp-last.$i.txt ~/.claude/cp-last.$((i + 1)).txt
   done
   [ -f ~/.claude/cp-last.txt ] && mv ~/.claude/cp-last.txt ~/.claude/cp-last.1.txt
   ```

   Then write the composed line with the `Write` tool, spelling the home directory out — the tool does not expand `~`:

   ```
   Write({file_path: "/Users/<you>/.claude/cp-last.txt", content: "/<command> <composed prompt>\n"})
   ```

   Then feed the clipboard from that file:

   ```bash
   pbcopy < ~/.claude/cp-last.txt
   ```

   **The stash is written with `Write`, never with a heredoc.** `cat > … <<'EOF'` composes a file in the shell, and that shape is refused outright inside an isolated worktree — which is where `/my-command:cp` is often invoked from, so the heredoc costs a refused call before anything reaches the clipboard. `Write` takes the content literally, so nothing expands or escapes either way.

   The stash write happens on **every** platform; only the clipboard call is platform-detected. Off macOS, substitute the platform's clipboard sink (`wl-copy`, `xclip -selection clipboard`, `clip.exe`). If none is available, the stash is already written either way: say so and print the composed line — that is the only case where printing it is correct.

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

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Every command leaves through this step, so it is the one place a run nested inside another provably passes on its way out, and the marker is the only record of where it handed control back. Without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close here in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
