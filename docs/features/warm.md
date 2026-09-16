---
type: feature
title: warm
description: Register the current session with the claude proxy's cache-warming endpoint in one request, and report the registration as pending rather than as warm.
tags: [command, claude-proxy, cache, single-request]
timestamp: 2026-09-15
updated: 2026-09-15
dirty: true
---

# warm

## Summary

Asks the claude proxy to hold this session's prompt cache open, so returning
after a break reuses a warm cache instead of paying to rebuild one. The entire
command is a single `POST` to the proxy's `/__warm` control endpoint. It reads no
files, keeps no state, polls nothing, and has no teardown — the registration is
scoped to one session and expires on its own.

Its one non-obvious rule is what it may say afterwards: the proxy answers that
the registration is **pending**, and the command reports exactly that.

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

**The window is 8 hours, and the command does not tune it.** The proxy's own
recorded recommendation is lower — its campaign found the resume rate at session
start below break-even — but the operator specified 8 explicitly, so 8 is what
ships. The recommendation survives as guidance in the command's Notes rather than
as a quietly substituted value.

**Pending is the whole claim.** A success response means the proxy recorded the
registration, not that anything is being kept warm: it arms only when a real
request from this session matches it, and the proxy drops it after 2 minutes if
none does. The command reports three facts — pending, arms on the next matching
request, expires in 2 minutes unmatched — and is forbidden from writing "session
kept warm" or any wording that presents the work as finished. A pending
registration nothing matches expires silently with no later message to correct
the record, so the optimistic phrasing is wrong in precisely the case that
matters.

**A refused connection means the proxy is not running.** The command says that in
one line and stops: no retry, no loop, no wait-and-retry, no second port. Warming
is an optimization, so its absence costs speed and breaks nothing, and the run
carries on.

## Related

- Command source: `src/commands/warm.md`
- Codex skill: `skills/warm/SKILL.md`
- Spec: [Adding a command](../specs/adding-a-command.md)
- [task](task.md) — the composition point, via `--add warm <prompt>`.
