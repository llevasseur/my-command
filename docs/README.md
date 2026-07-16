---
type: readme
title: MyCommand specs
description: Queryable OKF bundle for the MyCommand command suite — process specs plus one feature doc per command.
timestamp: 2026-07-15
---

# MyCommand specs

<!-- okq:begin -->
## MyCommand specs

The queryable spec bundle for the MyCommand command suite — an
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
(OKF) bundle explored with [okq](https://github.com/mikevalstar/okq):

    okq --bundle docs search "<topic>"     # ranked full-text
    okq --bundle docs find --type feature  # one spec per command
    okq --bundle docs stats                # overview

Folders:

- `specs/` — process specs: how to add a command, how the install wizard works.
- `features/` — one feature doc per command (its flags, params, and behavior).
- `adrs/` — decisions.

Invariants (see [Adding a command](specs/adding-a-command.md)): a new command
needs a feature doc and wizard inclusion; a flag/param change needs a feature-doc
update.
<!-- okq:end -->
