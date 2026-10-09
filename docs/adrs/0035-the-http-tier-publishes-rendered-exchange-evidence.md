---
type: adr
title: The http tier publishes screenshots of its recorded exchanges, under its own label
description: An API-only change gets inspected screenshot evidence on its PR by rendering the HTTP exchanges the verifier ran to a page and photographing it, and the tier keeps the name http rather than gaining an api tier.
tags: [process, commands, verify, pr, decisions]
timestamp: 2026-10-09
decided-by: /task
ratified: false
needs-human: false
---

# The http tier publishes screenshots of its recorded exchanges, under its own label

## Status

Accepted. **Written by `/task`, not ratified by a human**, under
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md).

## Context

`/verify` and `/task` Step 2.6 give a UI change published, inspected screenshots: the
`playwright` tier saves them, reads each one back as a `saw:` line, and `/pr` publishes them
because `verdict.json` names a browser tier. An API-only change drops to the `http` tier, which
probed with `curl` and photographed nothing, so its PR carried no evidence at all. The verifier
may not install a browser or a package to close that gap.

## Decision

1. **The `http` tier renders what it ran.** Every exchange (method, URL, status, key headers,
   body, and each assertion with pass or fail) goes into an evidence HTML page in the
   `shotsDir`. The device's `playwright-cli` screenshots that page, and the verifier reads each
   image back as `saw:` and `gap:` lines, the same contract the `playwright` tier keeps. With
   no `playwright-cli` it records a `gap:` and saves no image.
2. **A repo can name its own suite.** The run contract takes an optional `api` object:
   `{"suite": "<shell command run from repo root>", "report": "<repo-relative dir holding the
   suite's HTML report index.html>", "journal": ["<URL returning the outbound-call journal as
   JSON>", ...]}`. Only `suite` is required. When it is present the verifier runs the suite
   instead of ad hoc `curl`, and screenshots the report and each journal URL.
3. **`/pr`'s gate widens by one case.** A browser tier publishes as before. An `http` run
   publishes when its record carries at least one `saw:` note, since the read-back is what
   vouches for an image of rendered text. An `http` run with none, and every `static` run,
   publish nothing.
4. **The tier stays `http`.** Its caption says the images were rendered from recorded HTTP
   exchanges and were not loaded in a browser, so the label `/pr` consumes stays honest.

## Why not an `api` tier

A separate tier would split one driver, HTTP against the booted app, by whether a suite or
`curl` sent the requests. Nothing downstream needs that split: the publish gate turns on the
read-back, not on who sent the request, and the caption already says no browser loaded
anything. A fourth tier name would also widen the vocabulary every `shots record` caller and
every stored `verdict.json` has to agree on, for no difference a reviewer can see.

## Consequences

- A backend PR shows what was sent, what came back, and which assertions passed, inspected by
  the same read-back rule as a UI PR.
- An `http` image proves the exchange happened as recorded, not that a person can use a page.
  The caption says so, and `gap:` lines carry anything the suite did not reach.
- A device without `playwright-cli` still verifies over HTTP and still records a verdict; it
  publishes no image.
