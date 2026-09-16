---
description: Register this session with the claude proxy's cache-warming endpoint and report the registration as pending
argument-hint: "[--TTL <hours>]"
allowed-tools: Bash(curl:*)
---

Register this Claude Code session with the claude proxy's cache-warming control endpoint, so that a resume after a break can reuse a warm prompt cache instead of paying to rebuild one. The whole command is a single HTTP request. It reads no files and keeps no state, and it takes one optional argument: `--TTL <hours>`, how long to hold the cache open for. The registration is scoped to this session and expires on its own, so an ordinary run leaves nothing to undo — but it can be released early when the user asks, and the Notes say how.

Your input is the text in the `<command-args>` block above: an optional `--TTL <hours>` and nothing else.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the way this run ends.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **A run another command invoked inline with the `Skill` tool anchors its handback instead**, worded as "hand back to the invoking command in its next turn": a nested run that spends a text-only turn ends the whole assistant turn and strands every step its parent still owes, so the item it carries must not tell it to. A run the user invoked directly, and one dispatched as a subagent, both anchor the text-only close. **Resolve the item in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** Every run recorded before this marker existed is read from that prose, and the prose is still the only reading for any message the marker is missing from. Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

## Steps

1. **Decide the body from the invocation, before sending anything.** `--TTL <hours>` is the only argument, and the number after it is the window to hold this session's cache open for. **Absent the flag, send no `hours` key at all** — the proxy has its own default and applying it is its job, so inventing a number here silently overrides an operator's setting with a guess.

2. **Send exactly one request.** With no `--TTL`, run this and nothing else:

   ```bash
   curl -s -XPOST http://127.0.0.1:${CLAUDE_PROXY_PORT:-8787}/__warm \
     -d "{\"sessionId\":\"$CLAUDE_CODE_SESSION_ID\"}"
   ```

   With `--TTL 12`, add `hours` and send that instead — one request either way, never both:

   ```bash
   curl -s -XPOST http://127.0.0.1:${CLAUDE_PROXY_PORT:-8787}/__warm \
     -d "{\"sessionId\":\"$CLAUDE_CODE_SESSION_ID\",\"hours\":12}"
   ```

   Write the number the invocation gave, literally, in place of `12`. Both variables are read from the environment by the shell, so pass the rest of the line through unchanged: `CLAUDE_CODE_SESSION_ID` is set by Claude Code, and `CLAUDE_PROXY_PORT` falls back to `8787`, which is the proxy's own default. Never substitute a literal port or paste a session id in place of either.

3. **Report the registration as pending, and claim nothing past it.** A successful response means the proxy **recorded** the registration, not that anything is being kept warm. The registration arms only when a real request from this session matches it, and the proxy drops it after 2 minutes if none does. So report three things and stop: it is pending, it arms on the next matching request from this session, and it expires in 2 minutes if no request matches.

   **State the granted window as the response's `hours` says it, in hours, and leave it there.** The body carries `requestedHours` beside it, and the two agree — the proxy grants what it is asked for — so there is no ceiling to mention and nothing was clamped. Say what the registration is good for; do not narrate the arithmetic behind it.

   **Never write "session kept warm", "cache warmed", or any other wording that reports the work as finished.** A pending registration nothing matches expires silently, with no second message to correct the record — so that wording is wrong in precisely the case where it matters, and right only by luck in the rest. Where the response body says something more specific than the three facts above, quote it; otherwise those three facts are the whole report.

4. **Treat a `400` as a bad `--TTL`, and do not send a second request.** The proxy rejects a TTL that is not a positive number, so a `400` means the invocation asked for one — zero, a negative, or something that is not a number at all. Report it as a usage error, quote what the proxy said, and stop. Re-sending it unchanged fails identically, and re-sending it with a number nobody asked for registers a window the user did not choose.

5. **Treat a refused connection as "the proxy is not running."** Say that in one line and stop. Do not retry, do not loop, do not wait and try again, and do not reach for another port — nothing about a refused connection changes on a second attempt, and the fallback port is already in the command. Carry on with whatever else the run was doing: registration is an optimization, so its absence costs speed and breaks nothing.

## Notes

