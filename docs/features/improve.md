---
type: feature
title: improve
description: Turn claude-proxy's session suggestions into an implemented improvement — read the pending findings for a range of session buckets, escalate the ones whose last fix didn't hold, hand them to task as criteria, optionally build the accepted ideas a human named, and flag what shipped as done.
tags: [command, workflow, agents]
timestamp: 2026-07-26
updated: 2026-08-09
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

A second input sits beside the suggestions and is **opt-in**: the ideas
[ideate](ideate.md) proposed and a human **accepted**. `--idea <slug>` names the
ones this run builds and `--ideas` takes every accepted idea for the repo; with
neither flag no ledger is read and no idea becomes a criterion. Each selected idea
builds in **its own `/task` run, its own branch and its own PR** — never folded
into the suggestion brief for the repo it lands in.

The governing rule: **the suggestions are the criteria** — and so are the ideas a
human accepted. Every change traces back to something somebody else produced: a
suggestion with its own evidence and source sessions, or a recorded human sign-off
on an idea. The command adds no improvements of its own, and never acts on an idea
still `proposed` or already `rejected`.

**An idea flag makes the run idea-only.** `--idea` or `--ideas` suppresses the judge
and suggestion tracks entirely — no pending suggestions read, no bucket judged, no
suggestion criterion composed, nothing marked in the suggestions store — so exactly
one track runs in any given run. Naming ideas is a request for those ideas, and a
run that also swept the pending set would size itself from whatever the rules fired
on since last time: the same objection that made the idea track opt-in, pointed the
other way. It also keeps the expensive half of the command, reading transcripts by
the megabyte, out of a run that was never going to compose a suggestion criterion.

Its corollary: **a rule firing is not the same as something having gone wrong.** A
rule counts calls and node positions and cannot see intent, so nothing on the
suggestion track is composed from unjudged rule output. Every dirty bucket in the
range is judged first, and a judge run that fails stops the run rather than degrading
into the intuition this pipeline exists to replace. **Judging is a precondition of
the suggestion track, not of the command**: an idea-only run composes no suggestion
criterion, so there is no unjudged output for a verdict to guard.

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
- `--idea <slug>[,<slug>...]` / `-i <slug>` — build the **named** accepted ideas,
  one PR each. Comma-separated; the values are slugs, never titles. A named slug
  that is not on the ledger, or is on it in any status other than `accepted`,
  **stops the run** naming the slug and the status it actually holds — it is never
  a silent skip. Without this flag and without `--ideas`, no ideas are read at all.
- `--ideas` — the escape hatch, taking **every** accepted idea for the repo with no
  slug list. Same one-idea-one-PR dispatch; it changes only which ideas are
  selected. Given together with `--idea`, the union is every accepted idea, so
  `--ideas` wins and the report says so.
- **Either idea flag suppresses the judge and suggestion tracks outright.** An
  idea-only run reads no pending suggestions, judges no dirty bucket, composes and
  dispatches no suggestion criterion, and marks nothing in the suggestions store.
  Exactly one track runs in any run, because the same flag decides both. The report
  says the suggestion track was **deliberately skipped because an idea flag was
  given** — never that it was empty, which describes a run that looked.
- **`--range` and `--regressed` are suggestion-track flags**, so an idea flag leaves
  them nothing to apply to. That is reported, not an error.
- `--dry-run` / `-n` — report whatever the run's track would produce, then stop. No
  subagent, no branch, no PR, nothing marked. **On a suggestion run it still
  judges**: judging records verdicts about transcripts rather than claims that a fix
  shipped, and criteria are only worth reporting if they came from confirmed
  findings; an idea-only run has nothing to judge. On an idea-only run it also
  reports each selected slug's file scope, its stated dependencies, and the dispatch
  schedule it would use. It
  also reports the ideas it would act on and the ledger tier it read them from — or,
  with no idea flag, that it read none and why. An unresolved `--idea` slug stops a
  dry run exactly as it stops a real one.
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

