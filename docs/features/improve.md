---
type: feature
title: improve
description: Turn claude-proxy's session suggestions into an implemented improvement — read the pending findings for a range of session buckets, hand them to task as criteria, and flag what shipped as done.
tags: [command, workflow, agents]
timestamp: 2026-07-26
---

# improve

## Summary

claude-proxy groups every ten recorded sessions into a bucket and reports what
would have reached the same outcome in fewer steps — independent work issued
serially, an error rediscovered session after session, a guardrail refusing a call
the agent had already decided to make, the same file read three times in one run.
This command reads those findings, keeps only the ones still **pending**, composes
them into task criteria, runs [task](task.md) on them in a subagent, and then flags
the suggestions that actually shipped as `done` so a later run over the same range
doesn't re-propose them.

The governing rule: **the suggestions are the criteria.** Every change traces back
to a suggestion with its own evidence and source sessions; the command does not
add improvements of its own.

## Flags / Parameters

- `--range <spec>` / `-r <spec>` — which session buckets to read. One bucket (`9`),
  a list (`2,3,9`), a span (`2-9`), or a mix (`2-4,9`). **Default: every bucket.**
- `--dry-run` / `-n` — report the pending suggestions and the criteria they compose
  into, then stop. No subagent, no branch, no PR, nothing marked.
- **Pass-through `/task` flags** — `--here` / `-h`, `--base <branch>`,
  `--draft` / `-d`, `--add` / `-a <list>` are forwarded verbatim to the `/task`
  invocation and are not interpreted here. [task](task.md) is the contract for what
  they mean.
- Anything not a recognized flag is extra context. It narrows which pending
  suggestions to act on; it cannot add criteria the suggestions don't support.

## Environment

The claude-proxy checkout is **never hardcoded** — it is derived from the same
variable [revive](revive.md) uses:

| Variable | Required | Meaning |
| --- | --- | --- |
| `CLAUDE_PROXY_STORE` | yes | Directory holding the proxy's session transcripts. Its parent is the log directory the suggestion flags live in; the directory above that is the claude-proxy checkout. |

```sh
export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
```

If the variable is unset, its path is missing, or the derived checkout has no
`server/package.json`, the command **stops** and says which check failed rather
than searching the filesystem or guessing a path.

## Behavior

**Reading pending work.** Suggestions carry a status flag — `pending` by default,
`done` once applied, `skipped` when deliberately passed over — keyed by
`(bucket, suggestion id)`, both of which are stable, so a flag survives the
recomputation claude-proxy does on every read. The command lists only pending rows,
with detail:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions list -r 2-9 -s pending -d --json
```

The CLI reads the log directory directly, so **no proxy server needs to be
running**. `GET /api/sessions/suggestions/status?status=pending&detail=1&range=…`
is the equivalent when one already is. Buckets in the range that don't exist yet
are reported and skipped; an empty pending set ends the run with that answer and no
task.

**Composing criteria.** Rows are grouped by what would change — the same rule
tripping in several buckets is one improvement with more evidence, not several.
Each criterion carries the suggestion's own detail and evidence plus the
`bucket/id` pairs behind it, because the subagent has no access to the calling
conversation. Since these findings describe how an *agent* works, the fix is
usually in instructions (a command source, an `AGENTS.md` rule) rather than
application code. A suggestion whose fix belongs to another repo stays pending and
is reported as out of scope.

**Running the task.** One fresh subagent runs `/task <pass-through flags>
<criteria>`. `/task` owns the workspace, verification, commits and the PR from that
point; `/improve` creates no worktree and makes no edits of its own.

**Flagging what shipped.** Only the criteria the subagent reports as implemented
are marked:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions mark -r <bucket> -i <ids> -s done -n "<PR url>"
```

Anything dropped or deferred stays `pending` so it returns on the next run;
`skipped` is reserved for a deliberate pass with a stated reason. If no PR was
opened, nothing is marked.

## Related

- Command source: `src/commands/improve.md`
- Delegates to: [task](task.md), which ends via [clean](clean.md) and [pr](pr.md)
- Shares the `CLAUDE_PROXY_STORE` dependency pattern with: [revive](revive.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
