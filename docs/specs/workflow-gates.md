---
type: spec
title: Workflow gates
description: The PreToolUse and Stop hooks, and the toolkit recoveries, that enforce the workflow rules mechanically instead of relying on an agent recalling them.
tags: [process, hooks, toolkit, install, guardrails]
timestamp: 2026-08-04
updated: 2026-08-09
---

# Workflow gates

## Summary

A set of recurring agent behaviours — serial discovery, re-reading files already in
context, retrying a failure that has one known answer, ending a run without recording
an outcome — had each been written down twice and kept happening. The gates here are
the third attempt, and the first that does not depend on being remembered.

Two mechanisms, no prose:

- **Hooks** the harness runs on its own: a `PreToolUse` gate that refuses three
  specific call shapes, and a `Stop` gate that refuses to end a run with no outcome.
- **Toolkit recoveries** that resolve a known failure inside the tool that hit it, so
  it never surfaces as an error for an agent to interpret.

## The escalation ladder

Each gate below is placed on this ladder deliberately, and the placement is the point:

1. a prose rule an agent must read and remember
2. a step written into the command workflow that needs it
3. a mechanical gate that fires on its own, with no agent cooperation
4. removing the affordance, so the slow path cannot be taken

Rungs 1 and 2 were both occupied before this. `src/shared/batched-discovery.md` is
included by nine commands; `src/shared/closing-turn.md` by eighteen;
`signing-retry.md`, `gh-identity.md`, and `classifier-refusal.md` all exist. The rules
still tripped, in sessions recorded entirely after those were in place — and in other
repositories, where a consuming repo's `AGENTS.md` has no force at all. So nothing here
is allowed to be another sentence.

## Gates

| Behaviour | Rung | Mechanism |
|---|---|---|
| Serial discovery | 3 | `PreToolUse` refuses a 4th consecutive read-only **turn** |
| Redundant whole-file reads | 3 | `PreToolUse` refuses a re-read of an unchanged file |
| Re-narrowing on a file already read | 3 | `PreToolUse` refuses a shell dump of an unchanged file already read whole |
| The same probe re-issued per item | 3 | `PreToolUse` refuses an identical read-only command whose answer cannot have changed |
| Polling a condition already watched | 3 | `PreToolUse` refuses a probe of a file a `Monitor` in this session is following |
| Editing a file this session never read | 3 | `PreToolUse` refuses it, asking for the whole edit pass's reads at once |
| Relative `cd` that cannot resolve | 3 | `PreToolUse` refuses it, naming the absolute form |
| Unquoted glob matching nothing | 3 | `PreToolUse` refuses it — zsh would abort the whole command |
| Foreground `sleep` | 3 | `PreToolUse` refuses it, naming `Monitor` and `run_in_background` |
| Heredoc composing a file | 3 | `PreToolUse` refuses it, naming the `Write` tool |
| The job directory addressed from a worktree | 3 | `PreToolUse` refuses it, naming the worktree as the writable root |
| The gates not being armed at all | 3 | `doctor.hooks` reports it; `/sync` reports it as a failed sync |
| Unapproved signing prompt | 3 | `commit` retries once, itself |
| `must be a collaborator` | 3 | `pr` resolves the identity, itself |
| Hand-composed probes the classifier refuses | 4 | named read-only verbs, plus an installed allowlist |
| A run ending with no outcome | 3 | `Stop` refuses the stop |

High tool churn has no gate of its own as an aggregate — but its one recorded *cause* now
does: a session that armed `Monitor`s on a stalled install and then hand-polled the same
condition ~40 times. That is a specific, visible mistake rather than an aggregate, and the
transcript shows both halves, so it is gated. What remains unaddressed is churn with no
identifiable shape behind it, which is by construction not something a gate can see.

## Design rules the hooks obey

These run in every session on the device, so a false denial is worse than a missed
violation. Four properties are non-negotiable:

- **Fail open.** `guard()` in `src/hooks/lib/io.mjs` swallows every exception into a
  silent allow. A hook with a bug degrades to "no opinion", never to a blocked call.
