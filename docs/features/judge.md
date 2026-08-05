---
type: feature
title: judge
description: Judge claude-proxy's fired suggestions against the raw transcripts they came from — confirm what the sessions support with context written from the transcript, dismiss what the rule misread, and record both verdicts per bucket in one call.
tags: [command, workflow, agents]
timestamp: 2026-08-05
updated: 2026-08-05
dirty: true
---

# judge

## Summary

claude-proxy's suggestion rules fire from counts and node positions. They cannot
see what the agent was doing, so a rule reports a genuine slowdown and a misread
with identical confidence — fifteen read-only calls issued serially look the same
whether they were an unbatched sweep or a probe of an unfamiliar repo where each
answer decided the next.

This command reads the **raw transcripts** behind each fired suggestion and
returns one verdict per suggestion: **CONFIRMED**, with a note written from what
the session was actually doing, or **DISMISSED**, with the reason the rule
misread it.

It is [improve](improve.md)'s precondition rather than an optional pass over it.
`/improve` composes criteria from confirmed suggestions only, so an unjudged
bucket is a bucket whose findings cannot reach a PR. Judging is what makes the
criteria trustworthy; skipping it is how a rule's arithmetic error becomes a
permanent rule in someone's `AGENTS.md`.

## Flags / Parameters

- `--range <spec>` / `-r <spec>` — which session buckets to judge. One bucket
  (`9`), a list (`2,3,9`), a span (`2-9`), or a mix (`2-4,9`). **Default: every
  bucket.** The range selects candidates; only the dirty ones are judgeable.
- `--dry-run` / `-n` — report the dirty buckets in the range, the fired
  suggestions in each, and the transcripts that would be read, then stop. Nothing
  is read in full and no verdict is recorded.
- There is no free-text argument. Anything else is reported rather than
  interpreted.

## Environment

Resolved from the same variable [improve](improve.md) and [revive](revive.md)
use, via the shared `claude-proxy-checkout` snippet — never hardcoded:

| Variable | Required | Meaning |
| --- | --- | --- |
| `CLAUDE_PROXY_STORE` | yes | Directory holding the proxy's session transcripts. Its parent is the log directory the verdicts are written to; the directory above that is the claude-proxy checkout, confirmed by its `server/package.json`. |

```sh
export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
```

Unset, missing, or no `server/package.json` in the derived checkout: the command
**stops** and says which check failed, rather than searching the filesystem.

## Behavior

**Dirty buckets are the only judgeable ones.** A dirty bucket is complete and
unjudged — its ten sessions are all recorded, so its counts are final, and no
verdict exists against them yet.

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions buckets --dirty -r 2-9 --json
```

Two refusals are absolute. **Never judge a partial bucket**: it is still
accumulating, so a verdict written now describes counts that will not exist, and
it is recorded against a bucket that will never be re-read. **Never judge a
bucket already marked judged**: a second pass overwrites considered notes with
fresh guesses, and re-judging is a deliberate backfill rather than this
command's business. Nothing dirty in the range ends the run with that answer —
the good outcome, not a failure.

**The read cost is stated before reading, and confirmed when large.** A bucket is
roughly 55 KB of transcripts typically and about 180 KB worst case. A bare
`/judge` over dozens of dirty buckets is a backfill measured in megabytes; the
bucket count and rough total are named and confirmed first.
`suggestions judge --amnesty` is the alternative that draws a line under the
history without reading anything.

**Node positions are what make a verdict better than an impression.** Each fired
suggestion's `sources[]` names the sessions it came from and, per source,
`nodeIndexes` — the exact transcript positions that matched. The transcript is
read at the place the rule looked rather than skimmed for a general impression. A
suggestion with no `sources` has nothing to check and is dismissed as
unverifiable on those grounds.

**The transcripts are read in one batched pass**, from
`<logDir>/sessions/<threadId>.md`. The ten paths are enumerated from the bucket's
thread ids, then all ten `Read` calls go out as parallel calls in a single turn.
Reading cost is not the concern here — batching is. One read per file across ten
turns is the failure the batched-discovery step exists to prevent, and it is the
natural mistake at this point because the file list arrives complete and then
invites being walked.

**One verdict per fired suggestion, no exceptions.** A bucket is marked judged as
a whole, so a suggestion left without a verdict is one silently accepted.

- **CONFIRMED** carries a note written from the transcript at the matched nodes:
  what workflow phase was running, what it was trying to do, and what the slow
  shape actually was. It **never restates the rule's own `detail` string** —
  `detail` is generated from counts, is already stored, and a paraphrase of it
  adds a sentence and no evidence while reading like corroboration. When there is
  genuinely nothing to add, the note says so; that is honest and useful, and
  padding it is not. The note is what `/improve` composes a criterion's reason
  from, so it is written for a reader who has the `detail` already and the
  transcript not at all.
- **DISMISSED** names the gap between what the rule counted and what was
  happening — a deliberate probe counted as serial discovery, one error message
  from two unrelated causes, a guardrail correctly refusing a call, a re-read of a
  file another agent had just rewritten. "Looks like a false positive" is a
  verdict with the evidence left out.

**The suggestion is judged, not the rule.** A rule wrong in this bucket may be
right in the next; a rule wrong in every bucket is a *defect*, reported by
`suggestions defects` from the dismissal record and dispatched by
[improve](improve.md) as a criterion against claude-proxy's own rule code. That
pattern emerges from getting each bucket right and cannot be shortcut by
dismissing a rule wholesale.

**Both verdict sets are recorded in one call per bucket:**

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions judge -r <bucket> --confirm ... --dismiss ...
```

Not one call per suggestion, and not a confirm call followed by a dismiss call —
that call sets the bucket's judged flag, so splitting it means a run dying between
halves leaves the bucket judged with half its verdicts missing. The exact form for
attaching a note to a confirmation and a reason to a dismissal is read from
`suggestions judge --help` rather than guessed, because a verdict stored without
its note cannot be repaired: the bucket is judged and will not be re-read. A
bucket whose call reports fewer verdicts than it had fired suggestions is a failed
bucket to be re-judged, not a partial success. Buckets are judged one at a time so
a failure names one bucket rather than an unknown subset.

## Rules

- **A dismissal is not a regression.** `regressed` means a dated fix did not hold;
  `dismissed` means the finding was never true. `/improve`'s regression track
  never sees a dismissed row, because escalating a rung against a finding that was
  never true builds a mechanical gate to prevent something that did not happen.
- **A dismissal is not a `skipped` either.** `skipped` is a person deliberately
  passing over a real finding; `dismissed` is a verdict that the finding is false.
- **Never confirm to be safe.** A confirmation is what lets a suggestion become a
  criterion and then a standing rule for every future session.
- **Never dismiss to be quick.** The transcripts are the only thing that can
  separate the two, and reading them is the entire cost of this command.
- **Judging writes to claude-proxy's store, not to any repo.** No branch, no edit,
  no commit. A verdict implying a code change is `/improve`'s dispatch to make.

## Related

- Command source: `src/commands/judge.md`
- Orchestrated by: [improve](improve.md), which judges every dirty bucket in its
  range before composing criteria and stops when judging fails
- Shares the `CLAUDE_PROXY_STORE` dependency pattern with: [improve](improve.md),
  [revive](revive.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
