---
type: feature
title: ticket
description: Create and move Jira work items from the repo's own Jira contract — create, move, link, show, and a thin default that infers the move from branch and PR state.
tags: [command, workflow, jira, tracker]
timestamp: 2026-09-11
dirty: true
---

# ticket

## Summary

Creates and moves Jira work items for the repo you are standing in. Every Jira fact it uses —
site, project key, board, sprint, issue types, the two transitions it may fire, the transitions it
must refuse, and the link type — comes from **that repo's own Jira contract**, read at run time.
The command hardcodes no site, no project key, no issue type id, and no transition id, so one
installed copy serves every repo on the device.

[task-bootstrap](task-bootstrap.md) writes the contract. This command only reads it.

## Flags / Parameters

- `--yes` / `-y` — skip the creation approval **and** the template question together; the template
  is inferred from the diff instead of asked for. [god](god.md) passes it, so an unattended run
  never blocks on a prompt.
- `--template <story|bug|chore|spike|technical>` — force the description template, overriding both
  the diff-based guess and the contract's per-type default.
- Everything after the flags is the verb and its arguments.

## Verbs

| Form | What it does |
| :--- | :----------- |
| `create [story\|bug\|task\|chore\|spike] <summary>` | Create a work item. The optional word is the Jira **issue type**; omitted, the contract's `defaultIssueType` is used. Waits for an explicit go unless `--yes`. |
| `move <KEY> start\|review` | Fire the contract's `start` or `review` transition. Fires without asking. |
| `link <KEY> blocks\|blocked-by\|relates <KEY>` | Link two existing items. Always explicit. |
| `show <KEY>` | Read one item and report it. Reads only. |
| `<KEY>` (bare) | Infer which move is due from the branch and the PR state, then fire it. |

## The contract

Discovery mirrors [task](task.md) Step 1.5, in three steps: run `bash
scripts/bootstrap-worktree.sh --print-jira-contract` and parse its JSON; failing that, read a
`## Jira` section from `AGENTS.md` or `CLAUDE.md`; failing that, **the repo has no Jira**. That
last case warns once, skips all ticket work, records the skip in the run's report and in the PR
description, and says to run `/task-bootstrap` — **without invoking it**, because adding a tracker
to a repo is its own decision rather than a side effect of a ticket run.

The contract holds `site`, `projectKey`, `board`, `sprint` (`null`, a sprint id, or `"active"`),
`defaultIssueType`, an `issueTypes` map of name to `{id, template}`, a `lifecycle` map whose
`start` and `review` entries each carry a transition id, a transition name, and the target
status's id and name, a `never` list of forbidden transitions each with a reason, and `linkType`.

**`cloudId` is deliberately absent.** It is resolved at run time from `site`, because a pinned
cloud id rots silently when a site is migrated and the failure surfaces as a permission error
against the wrong tenant.

## Transition safety

Two rules, both unconditional.

**The live workflow is checked before every transition fires** — including one fired by the
bare-key default and one fired in adopt mode. The command fetches the item's live transitions and
confirms the contract's declared transition **id and name both still match**. Any mismatch stops
the run and reports a workflow change, naming what the contract declared against what Jira now
offers. The closest match is never fired: a workflow that was edited is one whose *meaning* may
have been edited, so firing an id-matched transition under a new name is how a ticket lands in a
status nobody chose.

**Every transition in the `never` list is refused, even when asked for directly**, with the reason
the contract records. No flag overrides it. `--yes` does not reach it, because `--yes` skips a
confirmation and a refusal is not a confirmation.

## What waits, and what does not

**Creation is the only irreversible action, so it is the only one that waits.** The full ticket is
rendered as text — summary, type, project, sprint, description — and nothing reaches Jira before
an explicit go. Edits and transitions fire on their own: they are reversible, the contract already
named them, and an approval prompt on every status change is what makes people stop using the
tool.

`--yes` skips that approval and the template question together. `/god` passes it so unattended
runs never block.

## The five templates

Baked into the command rather than into the contract, because they are about **how a ticket is
written** rather than how one repo's Jira is configured. A house style that differs changes the
command once, not every repo's contract.

