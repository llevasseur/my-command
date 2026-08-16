---
description: Compose another command's invocation and copy it to the clipboard, ready to paste into another agent
argument-hint: [--verbatim] [--again [slot]] <command> <prompt>
allowed-tools: Bash, Write
---

Put a ready-to-paste invocation of another command on the clipboard. **Never run that command, load its instructions, or print the composed text.** This command's whole point is to spend as few tokens as possible, so every step below is about what *not* to do.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the way this run ends.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **A run another command invoked inline with the `Skill` tool anchors its handback instead**, worded as "hand back to the invoking command in its next turn": a nested run that spends a text-only turn ends the whole assistant turn and strands every step its parent still owes, so the item it carries must not tell it to. A run the user invoked directly, and one dispatched as a subagent, both anchor the text-only close. **Resolve the item in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

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
- `--again` / `-a` `[slot]` — restore the last copy to the clipboard from the stash instead of composing anything. Takes no command and no prompt. An optional slot number reaches an older ring entry (`/cp --again 2`).

## Steps

1. **Restore, with `--again` / `-a`.** This flag short-circuits the whole command: do not compose, do not read anything, do not enrich anything, and ignore any command or prompt tokens rather than acting on them. One Bash call, which spends no tokens on the text it restores:

   ```bash
   my-command-tools stash restore
   ```

   A slot number reaches an older ring entry — `/cp --again 2` is `my-command-tools stash restore 2`, valid through slot 4. The verb detects the clipboard sink itself, so there is nothing to substitute per platform. If the slot holds nothing it says so and leaves the clipboard alone — an empty clipboard is worse than whatever is on it now — so repeat that plainly and write nothing. Then stop — steps 2 and 3 do not run.
2. **Compose.** The first token of `$ARGUMENTS` is the target command (a leading `/` is optional); everything after it is the prompt. Rewrite the prompt so it stands alone for an agent that cannot see this conversation — resolve `this`/`that`/`it`, name files, branches, and PR numbers explicitly, and keep every constraint the user stated. Add no scope. Preserve any flags the user typed for the target command as typed. With `--verbatim`, use the prompt as given.
3. **Copy.** Two calls, in this order — the stash and the clipboard end up carrying identical bytes, so a later copy from anywhere else can be undone with step 1. First write the composed line with the `Write` tool, spelling the home directory out — the tool does not expand `~`:

   ```
   Write({file_path: "/Users/<you>/.claude/cp-compose-<unique>.txt", content: "/<command> <composed prompt>\n"})
   ```

   Then hand that same path to the stash, which rotates the ring, installs the line as the newest entry, and feeds the clipboard from it:

   ```bash
   my-command-tools stash write --content-file /Users/<you>/.claude/cp-compose-<unique>.txt --consume
   ```

   **`<unique>` is a token you mint for this invocation and never reuse** — the UTC date and time to the second plus a few random characters, so `cp-compose-20260816-142455-9f2c.txt`. It costs nothing to produce and it is what makes the `Write` succeed on the first try. `Write` refuses to overwrite a file this session has not read, so a *fixed* compose path fails on every run that follows any earlier run: the file is still there from last time, the write is rejected, and the only way forward is to `Read` a couple of kilobytes of a completely unrelated prompt just to earn permission to overwrite it — one guaranteed failed call plus a stale read, in the command whose whole point is to spend as few tokens as possible. A path that cannot already exist never meets that precondition at all.

   **`--consume` is not optional.** The compose file is a hand-off, not a document: once the verb has copied its bytes into the ring it deletes it. A unique name is what makes the write succeed; deleting it is what keeps one file per `/cp` from piling up under `~/.claude` forever.

   **The entry travels as a file path, never as a shell-composed string.** `cat > … <<'EOF'` composes a file in the shell, and that shape is refused outright inside an isolated worktree — which is where `/cp` is often invoked from — while an argument would need every quote, backslash, and newline in the prompt escaped correctly. `Write` takes the content literally and the verb copies the bytes, so nothing expands or escapes either way.

   **The rotation belongs to the verb because a loop cannot be allowlisted.** The five-deep ring used to be a `for i in 3 2 1` loop over `$((i + 1))` paths pasted into this prompt. Every path in it was under `~/.claude`, so it carried no git operation and no repo-relative write — and it was refused every time anyway, because a worktree-isolated session cannot resolve a loop-computed path by reading it. `Bash(my-command-tools:*)` is allowlisted; a snippet that is a different string on every run never can be.

   The stash write happens on **every** platform; only the clipboard call is platform-detected, and the verb does that itself — `pbcopy`, `wl-copy`, `xclip -selection clipboard`, `clip.exe`, in that order. With no sink available the entry is stashed anyway and the result says so: repeat that and print the composed line — that is the only case where printing it is correct.