- **Never guess.** Each gate refuses only a case that is unambiguous on its own
  evidence. The relative-`cd` gate fires only when the path genuinely does not exist,
  so the command was going to fail anyway. The re-read gate fires only when *both*
  reads asked for the whole file and the mtime predates the earlier one.
- **Never wedge.** Every denial is recorded per session, and a recorded denial is not
  repeated for the same subject. The worst a gate can cost is one corrected turn.
- **Always actionable.** A denial names the faster form: the batch, the
  `offset`/`limit` slice with the `rg -n 'foo|bar' <file>` locate-first step, the
  `--cwd`/`git -C` absolute-path form.

### Why turns, not calls

The serial-discovery gate counts consecutive assistant **turns** whose tool calls are
all read-only, not read-only calls. That is what makes it reward the fix rather than
punish it: twelve `Read`s sent as parallel calls in one turn are one turn, while twelve
sent one per turn are twelve. Counting calls would refuse the batched form it exists to
produce.

### Why one hook for two gates

Serial discovery and redundant reads are the same defect along two axes — discovery
spread across turns that should have been one, and the same bytes paid for twice — and
both are decided from the same transcript. One hook parses it once and cannot return two
answers that disagree.

### Why a batched turn must never be harder than a serial one

Every gate that counts anything counts **turns**, and every gate that judges a probe judges
it from evidence about *that command* and *that path* — never from how many calls a turn
carried. This is a hard constraint, not a preference: the rule that reported serial
discovery was **dismissed** in four of the buckets it fired in, because the measurement it
comes from has no turn boundary and no parallelism marker, so one turn issuing eight
parallel `Read`s is recorded identically to eight serial round-trips. Sessions that
announced "reading the core files in one batch" were flagged anyway.

So the gates target the two shapes that are unambiguous whatever the turn structure —
**re-narrowing** (asking for a range of a file already read whole and unchanged) and the
**repeat-identical probe** (the same command re-issued with nothing since that could have
changed its answer) — and a test asserts that a turn issuing seven parallel `cat`s of
distinct files is not refused. A change here that makes the parallel batch harder is wrong
by construction, however many violations it catches.

### Why the transcript, not a sidecar

Both read-only gates get their evidence from the session transcript at
`transcript_path`. It is authoritative where a state file is not: it survives the hooks
being installed mid-session, it is per-session with no keying of our own, and it
distinguishes one turn carrying six parallel calls from six turns carrying one each.
The only sidecar state is the anti-wedge record.

## Read-only classification

`src/hooks/lib/read-only.mjs` decides whether a call only reads. Its bias is asymmetric
on purpose: calling a mutation read-only inflates a discovery run and can deny a
legitimate call, while calling a probe not-read-only merely resets a counter. So
anything unrecognized is **not** read-only, a segment containing a substitution,
redirection, or `sudo` is never read-only, and `sed`/`perl` are absent entirely because
one missed in-place flag writes to a file.

## Arming, and proving it

**A rung-3 mechanism whose activation is an unverified manual step is only as strong as
that step.** The gates above shipped, were merged, and then did not execute for a week: on
the device that motivated them, `~/.claude/my-command/hooks` was never created and neither
hook appeared anywhere in `settings.json`. Command *files* had arrived — `judge.md` and
`improve.md` were both present, from PRs that merged afterwards — so commands reach a device
by a path that did not run `scripts/install-personal.sh`, and therefore never registered
anything. Every rule these gates enforce kept tripping in that window, and nothing anywhere
reported that no gate could have fired.

That path was the `npx` wizard, which installed the commands and the toolkit and stopped
there; it now arms the gates too, which is what closes the hole rather than only reporting
it. Three things close it:

