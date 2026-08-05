---
type: feature
title: improve
description: Turn claude-proxy's session suggestions into an implemented improvement — read the pending findings for a range of session buckets, escalate the ones whose last fix didn't hold, hand them to task as criteria, and flag what shipped as done.
tags: [command, workflow, agents]
timestamp: 2026-07-26
updated: 2026-08-05
dirty: true
---

# improve

## Summary

claude-proxy groups every ten recorded sessions into a bucket and reports what
would have reached the same outcome in fewer steps — independent work issued
serially, an error rediscovered session after session, a guardrail refusing a call
the agent had already decided to make, the same file read three times in one run.
This command reads those findings, keeps only the ones still **pending**, has
[judge](judge.md) check them against the raw transcripts, composes the **confirmed**
ones into task criteria, runs [task](task.md) on them in a subagent per target
repo, and then flags the suggestions that actually shipped as `done` so a later run
over the same range doesn't re-propose them.

The governing rule: **the suggestions are the criteria.** Every change traces back
to a suggestion with its own evidence and source sessions; the command does not
add improvements of its own.

Its corollary: **a rule firing is not the same as something having gone wrong.** A
rule counts calls and node positions and cannot see intent, so nothing is composed
from unjudged rule output. Every dirty bucket in the range is judged first, and a
judge run that fails stops the command rather than degrading into the intuition
this pipeline exists to replace.

The second rule follows from the first: **a suggestion whose last fix didn't hold
is not a fresh finding.** claude-proxy dates every `done` and reports a rule as
`regressed` once it trips across a window recorded entirely after that claim. Those
rows take a separate track — the prior fix is read back from its PR, and the new
one must climb an escalation ladder rather than restate what already failed.

## Flags / Parameters

- `--range <spec>` / `-r <spec>` — which session buckets to read. One bucket (`9`),
  a list (`2,3,9`), a span (`2-9`), or a mix (`2-4,9`). **Default: every bucket.**
- `--regressed` / `-g` — narrow the run to the **regression track only**: rules that
  already shipped a dated fix and tripped again anyway. Fresh findings are neither
  read nor composed. Composes with `--range` and `--dry-run`. Without it, both
  tracks run and the regression block leads.
- `--dry-run` / `-n` — report the suggestions and the criteria they compose into,
  then stop. No subagent, no branch, no PR, nothing marked. **It still judges**:
  judging records verdicts about transcripts rather than claims that a fix shipped,
  and criteria are only worth reporting if they came from confirmed findings.
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
| `CLAUDE_PROXY_API` | no | Base URL for the HTTP equivalent of the CLI. Default `http://127.0.0.1:8788`. |

```sh
export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
```

If the variable is unset, its path is missing, or the derived checkout has no
`server/package.json`, the command **stops** and says which check failed rather
than searching the filesystem or guessing a path.

## Behavior

**Reading pending work.** Suggestions carry a status flag — `pending` by default,
`done` once applied, `skipped` when deliberately passed over, `dismissed` once a
judge verdict found the rule had misread the session — keyed by
`(bucket, suggestion id)`, both of which are stable, so a flag survives the
recomputation claude-proxy does on every read. The command lists only pending rows,
with detail:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions list -r 2-9 -s pending -d --json
```

The CLI reads the log directory directly, so **no proxy server needs to be
running** — prefer it.
`GET $CLAUDE_PROXY_API/api/sessions/suggestions/status?status=pending&detail=1&range=<spec>`
is the equivalent when a server already is. Each row carries `bucket`, `label`,
`id`, `severity` and `title`, and under `-d` its `detail`, `evidence` and
`sources`; `meta.missing` names buckets in the range that don't exist yet — they
are reported and skipped. An empty pending set ends the run with that answer and no
task.

**Judging the dirty buckets.** Before any criterion is composed, the **dirty**
buckets in the range — complete and unjudged — are found and handed to
[judge](judge.md):

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions buckets --dirty -r 2-9 --json
```