**Reading pending work — only when no idea flag was given.** The suggestion read
below is skipped entirely under `--idea`/`--ideas`, for the mirror image of the
reason the idea ledger is not read without them: a run that reads a queue "just to
report it" ends up composing from it.

Suggestions carry a status flag — `pending` by default,
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

**Reading the accepted ideas — only when asked.** The idea track runs only under
`--idea` or `--ideas`. With neither, no ledger tier is read, no idea criterion is
composed, and the final report says so plainly rather than leaving the omission to
be inferred: an accepted idea is standing permission to build something, not a
queue that drains into whichever run comes next. Under one of the flags, the
accepted ideas for this repo are read through the same waterfall
[ideate](ideate.md) writes to — tier 1 `<logDir>/ideas.json` via the `ideas` CLI,
tier 2 the repo's own `docs/ideas.md`, tier 3 `~/.claude/ideas/<repo-slug>.md`,
with an absent CLI meaning tier 1 is *absent* and a tier that exists and fails to
read meaning **stop**:

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas list --available --repo <slug> --json
```

The repo is a **git remote slug**, never a checkout path, because the store is
device-wide. **`--available` is the read, replacing an older `-s accepted`**: it
returns `accepted` plus the ideas whose claim has expired, which is exactly the set
a run may take. `-s accepted` alone can never recover an idea a run picked up and
then died holding — that entry reads `claimed` and no sweeper restores it — while
`-s accepted,claimed` would hand out one a live run is still building. This does
**not** loosen the sign-off rule, and should not be narrowed back: `claimed` is
reachable only from `accepted`, so every available row was signed off. Nothing
outside that set is read — `proposed` is invention nobody signed off on, `rejected`
is invention turned down, `shipped` is already done, and a live claim belongs to
another run — and `--idea` does not relax that: naming a slug selects from the
available set rather than admitting anything into it. `--range` does not apply,
since ideas are not bucketed.

**The slug filtering happens in the command.** `ideas list` has **no `--slug`
filter**, so the call above returns the whole available set for the repo and the
selection is made against what came back: `--ideas` takes every row, `--idea` matches
each named slug exactly. **A named slug that does not resolve is a stop, not a
skip** — reported as unknown with the tiers searched and the available slugs that do
exist, or as present-but-unavailable with the status it actually holds, since
`proposed`, `rejected` and `shipped` each mean something different and only one is
fixable here. A slug held by a **live claim** is the one exception and is a skip
with a named holder rather than a stop: nothing is wrong, the claim expires or is
released, and the answer is to wait. The run stops on the first unresolved slug, before anything is
dispatched: a silent skip turns "build these three" into a run that quietly builds
two, and the missing one looks identical to one nobody asked for.

**Judging the dirty buckets.** On a suggestion run only — an idea flag skips this
phase whole, leaving every dirty flag exactly as it was for the next suggestion run
rather than clearing it. Before any suggestion criterion is composed, the **dirty**
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

**Idea-sourced criteria, one per group.** Each selected idea composes into a
criterion of its own, labelled idea-sourced, stating the sign-off as the evidence —
the slug, its rationale, and the evidence the idea itself cited with paths, since
the subagent cannot read the ledger. **An idea is a proposal, not a spec**: a named
mechanism passes through, and where none is named the criterion says what is
undetermined rather than inventing a design the sign-off does not cover. The
grouping stops at one idea — two ideas are never merged because they share a repo
or a file, and an idea is never added to that repo's suggestion brief. They argue
from different evidence, and a group carrying both can defend itself with only one
of them.

Each idea criterion also records the two fields the dispatch phase schedules from:
its **file scope** — the paths it is expected to create or change, with an
*undetermined* scope treated as the widest one rather than an empty one — and its
**stated dependencies**, meaning whether the idea's own rationale says it consumes
design tokens, a control primitive, a shared component, an API or CLI surface that
another selected idea introduces. Only a dependency the idea states counts; an
inferred one is a guess, and the sign-off covers a guess about sequencing no more
than a guess about design. Ideas in different repos never share a scope.

**Claiming an idea before it is built.** Every idea dispatch claims the idea in the
ledger *first*, before any code is written:

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas claim --slug <slug> --by <branch> --json
```

