---
type: feature
title: work
description: Build the ideas a human accepted — select them by slug or by area from the hosted ideas ledger, claim each one before any code is written, dispatch one task run per idea in waves that cannot collide, and mark each shipped idea against its own PR.
tags: [command, workflow, agents]
timestamp: 2026-08-10
updated: 2026-08-16
dirty: true
---

# work

## Summary

[ideate](ideate.md) proposes what is **missing** and a human accepts what is worth
building. This command is what builds them. It reads the hosted ideas ledger for
the ideas that are signed off and free to take, selects the ones this run is for,
**claims each one before any code is written**, and dispatches **one downstream
run per idea** — one idea, one branch, one PR — then marks each shipped idea
against the PR that actually built it. That downstream command is
[task](task.md) by default and [god](god.md) under `--delegate god`, which
carries each of those PRs the rest of the way to merged.

It is the ideas half of what used to be one command. [improve](improve.md) is the
advice half and is now advice only: it reads claude-proxy's session suggestions,
judges them, and never touches the ideas ledger. **No flag makes either one do the
other's job**, which is what removed the whole apparatus that used to arbitrate
between two tracks in one run.

The governing rule: **the accepted ideas are the criteria.** Every change traces
back to a recorded human sign-off. The command adds no ideas of its own, and never
acts on an idea still `proposed` or already `rejected`.

**An idea builds alone — but not necessarily one after another.** *Alone* is about
what a dispatch carries, not about when it runs: ideas whose file scopes do not
overlap go out **concurrently**, and only ideas that genuinely depend on one
another are made to wait.

## Flags / Parameters

**Selection.** `--idea` and `--area` are the two selectors, and giving both selects
the **union** of what each matches, never the intersection. The report says which
selector brought each slug in.

- `--idea <slug>[,<slug>...]` / `-i <slug>` — build the **named** ideas, one PR
  each. Repeatable and comma-separated; the values are slugs, never titles. A named
  slug that does not resolve **stops the run** naming the status it actually holds.
- `--area <area>[,<area>...]` / `-A <area>` — build **every available idea filed
  under those areas**. Areas are the ledger's own free-text vocabulary — the seeded
  `ui-ux`, `infrastructure`, `code-quality`, `services`, `commands`, plus any area a
  `/ideate` run invented — and `Unfiled` selects the area-less legacy rows.
  **`ideas list --area` matches exactly one area**, so a comma list is filtered in
  the command against one unnarrowed read rather than by looping the CLI.
- **No selector means every available idea for the repo.** That is the default, and
  it is the only selection `--max` caps.
- `--repo <slug>` — override the repo filter. Defaults to the git remote slug
  (`git remote get-url origin`). **Never an absolute checkout path**: the ledger is
  device-wide, and a path names a different thing on another machine.
- `--max <n>` — cap how many ideas one run dispatches, **default 5**, applying
  **only to a run with no selector**. Over the cap the run **stops** and reports the
  available count, the per-area breakdown, and that `--area`, `--idea`, or an
  explicit `--max` narrows it. An explicit selector means a person named the work,
  so `--idea` is never truncated.
- `--dry-run` / `-n` — report the selection, each idea's file scope and stated
  dependencies, the downstream command, and the dispatch schedule that would be
  used, then stop. No claim, no subagent, no branch, no PR, nothing marked.

**Downstream.**

- `--delegate <command>` / `-D <command>` — which command each accepted idea is
  dispatched to: **`task` (default)** or `god`. `/task` stops at an open PR and
  leaves a human the merge; [god](god.md) drives that same PR to green and
  **merges it without asking**. This command multiplies whatever it dispatches, so
  **`--delegate god` must be typed and is never inherited** — not from an invoking
  command, not from the ledger, not from a previous run. The opening announcement
  says the run will merge, and how many ideas that is.
- `--into <branch>` — the **merge target**, forwarded to each `/god`. **Only
  meaningful with `--delegate god`**; with the default delegate it is dropped and
  reported, since `/task` does not document it. Absent it, `/god` falls back to the
  default branch. It is the merge target and never the cut point — `--base` is the
  cut point, and a run that wants both says both.
