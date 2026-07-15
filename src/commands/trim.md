---
description: Decide whether the current conversation is safe to compact, then provide focused /compact instructions
allowed-tools: Read, Grep, Glob, Bash(git:*)
---

Assess whether the current conversation can be compacted without losing state needed to finish the user's task. This command is read-only: do not edit files, run mutating commands, or invoke other workflows.

## Rubric

Evaluate every gate against concrete evidence in the conversation and, when relevant, the live repository state:

- **C1 CLOSED:** The latest unit of work is complete. Nothing is mid-edit, mid-command, mid-tool sequence, mid-merge resolution, or awaiting a result.
- **C2 RECOVERABLE:** A replacement summary can preserve the original goal and acceptance criteria, user decisions and constraints, branch/worktree and dirty state, files changed and why, commands and tests run with their outcomes, confirmed findings, relevant failed approaches, unresolved risks or blockers, and the exact next action.
- **C3 PROGRESS:** Material progress has occurred since the last compaction, or since the conversation began if it has not been compacted.
- **N1 STUCK:** Recent work is cycling or repeatedly failing such that compressing it would hide useful negative evidence or make the same attempts likely.
- **N2 LIVE:** A process, tool call, conflict resolution, partial mutation, or requested user decision is still pending.
- **N3 VERIFIED:** Any work currently treated as complete has received the relevant verification. Answer N when verification is still required or its result is unknown.

Trimming is safe only when `C1=Y`, `C2=Y`, `C3=Y`, `N1=N`, `N2=N`, and `N3=Y`. Be conservative. Do not recommend compaction merely because the conversation is long.

## Response

First output exactly six evidence lines in this form:

```text
C1: Y/N -- <brief evidence>
C2: Y/N -- <brief evidence>
C3: Y/N -- <brief evidence>
N1: Y/N -- <brief evidence>
N2: Y/N -- <brief evidence>
N3: Y/N -- <brief evidence>
```

If any gate fails, finish with:

```text
CONTINUE -- <the smallest action that would make trimming safe>
```

If every gate passes, finish with `TRIM`, followed by a single copyable command:

```text
/compact <focused instructions tailored to this conversation>
```

The instructions must tell `/compact` to preserve the original goal, user constraints and decisions, current implementation and repository state, changed files, verification evidence, unresolved work, and exact next action. Tell it to discard superseded plans, repetitive tool output, completed narration, and failed approaches except for concise negative knowledge needed to prevent retries.

Never claim that `/trim` performed compaction. `/compact` is a Claude Code built-in that only the user can invoke.
