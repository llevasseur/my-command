---
type: feature
title: verify
description: Close the loop on a branch by booting the repo's own app, having a long-lived agent exercise the change inside it, repairing what comes back, and re-checking until the verdict is green or the rounds run out.
tags: [command, workflow, verification, agents]
timestamp: 2026-08-23
---

# verify

## Summary

Every gate this repo's commands run before now answers a question about the
*code*: does it compile, does it lint, does the test suite pass. None of them
answers the question the criteria were actually written about — does the thing
the change was supposed to do actually happen in the app. `/task` could ship a
settings toggle that renders, compiles, lints, tests green, and does nothing when
clicked.

`/verify` closes that loop. It boots the repo's own app, spawns an agent that
exercises the change against it, reads back a verdict, repairs the code, and
re-checks — against the same server, up to a round ceiling. It is invokable
standalone against a branch, and it is also `/task` Step 2.6, which is where most
runs will meet it.

The verdict is **advisory**. See [The advisory
tradeoff](#the-advisory-tradeoff).

## Flags / Parameters

- `--rounds <n>` — the round ceiling. Default `12`, and it **must exceed 10**; a
  smaller value is refused rather than clamped. Repair converges late or not at
  all, and a ceiling that ends the loop early reports `red` for a fix two rounds
  away.
- `--no-verify` — do nothing, report `skipped`. Uniform wherever it is passed,
  including as a `/task` flag.
- `--smoke` — also exercise the repo's own smoke scenarios rather than only the
  diff. Off by default.
- Anything else is the **intent** — what the change was supposed to do.

## How it works

1. **Resolve the branch and the intent.** Given intent is used as given. Absent
   it, the run infers one from the branch diff, the branch name, and the PR body,
   and **says in its report that the intent was inferred**, with what from. A
   verdict is worth what the criteria behind it are worth, and an inferred
   criterion is weaker than a stated one.
2. **Read the run contract.** `scripts/bootstrap-worktree.sh
   --print-verify-contract` prints `{boot, health, login, routes}`. A repo whose
   bootstrap does not carry the flag falls through to **detection** — a `dev`,
   `start`, or `preview` script, with the real bound port read out of the startup
   log rather than assumed from `PORT`. `/task-bootstrap` is what writes a
   contract; see [task-bootstrap](task-bootstrap.md).
3. **Boot.** `my-command-tools app start` picks an ephemeral port, health-waits,
   and records the pid.
4. **Spawn the verifier once.** One `mycommand-verifier` agent, continued with a
   message per round. The boot, the driver, and its repo context are paid for
   once rather than re-derived twelve times.
5. **Repair in the caller's context.** The verifier observes and never edits
   code; the caller holds the criteria and does the fixing, then messages the
   same live agent to re-check.
6. **Stop the app, always.** `my-command-tools app stop`, on every exit path.

## Verdicts

Four, flat, no sub-states:

| Verdict | Means |
|---|---|
| `green` | The criteria are demonstrably true in the running app. |
| `red` | Exercised, and wrong or broken. |
| `unverified` | Could not be exercised — boot failed, tier too low, route unreachable. |
| `skipped` | Nothing in the diff is served by the app. |

`green` is only expressible alongside a filled `exercised` field naming the
route, the interaction, and the observed result. A verifier that cannot fill all
three writes `unverified` instead. This is the load-bearing rule of the whole
feature: without it, "the build passed and the server started" drifts into
`green`, and a green that means "nothing crashed" is worse than no check at all,
because it is trusted.

On the `playwright` tier `green` carries a second requirement — the screenshots
that round saved have been looked at, and what they showed is stated. See
[Looking at the screenshots](#looking-at-the-screenshots).

## Driver tiers

Taken in order, highest available, and **always reported**:

1. `playwright` — a headless browser: the repo's own installed Playwright, or a
   device-wide `playwright-cli` that `my-command-tools doctor` reports as
   installed.
2. `http` — boot plus HTTP probes.
3. `static` — source, config, and build output only. Can never reach `green`.

Tier 1 is **device-wide rather than repo-local**. The browser is a property of
the machine, not of the project, and one global install serves every repository
on it — where a repo-local gate meant the same laptop verified one project in a
browser and its neighbour over `curl`, for no reason a reader of either PR could
name. `/verify` reads `playwright.installed` off `doctor` and hands the verifier
the command; the verifier never probes for it.

**Nothing is installed to raise a tier.** No `npx playwright install`, no browser
download, no package add — unchanged by the widening, and it applies to the
device install as much as to the repo one. A device with no `playwright-cli` and
a repo with no Playwright of its own falls back to HTTP probes exactly as before;
`scripts/install-marketplace-personal.sh` prints `npm i -g playwright` for a
human and never runs it. Quietly opting a repo in would make a verification run
mutate the repo it was sent to observe.

## Where the screenshots go

Screenshots are the one thing a verification run leaves behind. The verifier
writes them into the `shotsDir` the caller hands it — this run's own directory in a
device-wide keep, `~/.my-command/shots/<repo>/<branch>/run-N/`, created and reported
by `my-command-tools worktree begin`. It sits outside the checkout on purpose: an
image inside the worktree lived only as long as somebody remembered to run
`worktree end`, and `/pr`'s own teardown never did. The keep holds a run for seven
days from its newest file; `worktree end` prunes past that on its way out, so a PR
that needs the images republished wants them within the week.

**The run directory is also what a read-back binds to.** Two loops on one branch both
photograph `home.png`, and matching a sentence to an image by filename could not tell
them apart: the second sentence displaced the first and then captioned both. Sitting
in the same directory as its image, a note has nothing to be confused with.

`/verify` Step 6 lists the saved files by path. A screenshot whose path was never
reported is evidence nobody reads.

Step 6 also **records what the loop did**, beside the images:
`my-command-tools shots record --tier <tier> --verdict <verdict> --rounds <n> --shot "<file> | <label> | <sentence>" --gap "<text>"`
writes `verdict.json` into the same run directory, beside the screenshots it
describes and nowhere they can be parted. That record is what makes them
publishable — `/pr` publishes a branch's screenshots when it says a **browser**
tier took them, and publishes nothing when no record exists.

Two things about it are deliberate. **Every ending records, not just a green
one**: a `red` loop's screenshots are the ones a reviewer most needs, so the
verdict is reported and never used to withhold them. And **the tier is the gate**,
which puts the weight on naming the tier truthfully. Recording `playwright` for a
round that only probed over HTTP would put unexercised images in front of a
reviewer as though a browser had loaded them, so `shots record` refuses a tier or
verdict outside the vocabulary rather than storing a typo that fails silently
months later.

## Looking at the screenshots

On the `playwright` tier the verifier **reads every screenshot it saved that round
back** and states what each one showed, one `saw:` line per file, above its verdict.
`green` on that tier is not reachable without it, and an image that contradicts the
intent makes the verdict `red` whatever the DOM assertions said.

Each `saw:` line has three parts split by ` | `: the filename, a label of a few words
naming what the shot is, and one sentence on what it proves against the intent. A
shot with no evidential value says so in its sentence. One `gap:` line per thing the
round could not prove sits beside them. The caller passes each to `shots record` as
`--shot` and `--gap`, and `/pr` publishes them as written; see [Every cell says what
its shot is and what it proves](pr.md#every-cell-says-what-its-shot-is-and-what-it-proves).

Until now nothing asked for that. The verifier was told to save each shot into
`shotsDir`, list the paths, and never paste images into the reply — and its verdicts
came from `playwright-cli eval`, page navigation, and console and network error greps.
Across seven recorded runs, four read no image at all; the eleven reads that happened
were the agent's own initiative rather than anything the spec required.

The gap that opens is a change that **mounts but renders wrong**. Overlapping text,
contrast that vanishes against its background, an element pushed off-screen, the wrong
colour. Each of those satisfies an assertion that the element exists in the tree, and
each of them fails the criteria a person wrote. The run then hands those same
unexamined images to `/pr`, which publishes them into the PR's before/after table as
though a browser had confirmed them, and the reviewer reads evidence nobody looked at.

Some things stay as they were. **Lower tiers are untouched**, because `http` probes and
`static` reads photograph nothing. **A round that saved no screenshots is untouched**
for the same reason. And **the reply stays terse**: a stated observation is one line of
the agent's own reading rather than a paste, and logs, markup, stack traces and image
bytes are as banned from the reply as they ever were.

The cost is roughly 1.5k tokens per image, about $0.01 to $0.04 on a Sonnet verify run
against ~$0.53 today. It was never the reason this was missing.

## The advisory tradeoff

Whether the verdict is green or red, the PR still opens. The verdict and the
round count go into the PR description. `/god`, `/manage` and `/dev` are
unchanged: a red loop does not block a merge.

That is a real tradeoff and it was made deliberately. A blocking loop is
strictly better *per run* — it cannot ship a broken change. But a check that can
block shipping is a check people switch off, and one that is off catches
nothing. An advisory loop that is always on, always reported, and always visible
in the PR description catches more in aggregate than a blocking one that gets
disabled the first Friday it is wrong. The rule is stated where the verdict
vocabulary is defined, in `agents/mycommand-verifier.md`, so it cannot drift
away from the words it qualifies.

## The seeded login

A run contract may carry a seeded dev account. It is honoured **only against a
localhost URL that the run itself booted**. Any other host — staging, a tunnel, a
deployed preview, or a `localhost` this run did not start — means the credentials
are withheld and the round reports `unverified`, naming the host.

The rule is about where credentials can be sent, not about whether the check is
convenient. A verification agent that will log in to whatever URL it is handed is
a credential exfiltration path wearing a test harness.

## Why replies stay terse

The verifier reports a verdict, a tier, one `exercised` line, a path, and — on
the browser tier — one line per screenshot saying what it showed. It never pastes
logs, HTML, screenshots, or stack traces into the reply, and leaves the full
evidence at the path for the caller to read on demand. A stated observation is
not an exception to that: it is a sentence the agent wrote, not bytes it copied.

Twelve rounds of pasted output exhausts the caller's context — and the caller is
the agent holding the criteria and doing the repairs. Spending its context on
evidence it did not ask for degrades the exact judgement the loop exists to
apply.

## Out of scope

- **Persisted Playwright spec files as a shippable regression suite.** The specs
  and logs the verifier writes are scratch under `$CLAUDE_JOB_DIR/tmp` and
  nothing of them lands in the repo. A generated suite is a maintenance surface,
  and deciding to own one is its own decision. Screenshots are the deliberate
  exception — see [Where the screenshots go](#where-the-screenshots-go) — and
  they are preserved outside the repository, not committed to it.
- **Repo-wide smoke scenarios by default.** Available behind `--smoke`, off
  otherwise. The diff is the subject.
- **Renaming `my-command-tools verify` to `gates`.** The toolkit verb and this
  command share a name and do different things. Resolving that is a separate
  ticket.

## Related

- [task](task.md) — Step 2.6 is this loop, default-on and self-skipping.
- [task-bootstrap](task-bootstrap.md) — writes the run contract this reads.
- [god](god.md) — merges regardless of the verdict, by design.
