---
description: Decide whether the current conversation is safe to compact, then provide focused /compact instructions
allowed-tools: Read, Grep, Glob, Bash(git:*)
---

Assess whether the current conversation can be compacted without losing state needed to finish the user's task. This command is read-only: do not edit files, run mutating commands, or invoke other workflows.

This command adapts the context-compaction strategy introduced by Yujiang Li, Zhenyu Hou, Yi Jing, Jie Tang, and Yuxiao Dong in [*CompactionRL: Reinforcement Learning with Context Compaction for Long-Horizon Agents*](https://arxiv.org/abs/2607.05378) to an inference-time safety rubric for interactive coding sessions.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed. **Then close it out:** "until it is the only item left" is the trigger to resolve it, not a reason to leave it open forever — once it is the last item and the work is done, mark it completed with the run's **final tool call**, and send the text-only message after that call returns. Both constraints hold at once that way: the task list ends clean and the closing message still carries zero tool calls. Never hand back with the anchor still open — a finished run reads as abandoned in the job list.<!-- /include -->

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

Emit the six lines and the verdict. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

Never claim that `/trim` performed compaction. `/compact` is a Claude Code built-in that only the user can invoke.

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor item as the last tool call.** The todo item that held this turn open is the one thing still owed once the work lands: mark it completed, let that call return, then send the message. It is the natural final call, and it keeps the closing message free of tool calls exactly as this step requires. Handing back with it still open makes a finished run read as abandoned.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