- **Pass-through `/task` (or `/god`) flags** — `--here` / `-h`, `--base <branch>`,
  `--draft` / `-d`, `--add` / `-a <list>` are forwarded verbatim and not interpreted
  here, except that `--here` forces serial dispatch. [task](task.md) is the contract
  for what they mean. **`--draft` with `--delegate god` is a stop**, not a per-idea
  drop: `/god` rejects a draft outright, so dispatching it would be one stop per
  idea.
- Anything not a recognized flag is extra context.

## Environment

The ledger is **hosted**, and the CLI that talks to it lives in the claude-proxy
checkout. They are separate facts and they fail separately.

| Variable | Required | Meaning |
| --- | --- | --- |
| `IDEAS_URL` | yes | Address of claude-proxy's `operator` Worker. `CONCEPTS_URL` is accepted as a fallback — ideas and concepts are one dataset behind one Worker. |
| `IDEAS_TOKEN` | yes | Bearer token for that Worker. `CONCEPTS_TOKEN` is accepted as a fallback, for the same reason. |
| `CLAUDE_PROXY_STORE` | yes | Directory holding the proxy's session transcripts. Its parent is the log directory; the directory above that is the claude-proxy checkout the `ideas` CLI runs from. |

```sh
export IDEAS_URL="https://<your-operator-worker>"
export IDEAS_TOKEN="<the operator token>"
export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
```

**There is no local fallback, by design.** A device that cannot reach the ledger
does no ideas work — it does not read a repo's `docs/ideas.md`, a
`~/.claude/ideas/` file, or a `logs/ideas.json`. A private copy that looks complete
is exactly what hosting the ledger removed; see
`docs/adrs/0006-host-the-ideas-ledger.md` in claude-proxy. A device with neither
address or neither token **stops, naming both variables**. The address may be read
with `printenv IDEAS_URL`; the token is **never** printed, only checked for being
set.

## Behavior

**The downstream command changes where an idea ends, and nothing else.** `/god`
runs `/task` internally, so the branch, the worktree, the verification, the
commits and the PR are the same pipeline either way — it adds the last mile that
gets that PR green and merges it. Selection, claiming, briefs, lanes, waves and
one-idea-one-PR are identical under both. Two consequences are not: a dependent
idea is cut from the **merge target** under `--delegate god`, because `/god`
merges each idea's PR and deletes its remote branch before the next wave is
dispatched; and an idea counts as shipped only when its PR **merged**, so one
left open on a conflict, on red CI, or queued for auto-merge stays `accepted`
and the stop is named in the report.

**Reading the ledger.** One unnarrowed read returns the ideas that are signed off
and free to build for this repo:

```sh
~/.claude/my-command/hooks/ideas-read.mjs --available --repo <slug>
```

Every ledger read, claim and mark below goes through a **store hook** in
`~/.claude/my-command/hooks/`, installed beside the workflow gates and
allowlisted by name so each call costs no approval round-trip. `--available` is
passed straight to the Worker, which is what knows whose claim has gone stale —
that rule is not re-derived here, because two implementations of it would
disagree the first time either changed. Each hook prints **one status line and
always exits 0**, so the run reads the line rather than the exit code. The one
ledger-adjacent call that stays on claude-proxy's CLI is `ideas prompt`, below:
it composes a brief client-side from the export rather than making a store call
of its own, so hooking it would mean reimplementing claude-proxy logic here.

**`--available` is the read, replacing an older `-s accepted`**: it returns
`accepted` plus the ideas whose claim has expired, which is exactly the set a run
may take. `-s accepted` alone can never recover an idea a run picked up and then
died holding — that entry reads `claimed` and no sweeper restores it — while
`-s accepted,claimed` would hand out one a live run is still building. This does
**not** loosen the sign-off rule and should not be narrowed back: `claimed` is
reachable only from `accepted`, so every available row was signed off. Nothing
outside that set is read.

**`--area` is deliberately not passed to this read.** The CLI matches exactly one
area, a run may have been given several, and `Unfiled` is not an area it can filter
on at all. The unnarrowed read is also what makes the "area does not exist" stop
possible: a narrowed read cannot tell an empty area from a misspelled one.

**Selection happens in the command.** `ideas list` has no `--slug` filter, so the
read above is the whole available set and every selector is applied against what it
returned — every row with no selector, an exact slug match for `--idea`, an area
membership test for `--area`, and the union of the two when both are given.

**Two stops, and one skip that is not a stop.**

