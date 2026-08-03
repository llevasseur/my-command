---
name: cp
description: Compose another skill's invocation from a prompt and copy it to the system clipboard, without running it.
---

# Copy a prompt to the clipboard

Hand the user a ready-to-paste invocation of another workflow. Never run that
workflow, load its `SKILL.md`, or print the composed text. Spend as few tokens as
possible.

1. **Compose.** The first argument token names the target skill (`$name` or a bare
   name); the rest is the prompt. Rewrite it to stand alone for an agent that
   cannot see this conversation — resolve pronouns, name files, branches, and PR
   numbers, keep every stated constraint, and add no scope. Keep the user's flags
   as typed. With `--verbatim` / `-v`, copy the prompt unchanged.
2. **Copy.** One shell call, heredoc-quoted so nothing expands:

   ```bash
   pbcopy <<'CPEOF'
   $<skill> <composed prompt>
   CPEOF
   ```

   Use `wl-copy`, `xclip -selection clipboard`, or `clip.exe` where `pbcopy` does
   not exist. With no clipboard sink, print the composed line and say why.
3. **Report.** `Done!`, then at most one short line naming the direction taken.
   Nothing else.

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
