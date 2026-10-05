---
type: adr
title: /read-tweet's reader-proxy order follows observed reachability, recorded here with dates
description: Which reader proxy returns an X post depends on its operator holding a live X session, so the prompt keeps an ordered list and this record keeps the dated observations behind the order.
tags: [process, commands, read-tweet, decisions]
timestamp: 2026-10-05
dirty: true
decided-by: /task
ratified: false
needs-human: false
---

# /read-tweet's reader-proxy order follows observed reachability, recorded here with dates

## Status

Accepted. `/read-tweet` shipped in PR #96. **Written by `/task`, not ratified by a human**,
under [ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md); it holds the
dated observations `src/commands/read-tweet.md` carried inline until
[ADR 0021](0021-command-prompts-state-the-rule-and-adrs-keep-the-history.md).

## Context

X blocks automated reads, so `/read-tweet` fetches a post through a reader proxy. Whether a
proxy works depends on its operator holding a live X session, which changes over time.

Observations behind the current order:

| Prefix | Observed | Result |
|--------|----------|--------|
| `https://r.jina.ai/<x.com URL>` | 2026-08-15 | Returned the post text |
| `https://xcancel.com/<user>/status/<id>` | 2026-08-15 | Returned a bot-check interstitial |

## Decision

The prompt lists prefixes in order, falls through on a bot check, a login wall, or an empty
body, and promotes a lower prefix when it wins repeatedly. A change to the order adds a dated
row here.