- **Register when you are actually stepping away, rather than at session start.** The campaign that built this endpoint measured how often a session registered up front is ever resumed and found the rate below break-even: most such registrations expire unused. Reached as a `/my-command:task --add` entry it fires at the start of a run anyway, which one request is cheap enough to justify; invoked by hand, invoke it on the way out the door.
- **One request is the entire behaviour.** No repository reading, no state file, no follow-up poll to see whether it armed, and no second call to confirm the first.
- **A longer `--TTL` is not free.** An armed registration pings until its deadline whether or not anyone comes back, so the window is a bet on being resumed. Pass the flag when the user names how long they are stepping away for; otherwise let the proxy's default stand.
- **The registration ends by itself, and it can also be ended early.** Its deadline is the ordinary ending, and the proxy's state is in memory only, so restarting the proxy clears every registration too — which is why a run that registers has no teardown step of its own. But early release exists and is a real option: the claude-proxy dashboard lists the live registrations and releases any of them, and the same endpoint takes a `DELETE`:

  ```bash
  curl -s -XDELETE http://127.0.0.1:${CLAUDE_PROXY_PORT:-8787}/__warm \
    -d "{\"sessionId\":\"$CLAUDE_CODE_SESSION_ID\"}"
  ```

  It answers `{"ok":true,"sessionId":"…","released":true}`. Do this only when asked; registering and then immediately releasing wastes the registration.

  Worth telling the user once, because it is the cheaper path and they may not know it: **the same `DELETE` run from any other shell costs no tokens at all.** Asking an agent to release a registration replays this session's whole prompt to send an 80-byte request, which spends the thing the registration exists to save. `GET /__warm` lists the live entries, so a session id is recoverable from outside without this session's environment.
- **Closing the session does not stop it.** From inside the proxy an abandoned session and a long away-stretch are the same thing — silence is the only signal it has — so an armed registration keeps pinging until its deadline whatever happens to the window it was made from. That is the waste the guidance above is about, and the `DELETE` is how to avoid paying it when the user is finished rather than stepping away.

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**Every run states its outcome on the way out, and *how* it states it depends on how this run was invoked.** One mechanic decides all three cases: in Claude Code an assistant message carrying text and **zero tool calls** ends the assistant's turn and hands control back to the user. That is what records a run's outcome — and it is also what strands a parent pipeline when a nested run spends one, because the parent's remaining steps never get a turn to run in.

**Tell which of the three cases this run is in before composing anything, from how it was invoked:**

- **Outermost** — the user invoked this command directly, as the prompt this turn is answering. No other command run encloses it. It **closes in a text-only turn**.
- **Nested inline** — another command invoked this one with the `Skill` tool in this same session, as a step of its own pipeline, and that parent still has steps owed once this one returns. It **hands back without spending a text-only turn**.
- **Subagent** — this run was dispatched with the `Agent` tool (`--sub`, a delegated unit, any Agent-tool dispatch). It has its own conversation, and its final message is a report *to* the parent session rather than a turn *in* the parent's conversation, so nothing of the parent's is waiting behind it. It **closes in a text-only turn**, exactly like an outermost run.

**Outermost and subagent: close in a text-only turn. Never skipped, never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

**Nested inline: hand back without spending a text-only turn.** Emit the report and the return marker as **text in the same assistant message that carries the parent's next tool call**, so the turn continues into the parent's next step instead of ending and returning control to the user. A nested run that closes in a text-only turn strands every step its parent still owes — the recorded failure is a `/my-command:clean` and a `/my-command:pr` nested in one pipeline, where each child's text-only close handed control back before the parent could invoke the next child, run its teardown, or record its own outcome, leaving a live run reading as abandoned. So do not compose a message of text alone here, and do not stop to let the parent speak: say what this run did, write the marker, and make the parent's next call in that same message. The parent's own closing turn is the one that records the outcome for both.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes; which of the three cases applies does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available. A nested run that stopped early still hands back in the parent's turn — it reports the stop as text beside the parent's next call, and the parent decides whether to carry on.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line, in all three cases:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Written **exactly once**, on the last line of the message that hands control back, whether that message is a text-only close or a nested handback riding the parent's next tool call. The marker is the only record of where a run handed control back, so it is never weakened, deferred to a later message, or dropped because the turn continues: without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. That is true even inside a nested run: my message is addressed to the session, not to whichever command currently holds it. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never the dispatching run's turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close that run in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it — in the two closing cases.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of an outermost or subagent run and swallow the outcome. The nested handback is the deliberate exception and the only one: there the report rides the parent's **next** call, which is what keeps the parent's turn alive.
<!-- /include-block -->