The template is chosen by **whether the change is user-visible, not by the Jira issue type**. The
two are different questions, and conflating them is how a backend `Story` acquires Given/When/Then
about a screen nobody built. The guess is pre-filled from the diff.

| Template | For |
| :------- | :-- |
| `story` | User-visible behaviour someone asked for |
| `bug` | User-visible behaviour that is wrong — observed, expected, numbered repro steps |
| `chore` | Maintenance with no behaviour change |
| `spike` | A question with a timebox and an ending artifact |
| `technical` | An internal change a user cannot see |

**Every template carries Acceptance Criteria, How to Test, and Out of Scope.** How to Test is the
navigation needed to *reach* the criteria — where to go, what to be logged in as, what state to
start from.

**Testing Done is added only when the run actually exercised something**, and it records what was
**not** tested as well as what was. A section listing only successes reads as full coverage.
Nothing speculative goes in it, and "N/A" never does — an absent section says the same with less
noise.

**Given/When/Then is used only for user-facing behaviour that branches on state.** Never for bug
repro steps, which numbered steps state better and which a person actually follows; never for
backend cases, chores, or spikes, where it reads as ceremony and buries the one interface fact a
reader needed.

**A ticket carries acceptance criteria and the navigation needed to reach them, never full test
cases.** Test cases belong to whoever owns testing; a ticket that inlines them goes stale the
first time the suite changes and then contradicts it. A **QA exemption is one line in the
description**, saying it is exempt and why.

## Screenshots

Where a [verify](verify.md) loop recorded a **browser** tier, its screenshots are uploaded to the
item through `POST /rest/api/3/issue/{key}/attachments`, with the `X-Atlassian-Token: no-check`
header Jira requires on every attachment upload and a multipart field named `file` — any other
field name uploads nothing and still returns a response.

The API token is read from the **macOS Keychain** and piped into the HTTP client's stdin config
rather than passed on the command line, where every process on the machine could read it. **When
the token is absent, the screenshots' location is attached as a remote link instead**, and the
report says they were linked rather than uploaded and why. The command never prompts for the token
and never writes it anywhere.

## As a `--add` entry on `/task`

`/task -a ticket <prompt>` weaves it into a task run, where it is deliberately narrower:

- It **only ever adopts an existing key**, read from the branch or the prompt. It **never creates**.
- It fires the **start** transition when work begins.
- It attaches the PR to the item as a **remote link** once the PR is open.
- It **never fires the review transition**.

Those last two are one decision. **Several `/task` runs can feed one ticket** — a fix, a follow-up,
a review round — so no single run is in a position to say the work is done. **Calling development
complete is the user's judgement**, so adopt mode stops at `start` and leaves `review` to an
explicit `/ticket move <KEY> review`.

It never blocks the task: a missing contract, unavailable tooling, an unresolvable key, or a
refused transition is reported, recorded, and the run continues.

## When the Atlassian MCP server is not connected

The run **states that ticket work is unavailable and continues.** It does not fail, does not
retry, and never infers an item's state from the branch or the PR in place of reading it — an
inferred status written back to Jira is worse than no status at all.

## Dependency links from `/manage`

[manage](manage.md) already builds a dependency graph to order its waves. That graph is the one
place a dependency is **stated** rather than guessed at, so it is passed here and a stacked unit
becomes a `Blocks` link — one `link` call per edge, and no edge this command invented.

## Related

- Command source: `src/commands/ticket.md`
- Codex skill: `skills/ticket/SKILL.md`
- Feature: [task-bootstrap](task-bootstrap.md) — writes the Jira contract this reads
- Feature: [task](task.md) — the `--add` composition point
- Feature: [manage](manage.md) — hands over the dependency graph
- Feature: [verify](verify.md) — records the browser tier that gates screenshot upload
- Feature: [wayfinder](wayfinder.md) — the opposite choice: a campaign tracked as markdown plans
  in the repo, with no issue tracker at all
- Spec: [Adding a command](../specs/adding-a-command.md)
