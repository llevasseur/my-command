---
description: Compose another command's invocation and copy it to the clipboard, ready to paste into another agent
argument-hint: [--verbatim] <command> <prompt>
allowed-tools: Bash
---

Put a ready-to-paste invocation of another command on the clipboard. **Never run that command, load its instructions, or print the composed text.** This command's whole point is to spend as few tokens as possible, so every step below is about what *not* to do.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed.<!-- /include -->

## Flags

- `--verbatim` / `-v` — copy the prompt exactly as typed; skip the shaping in step 1.

## Steps

1. **Compose.** The first token of `$ARGUMENTS` is the target command (a leading `/` is optional); everything after it is the prompt. Rewrite the prompt so it stands alone for an agent that cannot see this conversation — resolve `this`/`that`/`it`, name files, branches, and PR numbers explicitly, and keep every constraint the user stated. Add no scope. Preserve any flags the user typed for the target command as typed. With `--verbatim`, use the prompt as given.
2. **Copy.** One Bash call, heredoc-quoted so the shell expands and escapes nothing:

   ```bash
   pbcopy <<'CPEOF'
   /<command> <composed prompt>
   CPEOF
   ```

   Off macOS, substitute the platform's clipboard sink (`wl-copy`, `xclip -selection clipboard`, `clip.exe`). If none is available, say so and print the composed line — that is the only case where printing it is correct.

## Notes

- Never read files, grep, or touch git to enrich the prompt. Whatever is already in context is all you get; a prompt needing research is the receiving agent's job, not yours.
- Never verify the target command exists. An unrecognized name lands on the clipboard as typed and the receiving agent reports it.
- If the arguments are too vague to compose, ask one focused question instead of guessing — no clipboard write.
- The whole reply is `Done!` on its own line, then at most one short line naming the direction taken (what you resolved, assumed, or preserved verbatim). Nothing else — no preamble, no composed command, no next steps. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
