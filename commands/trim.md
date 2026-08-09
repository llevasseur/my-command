---
description: Decide whether the current conversation is safe to compact, then provide focused /compact instructions
allowed-tools: Read, Grep, Glob, Bash(git:*)
---

Assess whether the current conversation can be compacted without losing state needed to finish the user's task. This command is read-only: do not edit files, run mutating commands, or invoke other workflows.

This command adapts the context-compaction strategy introduced by Yujiang Li, Zhenyu Hou, Yi Jing, Jie Tang, and Yuxiao Dong in [*CompactionRL: Reinforcement Learning with Context Compaction for Long-Horizon Agents*](https://arxiv.org/abs/2607.05378) to an inference-time safety rubric for interactive coding sessions.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **Resolve it in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** Every run recorded before this marker existed is read from that prose, and the prose is still the only reading for any message the marker is missing from. Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

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

Never claim that `/my-command:trim` performed compaction. `/compact` is a Claude Code built-in that only the user can invoke.

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
