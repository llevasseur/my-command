---
description: Compose another command's invocation and copy it to the clipboard, ready to paste into another agent
argument-hint: [--verbatim] <command> <prompt>
allowed-tools: Bash
---

Put a ready-to-paste invocation of another command on the clipboard. **Never run that command, load its instructions, or print the composed text.** This command's whole point is to spend as few tokens as possible, so every step below is about what *not* to do.

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
- The whole reply is `Done!` on its own line, then at most one short line naming the direction taken (what you resolved, assumed, or preserved verbatim). Nothing else — no preamble, no composed command, no next steps. <!-- include: shared/text-only-turn.md -->Deliver that report in a **text-only turn** — a final message carrying text and **zero tool calls**, sent after the last tool call returns rather than alongside it, because a run's outcome is recorded only from a message with no tool call in it: end on (or bundle the report into) a tool call and the run reads as unfinished even though the work landed. Every ending owes that turn — shipped, nothing-to-do, blocked, failed, refused, cut short, or a question back to me — and a subagent's report is never it, because the outcome belongs to the session the run started in.<!-- /include -->