- **Every Claude install surface arms them**, so there is no longer a way to arrive with
  the commands and without the gates. See [Install and off switch](#install-and-off-switch).
- **`doctor.hooks`** answers it from the two places that decide. For every entry the
  settings fragment declares, it reports whether that exact command is registered in the
  `settings.json` the harness reads, and whether the installed hooks directory is current —
  a symlink to *this* checkout, or the copy the wizard left and runs the toolkit from
  beside. `armed: false` names the missing entries, states the consequence —
  "they are files nobody executes" — and carries the `hint` that fixes it. **That hint
  follows the install surface**, because naming the wrong command is worse than naming
  none: a checkout gets `bash …/scripts/install-personal.sh`, a wizard-installed device
  gets `node …/hooks/install-hooks.mjs` since the scripts are already there and only the
  merge is missing, and a device with no hook bundle at all gets
  `npx @llevasseur/my-command`. A `settings.json`
  that cannot be parsed reads as unarmed rather than as absent, and `disabledByEnv` reports
  the off switch separately from a failure. The logic is `src/toolkit/lib/hooks-status.mjs`,
  tested against the real fragment.
- **`/sync` reports that status rather than assuming it.** Its step 5 previously said the
  registration "is re-applied idempotently" and reported nothing about whether it was.
  It now reads `hooks.armed` and calls `false` a **failure of the sync**. The installer
  checks the same field itself after registering, so the final line of a fresh install is
  what `settings.json` actually says rather than what was attempted.

`check-commands.sh` holds all three in place: `doctor` must still report hook registration,
both `/sync` surfaces must still read `hooks.armed`, and invariant 12 asserts the wizard
still copies the bundle and calls `installHooks()` on **both** Claude install paths — an
install surface that skips them ships the commands with the gates inert, which is exactly
the failure above.

## Install and off switch

Two surfaces arm the gates, and both do the same two things: put the scripts at
`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/my-command/hooks`, then run
`install-hooks.mjs` to merge the registration into `settings.json`. Shipping the scripts
alone would do nothing: the harness only runs what `settings.json` registers.

- **`scripts/install-personal.sh`** — the clone install. It **symlinks** `src/hooks` to
  that path, so `git pull` updates the gates like it updates the commands.
- **The npx wizard** (`installHooks()` in `src/my-command.ts`, on Claude choices 1 and 2)
  — it **copies** instead, deliberately: npx runs from an ephemeral cache directory that
  is cleaned up when the wizard exits, so the same symlink would dangle and every gate
  would silently disappear. It detects a symlink already at that path and leaves it alone
  rather than writing through it into someone's checkout, and it never removes the
  directory — see the clobbering rule below. A failure there reports itself and does not
  fail the command install, since the commands are useful without the gates.

The **Codex install registers nothing, on purpose.** Codex does have a hook engine, but it
is a different mechanism end to end: opt-in behind a `[features]` flag in
`~/.codex/config.toml`, configured as TOML or `hooks.json` rather than `settings.json`,
gated by a per-hook trust review, and firing `PreToolUse` for the shell tool only — never
for the Read/Edit/Write calls two of these gates judge. These scripts also speak Claude
Code's protocol (`stop_hook_active`, `{"decision":"block"}` on stdout) and parse a Claude
transcript. Installing them from a Codex install would either write Claude settings, or
leave a hooks directory under `~/.codex` that nothing would ever execute. A Codex-native
port is its own piece of work.

**The installer never clobbers that directory.** It used to `rm -rf` it before linking,
which is safe only for the stale-copy case it was written for. A real directory there can
also hold a hook the user installed independently and registered in `settings.json`
themselves — deleting it aims that registration at a path the new symlink does not provide,
breaking an unrelated guardrail to install ours. So: a symlink is repointed; a directory
holding only files this repo also ships is replaced; a directory holding anything else makes
the installer **refuse**, name every file that would be lost, and say that `--no-hooks` skips
the gates entirely. That destructiveness is itself a plausible reason arming was avoided,
which makes it part of the same failure rather than a separate tidy-up.

The merge is additive and identified. Entries are recognized by the hooks directory in
their command path, so a re-run replaces exactly this install's entries and leaves a
hook the user added alone; every unrelated setting survives. A `settings.json` that
cannot be parsed is refused rather than overwritten.

Three ways out, in increasing order of finality:

- `MY_COMMAND_HOOKS=0` in the environment Claude Code runs in — every hook exits
  immediately. Nothing is uninstalled.
- `install-personal.sh --no-hooks` — link the commands and toolkit, register nothing.
- `node ~/.claude/my-command/hooks/install-hooks.mjs --uninstall` — remove the
  registration.

The same fragment also installs a read-only Bash allowlist. That is the other half of
the guardrail work: the routine probes that stay in the shell should not stop to ask,
which is what pushes a run toward composing one big chained command instead.

## Toolkit recoveries

Two failures had exactly one right answer each and were nevertheless returned to the
agent to interpret. Both are now resolved by the verb that hit them:

- `commit` retries **once** on an unapproved signing prompt, after a short wait. The
  failed attempt wrote nothing, so re-issuing the same commit is the whole fix. It
  never rewrites the commit, never passes `--no-gpg-sign`, and never changes signing
  configuration. A second failure means the prompt was never approved, and says so.
- `pr` resolves a `must be a collaborator` rejection by retrying under a token
  belonging to the repository owner, then over REST — whose endpoints accept the
  credential GraphQL refused. The result reports which identity worked.

## Named probes

Rung 4 for the classifier refusals: a probe that has a name is never composed as the
chain that gets refused.

| Verb | Replaces |
|---|---|
| `scope` | `git branch --show-current` + `symbolic-ref` + `$(git merge-base …)` + `git diff --name-only` |
| `prs view\|list\|checks` | hand-written `gh pr view --json a,b,c` and `gh pr list … \| jq` |
| `doctor.checkout` | `$(cd "$(dirname "$(readlink -f …)")/../.." && pwd)` in `/sync` |

## Bash shapes, and why each one is unambiguous

`src/hooks/lib/bash-shapes.mjs` decides these from the command text plus the filesystem, so
each refusal is a statement about a command that was going to fail:

- **Unmatched glob.** An *unquoted* token containing `*`/`?` whose directory exists and whose
  pattern matches nothing there. zsh aborts the whole command with `no matches found`, so
  nothing in it runs. A quoted pattern, one containing a substitution or `**`, and one whose
  directory half is itself a glob are all skipped — the shell would expand them differently
  than this check can model.
- **Foreground `sleep`.** The harness blocks it, and blocks the *whole* call, so the probe
  chained after the wait never runs either. `run_in_background: true` is exempt.
- **Heredoc composing a file.** A heredoc *plus* a redirect or `tee`. Two recorded sessions
  demonstrated the alternative themselves — one wrote its scratch script with the `Write`
  tool, the other wrote `pr-body.md` with `Write` and passed it as a flag — so the denial
  names that form. A heredoc feeding a program's stdin with no redirect is untouched.
- **`$CLAUDE_JOB_DIR` from a worktree.** Eight recorded guard refusals, every one because the
  command targeted the job directory from inside an isolated worktree or wrapped itself in a
  heredoc, subshell, or `$(…)`. The guard reacts to the target and the shape, so knowing the
  path was never the gap; the cwd being under `.claude/worktrees/` is the evidence.
- **Dumped files.** `cat`/`head`/`tail`/`sed`/`nl` and friends naming a file that exists.
  `grep` and `rg` are deliberately **not** dumpers: locating a symbol in a file already in
  context is the faster form the re-read gate recommends, and gating it would contradict the
  advice. A segment containing a redirect is skipped, since that is a copy rather than a look.

## Invariants

- **A gate that ships must be wired.** Hook scripts present and executable, both
  events registered in the fragment against `{{HOOKS_DIR}}`, the fragment's matcher
  covering the editor tools as well as the read tools, the installer running the
  registration, and an off switch present. Enforced by `check-commands.sh`.
- **A gate that is wired must be provably armed.** `doctor.hooks.armed` is the check, and
  a negative is loud. A mechanism nobody can confirm is running is prose with extra steps.
- **A legitimate parallel batch is never refused.** Asserted by test, and binding on every
  future gate.
- **Fail open, always.** No gate does its own error handling; `guard()` is the entire
  error policy.
- **One denial per subject per session.** A gate cannot refuse the same thing twice.
- **Zero dependencies, Node 22+**, matching the toolkit — the hooks run from a bare
  clone with nothing installed.

## Acceptance criteria

- [x] Three read-only turns pass; the fourth is refused with the batching instruction.
- [x] A batch of parallel read-only calls is one turn and is never refused.
- [x] A non-read-only call, or a user prompt, breaks the run.
- [x] A whole-file re-read of an unchanged file is refused; a re-read after a change,
      a targeted slice, and a whole-file read following only a slice all pass.
- [x] A relative `cd` that does not resolve is refused; a resolving, absolute,
      home-relative, expanded, or `cd -` form passes.
- [x] A run ending on a tool call is blocked once; a text-only closing turn ends it.
- [x] No gate refuses the same subject twice, and a malformed event allows the call.
- [x] `MY_COMMAND_HOOKS=0` silences every gate.
- [x] The installer merge is idempotent and preserves foreign hooks and settings.
- [x] `commit` attempts a signing prompt exactly twice, then reports it.
- [x] `pr` reports `identity: "REST"` rather than a `must be a collaborator` error.
- [x] An `Edit` of a path this session never read is refused, asking for the whole edit
      pass's reads in one batch; a prior whole read or slice allows it, and creating a new
      file needs no read.
- [x] A re-read is still refused when the session edited a *different* file in between, and
      the file that did change stays re-readable.
- [x] An unquoted glob matching nothing, a foreground `sleep`, a heredoc composing a file,
      and `$CLAUDE_JOB_DIR` addressed from a worktree are each refused with the working
      form named; the quoted, backgrounded, stdin-heredoc, and in-worktree forms pass.
- [x] A shell dump of a file already read whole and unchanged is refused; `rg -n 'a|b'` on
      that same file is not.
- [x] An identical read-only command is refused only while nothing since could have changed
      its answer — an action or a new prompt in between allows it, and a duplicate inside one
      parallel batch is not a repeat.
- [x] A turn issuing seven parallel probes of distinct files is not refused.
- [x] Hand-polling a file a `Monitor` in this session is following is refused once; an
      unrelated probe during that watch passes.
- [x] `doctor.hooks.armed` is `false` with the missing entries named when the gates are not
      registered, `false` when `settings.json` cannot be parsed, and `true` with
      `link.pointsAtCheckout` after the installer runs.
- [x] The installer refuses rather than deletes a hooks directory holding a foreign hook,
      naming it, and arms the gates once it is gone.
- [x] The wizard's hooks step lands the scripts executable, omits the tests, registers both
      entries plus the read-only allowlist, and is idempotent across a second run.
- [x] A hooks directory that is a symlink into a checkout is registered, never copied over.
- [x] A hooks step that fails reports why and leaves `settings.json` unwritten, and the
      command install still succeeds.
- [x] The `armed: false` hint names a command that exists on *that* device: the installer
      script in a checkout, the shipped merge on a wizard install, the wizard itself when
      no bundle landed.
- [x] Gates copied in place read `armed: true` with no hint, rather than as a stale copy.

## What was rejected

- **A workflow step in the commands that start background work**, as the answer to
  hand-polling a watched condition. Rejected: that is rung 2, and the session that did it was
  running a command whose prose already said not to. The transcript records the `Monitor`
  call *and* the polling, so the evidence a gate needs is present — a `PreToolUse` hook
  cannot query live `Monitor` state, but it does not have to.
- **A gate for high tool churn as an aggregate.** Unchanged from the original decision: an
  aggregate of other gates' violations has no failure of its own.
- **Counting probes rather than turns**, anywhere. It would refuse the batched form these
  gates exist to produce.

## Known remainder

Subagent runs and ad-hoc non-command prompts cannot carry an outcome line the way a
command run does, so a share of the missing-outcome measurements are structural rather
than behavioural. `SubagentStop` is deliberately **not** registered for that reason.
Fixing the measurement is a change to claude-proxy's own rule, in another repository.

## Related

- Spec: [Command toolkit](command-toolkit.md) — the verbs the recoveries live in
- Spec: [Install wizard](install-wizard.md)
- Spec: [Adding a command](adding-a-command.md)
