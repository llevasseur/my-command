---
type: feature
title: warm
description: Register the current session with the claude proxy's cache-warming endpoint in one request, armed by the run's own closing reply with no further message needed.
tags: [command, claude-proxy, cache, single-request]
timestamp: 2026-09-15
updated: 2026-10-02
dirty: true
---

# warm

## Summary

Asks the claude proxy to hold this session's prompt cache open, so returning
after a break reuses a warm cache instead of paying to rebuild one. The entire
command is a single `POST` to the proxy's `/__warm` control endpoint. It reads no
files, keeps no state, polls nothing, and needs no teardown — the registration is
scoped to one session and expires on its own. It can still be released early,
which is the one thing the command's first release got wrong; see
[Releasing early](#releasing-early).

Its one non-obvious rule is what it may say afterwards. The proxy answers that
the registration is **pending**, and the command's own closing reply is the
request that arms it, so the command reports it as armed by that reply and never
asks the user for another message.

## Flags / Parameters

- None. `/warm` takes no flags and no arguments, which is what makes it safe to
  reach as `/task --add warm "keep this session warm while I'm away"` — invoked
  once, at the start of a run, with nothing to pass it and nothing to undo.

## Behavior

One request, composed so the shell expands both variables:

```bash
curl -s -XPOST http://127.0.0.1:${CLAUDE_PROXY_PORT:-8787}/__warm \
  -d "{\"sessionId\":\"$CLAUDE_CODE_SESSION_ID\",\"hours\":8}"
```

`CLAUDE_CODE_SESSION_ID` is set by Claude Code. `CLAUDE_PROXY_PORT` falls back to
`8787`, the proxy's own default, so no literal port is written into the command.

## Releasing early

A registration ends by itself at its deadline, and the proxy holds its state in
memory only, so restarting the proxy clears every registration. Neither is needed
in the ordinary case — but a session that is *finished* rather than paused keeps
pinging until its deadline, because from inside the proxy an abandoned session
and a long away-stretch are the same thing. Silence is the only signal it has.

The same endpoint takes a `DELETE`, answering
`{"ok":true,"sessionId":"…","released":true}`:

```bash
curl -s -XDELETE http://127.0.0.1:${CLAUDE_PROXY_PORT:-8787}/__warm \
  -d "{\"sessionId\":\"$CLAUDE_CODE_SESSION_ID\"}"
```

**Prefer running it from a shell outside the session.** Asking the agent to
release a registration replays the whole session prompt to send an 80-byte
request, spending the thing the registration exists to save; the same curl from
any other terminal costs nothing. `GET /__warm` lists the live entries, so the
session id is recoverable without that session's environment.

The command's first release (my-command#146) asserted there was **no** way to
unregister, while `DELETE /__warm` had shipped in the same campaign. That claim
was wrong and would have stopped an agent from releasing a registration when
asked.

**The window is 8 hours, and the command does not tune it.** The proxy's own
recorded recommendation is lower — its campaign found the resume rate at session
start below break-even — but the operator specified 8 explicitly, so 8 is what
ships. The recommendation survives as guidance in the command's Notes rather than
as a quietly substituted value.

**The closing reply arms it.** The proxy's answer says `pending`, and it arms the
registration when a later request from the same session gets a 2xx from the
upstream. claude-proxy's `proxy.ts` does this in `noteWarmRequest`, which runs
when that response ends. The first such request is the one carrying the curl's output back
to the model, which is the run's own closing turn. Nested in another command, it
is the parent's next call, which is from the same session too. The command
therefore reports the registration as made and armed by this reply, with its
window, and never tells the user to send another message.

This was measured rather than assumed. On 2026-10-02 a `/warm` run registered at
16:10:34.435Z, and its closing turn reached the proxy 135 ms later with the same
session id in the header, the body metadata and `CLAUDE_CODE_SESSION_ID`. It came
back 200, and the entry is listed as `armed`. Yet the old step 3 wording, "pending,
arms on the next matching request, expires in 2 minutes", made that same run tell
the user it was waiting on their next message. No message was needed.

The 2-minute unmatched expiry still exists. Here it fires only when the closing
request fails upstream, or when the session's model traffic does not go through
this proxy at all. The command still never writes "session kept warm" or "cache
warmed": arming schedules pings, and the first fires near the end of the cache's
TTL, so nothing has been held open when the run ends.

**A refused connection means the proxy is not running.** The command says that in
one line and stops: no retry, no loop, no wait-and-retry, no second port. Warming
is an optimization, so its absence costs speed and breaks nothing, and the run
carries on.

## Related

- Command source: `src/commands/warm.md`
- Codex skill: `skills/warm/SKILL.md`
- Spec: [Adding a command](../specs/adding-a-command.md)
- [task](task.md) — the composition point, via `--add warm <prompt>`.