## Recovering without an agent

The stash is a plain file, so the cheapest recovery spends no tokens at all. Add to `~/.zshrc`:

<!-- not-run: a shell function the user pastes into ~/.zshrc; no agent ever executes it -->

```bash
cpagain() { pbcopy < ~/.claude/cp-last.txt; }
```

Or the variant that takes an optional slot number matching the ring:

<!-- not-run: a shell function the user pastes into ~/.zshrc; no agent ever executes it -->

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
**Every run states its outcome on the way out, and *how* it states it depends on how this run was invoked.** One mechanic decides all three cases: in Claude Code an assistant message carrying text and **zero tool calls** ends the assistant's turn and hands control back to the user. That is what records a run's outcome — and it is also what strands a parent pipeline when a nested run spends one, because the parent's remaining steps never get a turn to run in.

**Tell which of the three cases this run is in before composing anything, from how it was invoked:**

- **Outermost** — the user invoked this command directly, as the prompt this turn is answering. No other command run encloses it. It **closes in a text-only turn**.
- **Nested inline** — another command invoked this one with the `Skill` tool in this same session, as a step of its own pipeline, and that parent still has steps owed once this one returns. It **hands back without spending a text-only turn**.
- **Subagent** — this run was dispatched with the `Agent` tool (`--sub`, a delegated unit, any Agent-tool dispatch). It has its own conversation, and its final message is a report *to* the parent session rather than a turn *in* the parent's conversation, so nothing of the parent's is waiting behind it. It **closes in a text-only turn**, exactly like an outermost run.

**Outermost and subagent: close in a text-only turn. Never skipped, never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

**Nested inline: hand back without spending a text-only turn.** Emit the report and the return marker as **text in the same assistant message that carries the parent's next tool call**, so the turn continues into the parent's next step instead of ending and returning control to the user. A nested run that closes in a text-only turn strands every step its parent still owes — the recorded failure is a `/clean` and a `/pr` nested in one pipeline, where each child's text-only close handed control back before the parent could invoke the next child, run its teardown, or record its own outcome, leaving a live run reading as abandoned. So do not compose a message of text alone here, and do not stop to let the parent speak: say what this run did, write the marker, and make the parent's next call in that same message. The parent's own closing turn is the one that records the outcome for both.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes; which of the three cases applies does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available. A nested run that stopped early still hands back in the parent's turn — it reports the stop as text beside the parent's next call, and the parent decides whether to carry on.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line, in all three cases:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Written **exactly once**, on the last line of the message that hands control back, whether that message is a text-only close or a nested handback riding the parent's next tool call. The marker is the only record of where a run handed control back, so it is never weakened, deferred to a later message, or dropped because the turn continues: without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. That is true even inside a nested run: my message is addressed to the session, not to whichever command currently holds it. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never the dispatching run's turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close that run in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it — in the two closing cases.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of an outermost or subagent run and swallow the outcome. The nested handback is the deliberate exception and the only one: there the report rides the parent's **next** call, which is what keeps the parent's turn alive.
<!-- /include-block -->
