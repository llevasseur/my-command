---
type: feature
title: health
description: Report what is actually consuming this machine's CPU, memory, and energy as a ranked table with concrete fixes, and act on the safe tier only under --fix.
tags: [command, diagnostics, machine]
timestamp: 2026-08-20
updated: 2026-08-20
dirty: true
---

# health

## Summary

Reports what is consuming this machine's CPU, memory, and energy, ranked **by
owner rather than by process**, and hands back fixes that name the mechanism. The
default run is read-only. `--fix` adds an acting phase that re-measures before
every signal.

The command exists because the obvious reading of a process list is the wrong
one. A per-process table ranks system noise at the top and buries the finding: a
recorded session found 393 operating-system processes summing to 187% CPU sitting
above 15 endpoint-security processes summing to 141%, and only the per-owner
rollup showed the security suite was the machine's largest consumer by a factor
of eight.

## Flags / Parameters

- `--fix` — run the acting phase (Step 6). Without it the run stops after the
  report and never signals a process, stops a service, or edits a config.
- `-y`, `--yes` — with `--fix`, act on the `SAFE` tier without a prompt per item.
  Never promotes a lower tier; ignored without `--fix`.
- `--top <n>` — rows per table. Default 10.
- **Focus terms** (the remainder of the `<command-args>` block) — free text
  naming owners to expand. Focus never hides a heavier owner.

## Behavior

Seven steps: snapshot, roll up, rank, classify, report, act, close.

**Snapshot** takes every reading in as few parallel calls as possible, because a
snapshot assembled over a dozen serial turns describes a dozen different moments
and the whole output compares owners measured at one instant. macOS reads `ps`
twice (CPU and memory order), `vm_stat`, `memory_pressure`, `sysctl`, `uptime`,
`pmset -g ps`, and `lsof` for port owners. Linux reads `/proc/meminfo`, `free`,
`ss -ltnp`, and `systemctl`, and says which sections it cannot fill rather than
printing a macOS-shaped number.

**Rollup** groups processes under something a person could act on: the
application, the vendor, the session manager, the repository. An interpreter is
never an owner — the command line is walked to the repository it runs and the
parent chain up to the session that started it.

**Ranking** runs on four axes, since the worst owner is rarely the same one
twice. CPU now is a spot reading and is labelled as one. Memory is read against
pressure, where the honest headline on a machine under pressure is the compressor
rather than free pages: one run showed 58 MB free against 7.4 GB compressed.
Energy is summed cumulative CPU time, **declared in the report as a proxy** —
Activity Monitor's Energy Impact is not available to an ordinary process and
`powermetrics` needs root, which this command never takes. Churn counts file
watchers before blaming the indexer they feed.

**Classification** gives each owner one verdict: `yours`, `managed`, `expected`,
`orphaned`, or `supervised`. The verdict rather than the number is what makes a
row actionable, and `managed` owners are named and sized but explicitly left
alone.

**The report** is two tables. The first is where the machine is going, one row
per owner. The second is what to do, one row per finding, each carrying a tier
that claims safety rather than value: `SAFE` (the consumer is provably gone),
`CONFIRM` (needs a human to agree), `MANUAL` (a GUI setting, or wants a privilege
the command refuses), `LEAVE` (measured and deliberately not actioned). Every
`SAFE` and `CONFIRM` row gets a runnable command with the PIDs written in. The
report is the deliverable, so a healthy machine gets the same two tables and a
line saying nothing is actionable.

**Acting** happens only under `--fix`, and re-measures immediately before every
signal because the first snapshot is already stale. In the session this command
was drawn from, the live backend changed PID three times inside twenty minutes as
its watcher respawned and port ownership flipped between two duplicate stacks, so
a kill list written from the first reading would have killed the working server
and spared the dead one. Kills are guarded by command-line match rather than PID
(ids get recycled), written as a script file run by path rather than inline shell
control flow, `SIGTERM` before `SIGKILL`, with the keeper set built and protected
before any sibling tree is reaped and every previously-serving port re-checked
afterwards.

Four things never happen unprompted, `-y` included: stopping a `supervised`
service (a persistent change to login state, so the command quotes the disable
line and leaves the decision), closing anything holding unsaved state (asked of
the application, not the filesystem — one run cleared an editor as clean from an
empty backup directory and found an unsaved-changes marker in the editor's own
window listing a step later), killing a process bound to a listening port unless
the user named it, and escalating to root.

The aftermath is reported truthfully including a number that got worse: load
average routinely climbs straight after a cleanup as the indexer and the endpoint
scanner react to the teardown, and the run names them rather than presenting the
spike as damage the fix caused.

## Known patterns

A named-pattern section carries what the generic engine would otherwise miss, and
grows without rewriting the command. Each entry is a tell, the check that
confirms it, and the trap:

- **Duplicate dev stack across session managers** — ownership flips as watchers
  respawn, so the live tree is whichever owns the port right now.
- **Supervised service mistaken for a stray** — parent PID 1 and it returns after
  a kill; uptime is not staleness.
- **Editor served over local HTTP into a shell window** — roughly twice the
  processes and memory, and the per-window language-server trees survive their
  window.
- **Managed security software dominating the machine** — frequently the single
  largest consumer; size it and move on.
- **Decorative work with no viewer** — a manual settings fix, and killing the
  helper only makes the system restart it.
- **Idle pre-warmed slots** — the finding is the total and the idle age, not their
  existence.

## Related

- [trim](trim.md) — the other read-only assessment command; both end in a verdict
  rather than an edit.
- [clean](clean.md) — acts on a branch's comments the way `--fix` acts on
  processes, and both re-read before they touch anything.
