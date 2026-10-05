---
type: adr
title: A nested run hands back in its parent's turn, and the closing anchor resolves with the last real work
description: Only an outermost or subagent run closes in a text-only turn; a run invoked inline with the Skill tool reports beside its parent's next tool call, and every run marks its closing anchor in the same turn as its last real work rather than as a final call of its own.
tags: [process, commands, decisions, closing-turn]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# A nested run hands back in its parent's turn, and the closing anchor resolves with the last real work

## Status

Accepted. The rules shipped in PR #91; this record, **written by `/task` and not ratified by
a human** under [ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md),
holds the history that `src/shared/closing-turn.md` carried in prose until
[ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

In Claude Code an assistant message with text and zero tool calls ends the assistant's turn.
That is how a run records its outcome, and it is also how a nested run ends its parent's turn
early.

**PR #90 showed the failure.** `/task` invoked `/clean` and then `/pr` inline with the
`Skill` tool. Each child closed in a text-only turn, which handed control back to the user
before `/task` could invoke the next child, run its teardown, or record its own outcome. The
parent run was still live and read as abandoned. `/dev` nests six levels deep (`/dev` →
`/manage` → `/wayfinder` → `/god` → `/task` → `/clean` + `/pr` + `/review`), so the failure
compounds there.

**A second failure sat in the closing anchor itself.** Runs that marked the anchor todo item
completed as a standalone final tool call ended on that call: the mark landed every time, and
the closing message never followed, so the run recorded no outcome.

## Decision

- An outermost run and a subagent run close in a text-only turn.
- A run invoked inline with the `Skill` tool reports, and writes its `RETURN` marker, as text
  in the same message that carries the parent's next tool call.
- Every run marks its anchor completed in the same tool-call turn as its last real work,
  never as a call of its own.

`scripts/check-commands.sh` gates the nested-handback wording on all three surfaces, and
`src/hooks/stop.mjs` reads `returnMarker` and `nestedRunOpen` so it does not demand a
text-only turn from a nested handback.