The claim exists because `accepted` used to be the status an implementing run looked
for right up until its PR existed, so two runs reading the ledger minutes apart both
saw one idea as free — claude-proxy PRs #139 and #140 built the same idea eleven
minutes apart and one was closed unmerged. **`--by` is the branch name the dispatch
is about to cut**, in `/task`'s own `<type>/<kebab-summary>` shape and named in the
brief so the subagent cuts exactly it. The branch is the holder because it is the one
string a second run can verify by itself — `git branch -r` either shows it or does
not — which distinguishes a claim backed by real work from one left by a run that
vanished; a run id or a person's name tells that second run nothing. **A refused
claim means another run holds the idea**: skip it and report the holder and
since-when, never build it anyway and never retry under a different `--by`. Only an
`accepted` idea, or one whose claim is stale or already yours, can be claimed at all,
so a claim cannot route around the human sign-off. A `--dry-run` claims nothing,
because a claim is a write. Once a dispatch returns a PR, the run re-claims the same
slug under the same branch with `--pr`: claiming is idempotent for the same holder,
and a claim carrying a PR never expires — the six-hour TTL is sized to *writing* the
change, while review is the long part of an idea's life.

**Running the task.** The two tracks dispatch on **different units**, and only the
one this run is on dispatches at all. Suggestion criteria are grouped by the repo
they land in and **one fresh subagent per repo** runs
`/task <pass-through flags> <criteria>`, **one at a time with each result read
before the next** — most runs are one repo and so one subagent, and more than one
exists because the ladder moves work *between* checkouts, a rung-1 rule that failed
in one repo's `AGENTS.md` often being answered by a rung-2 step in a command living
in another, so those briefs can reference each other.

Idea criteria dispatch **one fresh subagent per idea**: one idea, one branch, one PR,
never batched with each other and never merged into a repo's suggestion brief.
**Ideas that do not conflict are dispatched concurrently**, a wave at a time with
every result read before the next wave opens; ideas that genuinely depend on one
another run in order, and **a dependent idea branches off the branch it depends on**
rather than off `main`, dispatched only once that branch exists, with its brief
naming that base and targeting its PR there. Independence is not a reason to merge
two ideas into one dispatch — it is the reason they can run side by side.

**Two things, and only two, make one idea wait for another**: their file scopes
overlap inside one repo, or one's rationale states that it consumes what the other
introduces. Sharing a repo, sounding related, or coming from one `/ideate` run are
none of them. **A clean textual merge is never evidence of independence** — a stacked
idea merges without a conflict marker while referencing a token, prop or endpoint
that does not exist on its base, so the break surfaces at build time rather than in
the diff, which is why the test reads the rationale rather than probing the diffs.
Where the two tests disagree the stricter wins, and where it is unclear the run
serializes: an unnecessary wait costs one run's latency, a wrong parallel costs two
branches whose merge order changes the result.

**Every concurrent subagent gets an explicit lane** — the paths it owns and may
write, and the paths it must not touch, which are the other in-flight ideas' scopes
named as such. A subagent needing a file outside its lane stops and reports rather
than taking it; it cannot see the others, so a lane is the only thing keeping two
live branches from colliding. Same-repo concurrency is safe only because `/task`
cuts a **fresh worktree per run** — which is exactly what `--here` removes, so a
pass-through `--here` forces serial dispatch regardless of scope, and the report says
so. Each subagent is told the absolute checkout path to work in. `/task` owns the
workspace, verification, commits and the PR from that point; `/improve` creates no
worktree and makes no edits of its own.

**Flagging what shipped.** On an idea-only run this step does not run at all —
nothing was read from the suggestions store, so nothing is written back to it, and
no bucket's dirty flag moves. On a suggestion run, only the criteria the subagents
report as implemented are marked:

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