Nothing dirty means every bucket already has verdicts and this phase is done.
Otherwise `/judge -r <the dirty buckets>` does the transcript reading, the
verdicts and the recording; `/improve` reads no transcripts of its own, then
re-reads the suggestions so they carry their verdicts. Two limits govern it:

- **A failed judge run stops the command.** An errored call, a bucket recording
  fewer verdicts than it had fired suggestions, or a `/judge` run that could not
  finish means stopping and bringing the human in. **There is no fallback to
  composing from unjudged output** — the dirty flag is the record that nobody has
  checked these findings against reality, and a silent fallback makes a failed
  judge run indistinguishable from a clean bill of health, producing a PR that
  looks exactly like a well-evidenced one and is not.
- **The judging is capped at 5 buckets.** More than five dirty buckets in the
  range stops the run with the bucket count and rough read cost, and the two ways
  forward: narrow `--range`, or draw a line under the history with
  `suggestions judge --amnesty`. The default range is *every* bucket and the
  unjudged backlog runs to dozens, so at roughly 55 KB per bucket an uncapped
  first run reads megabytes of transcript before composing a single criterion.

**Confirmed suggestions only.** A dismissed row is excluded entirely — not a
weaker criterion, not a note on another one; a dismissal says the finding was never
true, so there is nothing to fix and nothing to defer. Where a confirmed row
carries a **judge enrichment note, that note is the criterion's reason**: it was
written from the transcripts by an agent that read the nodes the rule pointed at,
which makes it better evidence than the rule's generated `detail`. The `detail`
stays alongside it as the count. Where the note says there was nothing to add
beyond that `detail`, the `detail` is used.

**The two fields that decide the track.** Every row also carries `recurrence` —
`none`, `historical`, `mixed` or `regressed` — and, once someone has marked that
rule `done`, a `resolved` object naming that claim's `bucket`, `updated` timestamp
and `note`. **Status alone cannot separate a regression from a fresh finding,
because a regressed row is still `pending`**: the flag records what a person
claimed, `recurrence` records what the sessions did afterwards, and a rule marked
`done` on bucket 38 that trips again on bucket 41 has no flag of its own on that
later bucket. Both fields are kept through criteria composition rather than
discarded. `--regressed` narrows at the CLI with `--recurrence regressed` instead
of filtering after the fact.

**The regression track.** Regressed rows compose into their own criteria block,
placed ahead of the fresh findings. For each one:

- **The prior fix is read back** from the PR URL in `resolved.note` — which may
  point at any repo — via `gh pr view` and `gh pr diff`, and the files it touched
  plus a summary of what it changed go into the criterion. The subagent cannot see
  the calling run's reads, so an unstated prior fix is one it will repeat.
- **The mechanism is classified on a four-rung ladder**: (1) a prose rule in
  `AGENTS.md`/`CLAUDE.md` that has to be read and remembered; (2) a step written
  into the command that needs it, so the pipeline triggers it; (3) a mechanical
  gate — a hook, a script, a verify check, a changed tool default — that fires
  without agent cooperation; (4) removing the affordance so the slow path stops
  existing. The criterion names the prior fix's rung and requires the new one to
  climb at least one. Restating the same rule at the same rung is forbidden,
  including a longer or firmer version of it: **this is about mechanism class, not
  wording.** A rule already written down and still not followed doesn't need to be
  written down more emphatically.
- **An unattributable regression drops to the normal track.** No `resolved`, no
  note, or a note that isn't a resolvable PR URL means there is no original
  solution to differ from, so it composes as an ordinary finding and is reported as
  regressed-but-unattributable.
- **`mixed` is not a weak `regressed`.** That window straddles the claim, so part
  of its evidence predates the fix and proves nothing; it stays an ordinary
  pending finding.
- **A dismissed row never enters this track.** `regressed` means a dated fix did
  not hold; `dismissed` means there was never anything to fix. Conflating them
  escalates the ladder against a finding nobody needed to fix — writing a
  mechanical gate to prevent something that did not happen.

