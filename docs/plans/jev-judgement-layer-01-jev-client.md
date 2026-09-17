---
type: plan
title: jev-judgement-layer-01 — The zero-dependency Jev client
description: A raw fetch client for TypeSafe's System One endpoint with the wire types, the error taxonomy, exponential backoff on 429 and 529, and a per-run spend cap that fails open when reached.
tags: [plan, wayfinder, judge, toolkit]
timestamp: 2026-09-16
---

# jev-judgement-layer-01 — The zero-dependency Jev client

**Wayfinder:** `jev-judgement-layer`
**Branch:** `task/jev-judgement-layer-01-jev-client`
**Status:** active

## Why this is first

[ADR 0010](../adrs/0010-eval-harness-before-the-layer.md) inverted the ship order to
eval-first. The eval harness cannot run without a client, so the client is the shared
piece — and at this point it is wired into no command and reachable from nothing a user
runs.

## Criteria

Add `src/toolkit/lib/jev.mjs`, a client for `https://api.typesafe.ai/v1/systemone`.

**Request.** A POST carrying `Authorization: Bearer <key>` and
`Content-Type: application/json`, with a body of `state`, `model` (`"jev-latest"`), and
`questions`. `state` may be a string, an object, or an array. `questions` is a map whose
keys the caller chooses; those keys come back identical on `answers`, and the key itself
is never sent to the model.

**The three question types**, each with its own answer shape:

| Type | Request carries | Answer carries |
|---|---|---|
| `noul` | instructions, optional `criteria` with `true` and `false` descriptions | `type`, `noul` (0–1). **No `confidence` field at all.** |
| `choice` | `criteria` **required**, a map of option to rubric string or `null` | `type`, `choice`, `probabilities`, `confidence` |
| `score` | `criteria` **required**, an ordered array of at least two level labels | `type`, `score` (probability-weighted, may land between levels), `legend`, `probabilities`, `confidence` |

Response top level is `model`, `answers`, and `usage` with `input_tokens` and
`output_tokens`.

**Because a `noul` carries no confidence**, confidence logic for one is derived from the
value's own distance from 0.5. [ADR 0013](../adrs/0013-the-eval-bar-is-pre-registered.md)
fixes the high-confidence band at `|noul − 0.5| ≥ 0.4`. Export that derivation as a named
function so every caller uses one definition of the band.

**Error taxonomy.** 401 bad key, 422 validation naming the offending field, 429 rate
limit, 529 overloaded. **429 and 529 take exponential backoff**; 401 and 422 do not, as
retrying them cannot help.

**A per-run spend cap**, accumulated from the returned `usage` counts. **Reaching it
fails open** — the caller behaves exactly as it would with no answer — rather than
raising.

**Fail open at every failure mode, without exception**: missing key, 401, 422, exhausted
429/529 retries, timeout, malformed response, spend cap reached. Each returns "no
answer", never a throw that a caller must catch to stay correct. Model this on
`guard()` in `src/hooks/lib/io.mjs`, which the workflow-gates spec describes as
swallowing every exception into a silent allow.

**Honour Speculative Fan-Out**: several questions in one call cost less than several
calls, so the client takes a whole `questions` map per request and never loops.

## Constraints

- **Zero runtime dependencies.** A raw `fetch()` against Node 22's global fetch. Nothing
  added to `package.json` dependencies, no SDK, no Python. Per
  [ADR 0013](../adrs/0013-the-eval-bar-is-pre-registered.md), if this cannot be done the
  layer is abandoned rather than given a dependency.
- **The API key lives in the process environment only** (`TYPESAFE_API_KEY`). It is never
  written into any file in this repository — no config file, no committed `.env`, no
  fixture carrying a real key. MyCommand is a published npm package whose `files` list
  includes `src`.
- Raw `.mjs` under `src/toolkit/`, never build output — the toolkit's shipping
  constraint in [Command toolkit](../specs/command-toolkit.md).
- `pnpm run check:toolkit` typechecks the `.mjs` with `allowJs` + `checkJs`, so the file
  carries JSDoc types.

## Done when

- [ ] `src/toolkit/lib/jev.mjs` exists with the request builder, the three answer shapes,
      the error taxonomy, backoff, the spend cap, and the noul confidence-band derivation.
- [ ] Tests at `src/toolkit/lib/jev.test.mjs` under `node --test` cover every fail-open
      path with a stubbed `fetch` — no test makes a real network call.
- [ ] A test asserts that a 429 and a 529 back off and that a 401 and a 422 do not.
- [ ] A test asserts the spend cap fails open rather than throwing.
- [ ] `package.json` `dependencies` is unchanged.
- [ ] `pnpm test`, `pnpm run check:toolkit`, `pnpm run check` and
      `./scripts/check-commands.sh` pass.
