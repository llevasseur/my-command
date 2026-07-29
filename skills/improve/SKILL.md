---
name: improve
description: Turn pending claude-proxy session suggestions into implemented, evidence-backed workflow improvements and mark only shipped suggestions done.
---

# Improve Agent Workflows

Parse `--range <spec>`, `--dry-run`, task workspace flags, and optional scope. Read `CLAUDE_PROXY_STORE`; its parent log directory and repository define the suggestions CLI. Stop rather than guessing when the variable or checkout is unavailable.

1. List pending suggestions for the selected buckets as structured data. Group duplicates by underlying rule while retaining evidence and source sessions.
2. Recheck every suggestion against current source and repository history. Drop obsolete or already-fixed findings and never invent improvements not supported by evidence.
3. Compose the remaining set into precise task criteria. Dry run reports buckets, evidence, and criteria without editing or marking.
4. Invoke `$task` once with those criteria and forwarded workspace flags.
5. From the task result and PR, map only actually shipped criteria back to suggestion IDs. Mark those `done` with the PR URL; leave dropped, deferred, or failed items pending.
6. Report implemented, already satisfied, deferred, and still-pending suggestions.
