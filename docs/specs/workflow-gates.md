---
type: spec
title: Workflow gates
description: The PreToolUse and Stop hooks, and the toolkit recoveries, that enforce the workflow rules mechanically instead of relying on an agent recalling them.
tags: [process, hooks, toolkit, install, guardrails]
timestamp: 2026-08-04
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
| Relative `cd` that cannot resolve | 3 | `PreToolUse` refuses it, naming the absolute form |
| Unapproved signing prompt | 3 | `commit` retries once, itself |
| `must be a collaborator` | 3 | `pr` resolves the identity, itself |
| Hand-composed probes the classifier refuses | 4 | named read-only verbs, plus an installed allowlist |
| A run ending with no outcome | 3 | `Stop` refuses the stop |

High tool churn is deliberately absent. It is an aggregate of the first three plus the
refusal retries, with no failure of its own, so it has no gate of its own either.

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

## Install and off switch

`scripts/install-personal.sh` symlinks `src/hooks` to
`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/my-command/hooks` — so `git pull` updates the
gates like it updates the commands — then runs `src/hooks/install-hooks.mjs` to merge
the registration into `settings.json`. Shipping the scripts alone would do nothing: the
harness only runs what `settings.json` registers.

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

## Invariants

- **A gate that ships must be wired.** Hook scripts present and executable, both
  events registered in the fragment against `{{HOOKS_DIR}}`, the installer running the
  registration, and an off switch present. Enforced by `check-commands.sh`.
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

## Known remainder

Subagent runs and ad-hoc non-command prompts cannot carry an outcome line the way a
command run does, so a share of the missing-outcome measurements are structural rather
than behavioural. `SubagentStop` is deliberately **not** registered for that reason.
Fixing the measurement is a change to claude-proxy's own rule, in another repository.

## Related

- Spec: [Command toolkit](command-toolkit.md) — the verbs the recoveries live in
- Spec: [Install wizard](install-wizard.md)
- Spec: [Adding a command](adding-a-command.md)
