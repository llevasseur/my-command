---
name: warm
description: Register the current session with the claude proxy's cache-warming endpoint and report the registration as pending rather than as warm.
---

# Warm this session's prompt cache

Ask the claude proxy to hold this session's prompt cache open, so returning after
a break reuses a warm cache instead of paying to rebuild one. The workflow is a
single HTTP request made with the shell tool. It takes no arguments, reads no
files, writes no state, and has nothing to undo afterwards — the registration is
scoped to one session and expires by itself.

## Resolve the session id first

The request body carries the id the harness assigns this session, exported into
the environment as `CLAUDE_CODE_SESSION_ID`. The proxy keys the registration on
it, so it is the one value that cannot be guessed or substituted.

Codex does not always export that variable. Check it before sending anything. If
it is empty, stop: report that this session has no id to register and that the
workflow did nothing. Never invent an id, reuse one from an earlier transcript,
or fall back to a process id — a registration under the wrong key is worse than
none, because it reports success while warming a session that does not exist.

## Send one request

```bash
curl -s -XPOST http://127.0.0.1:${CLAUDE_PROXY_PORT:-8787}/__warm \
  -d "{\"sessionId\":\"$CLAUDE_CODE_SESSION_ID\",\"hours\":8}"
```

Hand that line to the shell unchanged so the shell expands both variables.
`CLAUDE_PROXY_PORT` falls back to `8787`, the proxy's own default, so a literal
port never belongs in the command.

The window is `8` hours. The proxy's own recorded recommendation is lower; the
operator chose 8 on purpose, and this workflow sends what they chose. Do not tune
it down to match the recommendation.

## Report it as pending, never as warm

A successful response means the proxy **recorded** the registration. It does not
mean anything is being kept warm. The registration arms only when a real request
from this session matches it, and the proxy discards it after 2 minutes if none
arrives. Report exactly that: the registration is pending, it arms on the next
matching request from this session, and it expires in 2 minutes unmatched. Quote
the response body where it says something more specific; otherwise those three
facts are the whole report.

Never report "session kept warm", "cache warmed", or any phrasing that presents
the work as finished. A pending registration that nothing matches expires in
silence and no later message corrects the record, so that wording is wrong in the
one case where the difference matters.

If the connection is refused, the proxy is not running. Say so in one line and
stop. Do not retry, do not poll, do not sleep and try again, and do not try a
different port — a refused connection returns the same answer on a second
attempt, and the fallback port is already in the command. Carry on with the rest
of the session: this is an optimization, so losing it costs speed and breaks
nothing.

## When to run it

Run it when actually stepping away, not reflexively at session start. The work
that produced this endpoint measured how often a session registered up front is
ever resumed and found the rate below break-even, so most such registrations
expire unused. Composed into another workflow it fires at the start of a run
regardless, which one request is cheap enough to justify; invoked directly,
invoke it on the way out.

## Closing turn

Close the run in a text-only turn: one final message carrying text and zero tool
calls, sent after the last tool call returns rather than alongside it. A run's
outcome is recorded only from a message with no tool call in it, so ending on one
— or bundling the report into one — records no outcome at all. Every ending owes
that turn, including one that stops early, is blocked or refused, or hands work
back to an invoking workflow.

Which turn that is depends on how this run was invoked, and there are exactly
three cases. Invoked directly by the user, this is the outermost run and it
closes in a text-only turn as above. Invoked inline by another command in the
same session, as a step of that invoker's own pipeline, it hands back without
spending a text-only turn: the report and the return marker go out as text in
the same message that carries the invoker's next tool call, so the turn
continues into the invoker's next step instead of returning control to the user.
A text-only turn there ends the whole assistant turn and strands every step the
invoker still owes, which is how a live pipeline comes to read as abandoned.
Dispatched as a subagent, it closes in its own text-only turn like an outermost
run, because its final message is a report to the parent session rather than a
turn in the parent's conversation. The return marker is written exactly once in
all three cases, alone on the last line of the message that hands control back —
never weakened, deferred to a later message, or dropped because the turn
continues.

Anchor that turn before the first tool call: put "close the run in a text-only
turn" in the todo list as its own final item, because the todo list is live
session state that a compaction carries forward and this prompt is not. Resolve
it in the same tool-call turn as the run's last piece of real work, so the list
is already clean when that turn returns and the only thing left to do is speak.
Never leave marking it as a call of its own after the work ends: a run whose last
scheduled action is a bookkeeping tool call ends on that call — the mark lands
every time, and the message meant to follow it never arrives. A compaction
boundary is a checkpoint, not an ending — a recap prompt, a background-task
notification, or a session-continuation preamble each mean the run is still owed
its turn, so answer in text alone, say where the run stands, and restore the todo
item if it did not survive. Each side of a boundary records its own standing,
because a run split across two transcripts is two runs to the record. Every
message from the user opens a task in the same transcript, and only a reply
carrying text and no tool call closes it, so answer a mid-run question,
correction, or recap in text before returning to tool calls. A reply to another
session is not that turn either: SendMessage is a tool call, so send the reply,
let it return, then close in text alone.
