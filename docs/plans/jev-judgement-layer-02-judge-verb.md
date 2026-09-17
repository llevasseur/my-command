---
type: plan
title: jev-judgement-layer-02 — The my-command-tools judge verb
description: A toolkit verb that loads a versioned question set, composes the request, and prints JSON on stdout like every other verb, with a --dry-run that prints the exact request and makes no network call.
tags: [plan, wayfinder, judge, toolkit]
timestamp: 2026-09-16
---

# jev-judgement-layer-02 — The my-command-tools judge verb

**Wayfinder:** `jev-judgement-layer`
**Branch:** `task/jev-judgement-layer-02-judge-verb`
**Status:** done · 2026-09-17

**Depends on** ticket 01 (the client) and ticket 03 (a question set to load).

## Criteria

Add `src/toolkit/verbs/judge.mjs` and register it in `src/toolkit/cli.mjs`'s `VERBS`
map — [Command toolkit](../specs/command-toolkit.md) makes "new verb ⇒ registered" an
invariant that `check-commands.sh` enforces, because an unregistered verb can never be
invoked.

**Invocation:** `my-command-tools judge --set <name> --state-file <path>`.

- `--set <name>` names a versioned question set at `src/toolkit/judge/<name>.json`.
- `--state-file <path>` is the state to judge. **A file path, not stdin** — for the same
  reason `commit --message-file` and `pr --body-file` take paths: the multi-line
  alternative is a heredoc, and the gate refuses a heredoc composing a file wholesale
  inside a worktree.
- `--dry-run` / `-n` prints the exact request body that would be sent and **makes no
  network call**. The `--dry-run` / `-n` precedent already exists on `/judge`.

**Output is JSON on stdout and nothing else**, on both the success and the failure path,
as every verb does. Exit codes follow the toolkit's convention: 0 success, 1 a failed
gate or refused guard, 2 a usage error via the `UsageError` class.

**`--dry-run` is load-bearing beyond convenience.**
[ADR 0009](../adrs/0009-conversation-derived-state-leaves-the-device.md) makes it the
mechanism by which a human can read what leaves the device before it leaves. It is also
how the eval harness assembles requests without sending them. Treat it as a first-class
path, not a debugging aid.

**Fail open.** A missing `TYPESAFE_API_KEY`, any client error, or a malformed response
prints a result saying no answer was obtained and **exits 0**. A judge error must never
change a run's outcome and must never fail a gate. With no key the verb says so plainly
when called directly — it is the caller's job, not the verb's, to stay silent in a
command that was not opted in.

## Constraints

- **Nothing in this ticket wires the verb into any command.** Per
  [ADR 0010](../adrs/0010-eval-harness-before-the-layer.md) the runtime surface is
  ticket 07, last. This ticket delivers a verb a person can run and nothing that runs it.
- **The name is not a collision.** `judge` the verb and `/judge` the command occupy
  separate namespaces, exactly as `pr` and `/pr`, and `verify` and `/verify`, already do.
- Zero dependencies, raw `.mjs`, JSDoc-typed for `check:toolkit`.

## Done when

- [ ] `src/toolkit/verbs/judge.mjs` exists and appears in `cli.mjs`'s `VERBS`.
- [ ] `--dry-run` prints the exact request body and provably makes no network call.
- [ ] Every path prints parseable JSON on stdout and nothing else.
- [ ] A missing key exits 0 with a no-answer result rather than erroring.
- [ ] `--help` is prose, by the toolkit's documented exception.
- [ ] Tests under `node --test`; `pnpm test`, `pnpm run check:toolkit` and
      `./scripts/check-commands.sh` pass.
