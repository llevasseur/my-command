---
type: adr
title: Record architecture decisions
description: Use ADRs to capture significant, hard-to-reverse decisions.
tags: [process]
timestamp: 2026-07-16
dirty: true
---

# Record architecture decisions

## Status

Accepted.

## Context

We need to record the architectural decisions made on this project — the
significant, hard-to-reverse ones — so the reasoning survives turnover and time.

## Decision

We will use Architecture Decision Records, as [described by Michael
Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
Each record is one Markdown file in `adrs/`, numbered, with Status / Context /
Decision / Consequences.

A decision an agent made in place of a human is still one of these records, and
carries frontmatter saying so — see
[ADR 0005](0005-agent-authored-decisions-are-marked-in-frontmatter.md).

## Consequences

The rationale behind decisions is preserved and queryable
(`okq find --type adr`). One lightweight step is added when making a
significant decision.
