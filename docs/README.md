---
type: readme
title: MyCommand specs
description: Queryable OKF bundle for the MyCommand workflow suite — process specs plus one feature doc per command.
timestamp: 2026-07-15
updated: 2026-07-29
---

# MyCommand specs

<!-- okq:begin -->
## MyCommand specs

The queryable spec bundle for the MyCommand workflow suite — an
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
(OKF) bundle explored with [okq](https://github.com/mikevalstar/okq):

    okq --bundle docs search "<topic>"     # ranked full-text
    okq --bundle docs find --type feature  # one spec per command
    okq --bundle docs stats                # overview

Folders:

- `specs/` — process specs: [adding a command](specs/adding-a-command.md), the
  [install wizard](specs/install-wizard.md), and the shared
  [command toolkit](specs/command-toolkit.md).
- `features/` — one feature doc per command (its flags, params, and behavior).
  Most commands act on the repository; [cp](features/cp.md) and
  [trim](features/trim.md) act only on the session, so they link to no sibling
  command.
- `adrs/` — decisions.
- `research/` — supporting investigations, including the
  [Claude/Codex adapter](research/2026-07-19-claude-codex-support-patterns.md).

Invariants (see [Adding a command](specs/adding-a-command.md)): a new workflow
needs a Claude command, generated plugin copy, Codex skill, feature doc, and
wizard inclusion; a flag/param change needs a feature-doc update.

Frontmatter keys beyond OKF's `type` / `title` / `description` / `tags`:

- `timestamp` — when the doc was written. `updated` — when its claims last
  changed.
- `status` — ADRs only (`accepted`, `superseded`).
- `dirty: true` — the doc's claims are correct but its prose has not been
  evaluated for density since it changed. Set by [docs](features/docs.md) on
  every doc it updates or adds, and by whoever hand-edits a doc. The final docs
  phase or standalone [truncate](features/truncate.md) consumes and clears it:

      okq --bundle docs find --where dirty=true

  A truncation never bumps `updated` — no claim changed. See
  [ADR 0004](adrs/0004-docs-completes-density-pass.md).
<!-- okq:end -->