- **A named slug that does not resolve is a stop**, reported with the status the
  slug actually holds: unknown (offer the available slugs, so a typo is one glance
  from fixed), `proposed` (needs a sign-off on the dashboard's Advice page),
  `rejected` (turned down, and this command does not overturn that), or `shipped`
  (already landed, with its PR in the ledger note). The run stops on the **first**
  unresolved slug, before anything is claimed: a silent skip turns "build these
  three" into a run that quietly builds two, and the missing one looks identical to
  one nobody asked for.
- **An `--area` naming an area that does not exist is a stop too**, and for a reason
  easy to miss: a misspelled area selects nothing and looks **identical** to an area
  with no available ideas, so the run would quietly dispatch nothing and report
  success. Existence is decided against the areas actually on the ledger for this
  repo — the vocabulary is free text, so the seed list is not the authority — and
  the stop reports every area that does exist with its available count. **An area
  that exists but has nothing available is not a stop**; that is an honest empty
  selection.
- **A slug held by a live claim is a skip with a named holder**, not a stop. Nothing
  is wrong: the claim expires or is released, and the answer is to wait.

**Composing each idea's brief.** The brief is taken from the ledger rather than
re-derived:

```sh
LOG_DIR="<logDir>" pnpm --filter server ideas prompt --slug <slug>
```

`ideaTaskPrompt` in claude-proxy's `packages/core/src/ideas.ts` already assembles
the title, the rationale in `/ideate`'s fixed bullet order, every citation, the
claim lines, and — the part hand-assembly always loses — the human's **`comment`**,
quoted verbatim as build criteria that **override the rationale where the two
disagree**. Re-deriving a brief per subagent is how two briefs for one idea drift
apart, and reading `comment` is the only way a signer's build instruction reaches
the subagent at all. **An idea is a proposal, not a spec**: a named mechanism passes
through, and where none is named the brief says what is undetermined rather than
inventing a design the sign-off does not cover.

Two things are composed **here** rather than read from the ledger, because they are
facts about this run's schedule rather than about the idea: the **lane** and the
**base branch**. Each brief also names the repo and its absolute checkout path.

Each idea additionally records the two fields the schedule reads from: its **file
scope** — the paths it is expected to create or change, with an *undetermined*
scope treated as the widest one rather than an empty one — and its **stated
dependencies**, meaning whether the idea's own rationale says it consumes design
tokens, a control primitive, a shared component, an API or CLI surface another
selected idea introduces. Only a dependency the idea states counts; an inferred one
is a guess, and the sign-off covers a guess about sequencing no more than a guess
about design. Ideas in different repos never share a scope.

**Claiming before dispatch.** Every dispatch claims the idea *first*, before any
code is written:

```sh
~/.claude/my-command/hooks/ideas-claim.mjs <slug> <branch>
```

The claim exists because `accepted` used to be the status an implementing run
looked for right up until its PR existed, so two runs reading the ledger minutes
apart both saw one idea as free — claude-proxy PRs #139 and #140 built the same
idea eleven minutes apart and one was closed unmerged. **The holder is the branch
name the dispatch is about to cut**, in `/task`'s `<type>/<kebab-summary>` shape and
named in the brief so the subagent cuts exactly it. The branch is the holder because
it is the one string a second run can verify by itself — `git branch -r` either
shows it or does not — which distinguishes a claim backed by real work from one left
by a run that vanished. **A whole wave is claimed before any of it goes out**;
concurrency makes the claim matter more, not less. **`claimed:` on the hook's first
line is the permission to build, and every other line is a refusal** — the hook
always exits 0, so the exit status says nothing here and is never consulted. A
refused claim means another run holds the idea: skip it, report the holder and
since-when, never build it anyway and never retry under a different holder, and
**drop whatever was stacked on it** rather
than re-basing that onto `main` to keep it moving. Once a dispatch returns a PR the
run re-claims the same slug under the same branch with the PR url as a third
argument: claiming is
idempotent for the same holder, and a claim carrying a PR never expires — the
six-hour TTL is sized to *writing* the change, while review is the long part of an
idea's life. A `--dry-run` claims nothing, because a claim is a write.

**Scheduling and dispatch.** One fresh subagent per idea runs
`/task <pass-through flags> <that idea's brief>`. **Ideas that do not conflict are
dispatched concurrently**, a wave at a time with every result read before the next
wave opens; ideas that genuinely depend on one another run in order, and **a
dependent idea branches off the branch it depends on** rather than off `main`,
dispatched only once that branch exists, with its brief naming that base and
targeting its PR there. Independence is not a reason to merge two ideas into one
dispatch — it is the reason they can run side by side.

**Two things, and only two, make one idea wait for another**: their file scopes
overlap inside one repo, or one's rationale states that it consumes what the other
introduces. Sharing a repo, sounding related, or coming from one `/ideate` run are
none of them. **A clean textual merge is never evidence of independence** — a
stacked idea merges without a conflict marker while referencing a token, prop or
endpoint that does not exist on its base, so the break surfaces at build time rather
than in the diff, which is why the test reads the rationale rather than probing the
diffs. Where the two tests disagree the stricter wins, and where it is unclear the
run serializes: an unnecessary wait costs one run's latency, a wrong parallel costs
two branches whose merge order changes the result.

**Every concurrent subagent gets an explicit lane** — the paths it owns and may
write, and the paths it must not touch, which are the other in-flight ideas' scopes
named as such. A subagent needing a file outside its lane stops and reports rather
than taking it; it cannot see the others, so a lane is the only thing keeping two
live branches from colliding. Same-repo concurrency is safe only because `/task`
cuts a **fresh worktree per run** — which is exactly what `--here` removes, so a
pass-through `--here` forces serial dispatch regardless of scope, and the report says
so. `/task` owns the workspace, verification, commits and the PR from that point;
this command creates no worktree and makes no edits of its own.

**Flagging what shipped.** An idea whose brief actually landed is marked in the
ideas ledger:

```sh
~/.claude/my-command/hooks/ideas-mark.mjs <slug> shipped "<PR url>"
```

**One call per idea, and the note is that idea's own PR.** Because each idea was
dispatched alone there is no shared run-wide URL to write, and a slug pointing at a
PR that built something else is a false record reading as a true one that no later
run can detect. An idea whose PR did not land stays `accepted` and returns next time
— the sign-off is still valid and the work still is not done — and because the PRs
are separate, one idea failing marks nothing against the others. Nothing here moves
an idea back to `proposed` or `rejected`. **`shipped` keeps the claim**,
deliberately: it becomes the record of which branch built the thing, beside the PR
in the note. **Nothing is ever marked in the suggestions store** — that belongs to
[improve](improve.md), and a slug is not a `bucket/id`.

**Releasing a claim the run is not going to ship.** Every exit routes through the
closing turn, so that is where an unshipped claim is handed back:

```sh
~/.claude/my-command/hooks/ideas-mark.mjs <slug> accepted
```

Every mark other than `shipped` drops the claim, which is what makes this the
release. It lives on the closing turn because the exits that most need it are the
ones nobody plans for — a run that gives up, is refused, or hits a failing gate is in
each case holding an idea it will not build. Without the release that idea reads as
taken for the full six-hour expiry and every later run skips it, blocked by a holder
that went away rather than by any real work. Only what did *not* ship is released: a
landed idea already carries its PR and was marked `shipped`, and a run that opened a
PR but stopped before marking leaves the claim alone, since a claim carrying a PR
does not expire and shows the next run the work exists.

**Closing the run.** The report names how many ideas were selected and **which
selector brought each one in**; the **schedule they ran on** — which went out
together, which waited on which and off what base, and why anything was serialized
(scope overlap, a stated dependency, an undetermined scope, or `--here`); the PR
number/URL **for each idea separately**; which were marked `shipped` and against
which PR each; and what stays `accepted` with why. It also says **what happened to
each claim** — claimed and under which branch, skipped with the holder and
since-when, dropped because the idea it stacked on was skipped, or released on the
way out — because a skipped idea and an idea nobody selected look identical in a
report that counts only what shipped, and the first is coming back on the next run.
It is delivered in a text-only turn; a subagent's report is never that turn.

## Related

- Command source: `src/commands/work.md`
- Consumes the accepted output of: [ideate](ideate.md), which proposes the ideas and
  records the human sign-off this command acts on
- Split from: [improve](improve.md), which kept the suggestion track and is now
  advice only
- Delegates to: [task](task.md), which ends via [clean](clean.md) and [pr](pr.md)
- Shares the `CLAUDE_PROXY_STORE` dependency pattern with: [revive](revive.md)
- Spec: [Adding a command](../specs/adding-a-command.md)
