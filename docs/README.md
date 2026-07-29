---
type: readme
title: MyCommand specs
description: Queryable OKF bundle for the MyCommand workflow suite — process specs plus one feature doc per command.
timestamp: 2026-07-15
updated: 2026-07-28
dirty: true
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
  every doc it updates or adds, and by whoever hand-edits a doc. Consumed and
  cleared only by [truncate](features/truncate.md):

      okq --bundle docs find --where dirty=true

  A truncation never bumps `updated` — no claim changed. See
  [ADR 0003](adrs/0003-dirty-flag-for-doc-density.md).
<!-- okq:end -->