**Marking an idea that shipped.** An accepted idea whose criterion landed is marked
in the **ideas** store, never the suggestion one — two evidence standards, one file
each, and a slug is not a `bucket/id`:

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas mark --slug <slug> -s shipped -n "<PR url>"
```

**One call per idea, and the note is that idea's own PR.** Because each idea was
dispatched alone there is no shared run-wide URL to write, and a slug pointing at a
PR that built something else is a false record reading as a true one that no later
run can detect. An idea whose PR did not land stays `accepted` and returns next
time — the sign-off is still valid and the work still is not done — and because the
PRs are separate, one idea failing marks nothing against the others. A run given no
idea flag marks nothing in the ideas store at all. Nothing here moves an idea back
to `proposed` or `rejected`: the command implements advice, it does not overturn a
human's sign-off. **`shipped` keeps the claim**, deliberately — it becomes the record
of which branch built the thing, beside the PR in the note — and it still means the
work *landed*, which is what it went back to meaning once the claim took over saying
that somebody is building it.

**Releasing a claim the run is not going to ship.** Every exit routes through the
closing turn, so that is where an unshipped claim is handed back:

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas mark --slug <slug> -s accepted
```

Every mark other than `shipped` drops the claim, which is what makes this the
release. It lives on the closing turn because the exits that most need it are the
ones nobody plans for — a run that gives up, is refused, or hits a failing gate is
in each case holding an idea it will not build. Without the release that idea reads
as taken for the full six-hour expiry and every `/improve` in the window skips it,
blocked by a holder that went away rather than by any real work. Only what did *not*
ship is released: a landed idea already carries its PR and was marked `shipped`, and
a run that opened a PR but stopped before marking leaves the claim alone, since a
claim carrying a PR does not expire and shows the next run the work exists.

**Re-marking a regression.** A regressed suggestion is being fixed at least the
second time, and `resolved` keeps only the most recent claim — so marking this
attempt overwrites the pointer to the last one. It is still marked `done`, because
that is what re-dates the claim and lets a *third* failure surface as a fresh
regression; the note is what carries the history:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions mark -r <bucket> -i <id> -s done \
  -n "attempt 2 (rung 1 → rung 3); <new PR url> supersedes <prior PR url>"
```

**Closing the run.** The report says **which track ran, and why the other did not**.
A suggestion run names the range read, which buckets were judged with how many
confirmed versus dismissed, how many suggestions were pending, how many were
regressed, that no ideas were read and which flags would have read them, any
defective rule dispatched to claude-proxy, the criteria that shipped and the PR
number/URL for each repo. An idea-only run says the judge and suggestion tracks were
**deliberately skipped because an idea flag was given** — never that no suggestions
were pending or that nothing was judged, which are the sentences a reader mistakes
for an empty backlog — then how many ideas were selected, by which flag and from
which ledger tier, and **the schedule they ran on**: which went out together, which
waited on which and off what base, and why anything was serialized. Either report
lists the PR number/URL **for each idea on the idea track separately**, what was
marked `done` or `skipped`, which ideas were marked `shipped` and against which PR
each, and what stays `pending` or `accepted` with why. **On the idea track it also
says what happened to each claim** — which slugs were claimed and under which branch,
which were skipped because another run held them with the holder and since-when, and
which were released on the way out — because a skipped idea and an idea nobody
selected look identical in a report that counts only what shipped, and the first is
coming back on the next run. It is delivered in a text-only turn; a subagent's report
is never that turn.

## Related

- Command source: `src/commands/improve.md`
- Delegates to: [judge](judge.md) for the verdicts, and [task](task.md), which ends
  via [clean](clean.md) and [pr](pr.md)
- Consumes the accepted output of: [ideate](ideate.md), which proposes the ideas and
  records the human sign-off this command's `--idea` / `--ideas` flags act on
- Shares the `CLAUDE_PROXY_STORE` dependency pattern with: [revive](revive.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
