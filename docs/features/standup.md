---
type: feature
title: standup
description: Stand the developer up in a repo — what landed since their last commit or --since, sorted by what it asks of them, plus a What To Do Next list. Read-only.
tags: [command, orientation, git]
timestamp: 2026-10-02
updated: 2026-10-02
dirty: true
---

# standup

## Summary

Tells the developer what happened to the repo while they were away and what it
asks of them, then hands them a **What To Do Next** list. The window runs from
their last commit to now, or from `--since`. The run is read-only, writes no
file, and leaves the report in the session.

A plain log answers the wrong question. Twenty merged PRs read in order bury the
one that added an env var the developer's next run will fail without. `/standup`
sorts every change into **Set up**, **Read**, **Try** and **Watch out** first, and
lists everything else collapsed.

## Flags / Parameters

- `--since <when>` — open the window here instead of at the developer's last
  commit. Takes git's date forms: `2026-09-01`, `"2026-09-01 14:30"`,
  `"3 days ago"`, `yesterday`. A date with no time means local midnight. The
  window always ends now.
- **Focus terms** (the rest of the `<command-args>` block) — areas to expand and
  put first in What To Do Next. Focus never hides a Set up or Watch out item.

## Behavior

Five steps: resolve the window, gather, sort, report, close.

**Resolving the window** fetches origin first, so the report describes origin
rather than the clone's last view of it. The anchor is the committer date of the
developer's newest commit across every ref. Their identity is an **author set**,
not `user.email` alone: a squash-merged PR is authored under the GitHub noreply
address (`<id>+<login>@users.noreply.github.com`), and in this repo matching on
`user.email` alone anchored the window on 2026-08-03 instead of 2026-09-28. The
set adds both noreply forms from `gh api user`.

`--since` is resolved with `git rev-parse --since`, and a value that resolves
within 60 seconds of now is rejected. Git parses junk silently as the current
time, so without that check a typo reports an empty window instead of an error.
A developer with no commit anywhere gets a 14-day window and a Read section
weighted toward orientation docs.

**Gathering** is one batched pass over a fixed enumeration: the first-parent log
of the default branch, the name-status and stat diff from the window's base
commit, the changelog diff, the developer's own commits, how far behind the
checkout is, local and remote branches, and merged and open PRs through `gh`
when it is available.

**Sorting** classifies each change by path, then by subject:

- **Set up** — manifests, lockfiles, runtime pins, env templates, bootstrap
  scripts, containers, migrations, codegen schemas, hook settings.
- **Read** — agent-instruction files, contributing guides, READMEs, ADRs, specs,
  new docs. An `AGENTS.md` or `CLAUDE.md` edit ranks first, because the next agent
  run already follows it.
- **Try** — changelog `Added` entries, `feat:` subjects, new commands, routes,
  verbs, scripts.
- **Watch out** — renames, deletions, breaking changes, reverts, gate changes,
  and a **conflict check**: each local branch's changed files intersected with
  the window's, so a rebase risk is named with its branch and files.

Set up and Watch out paths get their diffs read, because an entry has to name
the concrete action, such as the variable added or the version moved. Env
templates are reported by variable name only, and no real `.env` file is opened.

**The report** leads with a header line (window, what set it, counts, how far
behind, clean or dirty), then Key updates (three to seven, ranked), the four
impact buckets, Everything else, and What To Do Next in working order: sync
commands in one runnable block, docs to open, features to try, things to
investigate, and candidate work grounded in the repo's own evidence. The command
never runs the sync commands itself. `git fetch` is the only ref it moves.

## Related

- [health](health.md) — the other read-only report; both rank before they list.
- [trim](trim.md) — also ends in a verdict rather than an edit.
- [ideate](ideate.md) — proposes work from written evidence; `/standup`'s Work on
  items use the same rule against inventing a task.