**Composing criteria.** Rows are grouped by what would change — the same rule
tripping in several buckets is one improvement with more evidence, not several —
but never across tracks, since a regressed row and a fresh row for the same rule
are different asks. Each criterion carries the suggestion's own detail and evidence
plus the `bucket/id` pairs behind it, because the subagent has no access to the
calling conversation. Since these findings describe how an *agent* works, the fix
is usually in instructions (a command source, an `AGENTS.md` rule) rather than
application code, and the criterion names **both the repo and the path**. A fix
belonging to a different *checkout* is not out of scope: the next phase dispatches
it there.

**A defective rule gets a criterion, not a shrug.** A rule that keeps firing on
things the transcripts don't support is a defect in claude-proxy's own rule code,
and the dismissal record is the evidence for it:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions defects --json
```

Each rule reported defective composes as an ordinary criterion against the
claude-proxy checkout at `packages/core/src/suggestions.ts`, with the buckets it
was dismissed in and **the dismissal reasons themselves** as evidence — those
reasons say what the rule counted versus what was happening, and that gap is the
specification for the fix. The ask is to narrow what the rule matches so the
dismissed cases stop firing **without silencing the confirmed ones in the same
buckets**; a rule that stops reporting a real slowdown is not fixed. No new
dispatch machinery is needed, since the next phase already runs one subagent per
repo and claude-proxy is one of them.

This is the exit path a defective rule previously lacked. Left as "out of scope and
still `pending`", a systematically-wrong rule billed attention on every future run
and could never be resolved, because nothing in the command was allowed to touch
what was actually broken. A suggestion whose fix belongs to claude-proxy's
dashboard or recurrence model rather than its rule code still stays pending and is
reported as out of scope — that part is unchanged, and `defects` is the narrow case
with an answer.

**Running the task.** Criteria are grouped by the repo they land in, and **one
fresh subagent per repo** runs `/task <pass-through flags> <criteria>`, sequentially,
each told the absolute checkout path to work in. Most runs are one repo and so one
subagent; more than one exists because the ladder moves work *between* checkouts —
a rung-1 rule that failed in one repo's `AGENTS.md` is often answered by a rung-2
step in a command living in another. `/task` owns the workspace, verification,
commits and the PR from that point; `/improve` creates no worktree and makes no
edits of its own.

**Flagging what shipped.** Only the criteria the subagents report as implemented
are marked:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions mark -r <bucket> -i <id>[,<id>...] -s done -n "<PR url>"
```

Marking is one call per bucket, with the PR as the note. Anything dropped or
deferred stays `pending` so it returns on the next run; `skipped` is reserved for a
deliberate pass with a stated reason. **A dismissed suggestion is never marked at
all** — `done` would claim a fix that does not exist and `skipped` would record a
real finding deferred, and both are dated claims later sessions get read against. If no PR was opened, nothing is marked. A
criterion whose fix spanned two repos is marked only once **every** one of them has
landed — half a fix is not a fix, and a `done` is dated, so an early mark makes
every session recorded afterwards read as evidence against a fix that wasn't there.

**Re-marking a regression.** A regressed suggestion is being fixed at least the
second time, and `resolved` keeps only the most recent claim — so marking this
attempt overwrites the pointer to the last one. It is still marked `done`, because
that is what re-dates the claim and lets a *third* failure surface as a fresh
regression; the note is what carries the history:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions mark -r <bucket> -i <id> -s done \
  -n "attempt 2 (rung 1 → rung 3); <new PR url> supersedes <prior PR url>"
```

**Closing the run.** The final report names the range read, which buckets were
judged with how many confirmed versus dismissed, how many suggestions were pending,
how many were regressed, any defective rule dispatched to claude-proxy, the
criteria that shipped, the PR
number/URL for each repo, what was marked `done` or `skipped`, and what stays
`pending` with why. It is delivered in a text-only turn; a subagent's report is
never that turn.

## Related

- Command source: `src/commands/improve.md`
- Delegates to: [judge](judge.md) for the verdicts, and [task](task.md), which ends
  via [clean](clean.md) and [pr](pr.md)
- Shares the `CLAUDE_PROXY_STORE` dependency pattern with: [revive](revive.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
