---
type: feature
title: revive
description: Resume an interrupted Claude Code session from its recorded transcript — locate where it stopped, finish only what's outstanding, and complete the original workflow.
tags: [command, workflow, git]
timestamp: 2026-07-24
---

# revive

## Summary

Picks up a session that stopped mid-flight — cleared, compacted away, killed, or
abandoned — leaving its work half-applied on a branch. Reads that session's
recorded transcript to reconstruct what it was doing, recovers the workspace it
was working in, subtracts what already landed, finishes the remainder, and
carries the interrupted workflow to its documented end (usually a PR, via
[task](task.md)).

The governing split: **the transcript supplies intent, the repository supplies
state.** Nothing about what remains to be done is taken from the transcript on
faith.

## Flags / Parameters

- `<session-id>` — the first bare token. Either a **16-hex-char** proxy thread id
  (e.g. `59da5fc97e6b9465`) or a **36-char UUID** Claude Code session id.
- `--dry-run` / `-n` — report where the session stopped and what remains; change
  nothing (no edits, no worktree, no commit, no PR). Stops after reconciliation.
- `--source proxy` — force the claude-proxy transcript store. **This is the default.**
  Requires `CLAUDE_PROXY_STORE` (see Environment below).
- `--source cli` — force the Claude Code CLI transcript
  (`~/.claude/projects/<slug>/<uuid>.jsonl`).
- `--source <path>` — read that file directly as the transcript.
- Anything after the session id is extra context that steers the resumption; it
  never overrides transcript or repo evidence.

## Environment

The proxy store's location is **never hardcoded** — it is read from the shell
environment, so the command works regardless of where claude-proxy lives:

| Variable | Required | Meaning |
| --- | --- | --- |
| `CLAUDE_PROXY_STORE` | yes, for `--source proxy` | Directory holding the proxy's `<id>.md` session transcripts. |
| `CLAUDE_PROXY_ARCHIVE` | no | Root that relocated older transcripts live under; searched recursively for `<id>.md`. Unset means the archive is skipped and the command says so. |

```sh
export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
export CLAUDE_PROXY_ARCHIVE="$HOME/path/to/archived/claude/logs"   # optional
```

If `CLAUDE_PROXY_STORE` is unset or its path is missing, the command **stops** and
says so rather than guessing a path or silently falling back — `--source cli` and
`--source <path>` remain available.

## Behavior

**Transcript sources.** The default store is claude-proxy's per-session digest at
`$CLAUDE_PROXY_STORE/<threadId>.md`, where the thread id is
`sha256(sessionId + "\n" + first-user-text).slice(0, 16)`. Older days are
relocated out of the live store by the proxy's retention, so the command searches
the live store first and then globs `$CLAUDE_PROXY_ARCHIVE`. A transcript's
`- session: <uuid>` header links it back to the CLI session, which lets the
command walk between the two stores in either direction — and one session id can
own several thread ids, because each subagent gets its own conversation root and
therefore its own transcript.

**A digest, not a replay log.** Reasoning lines and tool arguments are truncated,
so the transcript is read for the ask, the workflow that was running (often a
nested slash-command pipeline), the human's already-settled mid-run decisions, the
errors it hit, and the point where it stops — the transcript simply *ending* is
the interruption signal.

**Workspace recovery.** The CLI transcript's `cwd`/`gitBranch` identify the
directory and branch the run was in. An existing directory is resumed in place; a
missing one is recreated with `worktree begin --existing`, which checks that branch
out rather than starting a fresh one off `main` — starting fresh would abandon the
work. A vanished branch is reported rather than reconstructed.

**Reconciliation before work.** The toolkit's `state` and `verify` verbs establish
what actually landed — steps can complete after the last transcript line is written. The outstanding list is what the workflow requires
minus what's already done, each item carrying the evidence that says it's
outstanding. Typical leftovers: a generated artifact never regenerated, an edit
series applied partway, a verification never run, or the wrapping workflow's
commit/clean/PR tail never reached.

**Finishing.** Only outstanding items are worked, with claims re-verified against
source rather than trusted from the transcript. Then the *original* workflow is
completed on its own terms — for anything wrapped in `/task` that means commit,
`/clean`, `/pr`, worktree teardown. The resumption is never wrapped in a new
`/task` run, since the branch and workspace already exist.

## Related

- Command source: `src/commands/revive.md`
- Completes runs started by: [task](task.md), and the commands that delegate to it
  — [docs](docs.md), [fb](fb.md), [review](review.md)
- Ends via: [clean](clean.md) then [pr](pr.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
