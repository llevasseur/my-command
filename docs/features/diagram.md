---
type: feature
title: diagram
description: Draw the architecture a change produces as one Mermaid diagram and attach it to that change's PR.
tags: [command, docs, review, mermaid]
timestamp: 2026-08-08
dirty: true
---

# diagram

## Summary

Renders one Mermaid diagram of the architecture a change **produces** — the system after the
change, with the added or moved parts marked — and puts it where the change is reviewed. The
subject is a change, not a repository: an open PR, or a branch that is about to become one. It
opens no PR, commits nothing, and touches no code.

## Flags / Parameters

- `--target` / `-t <PR-number-or-branch>` — diagram that PR, or that branch's PR, instead of the
  current branch's. A bare number is read as a PR number; anything else as a branch name.
- `--kind` / `-k <flowchart|sequence|class|er|state>` — force the diagram type. Default is chosen
  from the change: `flowchart` for a module or data-flow change, `sequence` when order is the
  point, `er` for a schema change, `class` for a type hierarchy, `state` for a lifecycle.
- `--comment` / `-c` — post a new PR comment instead of updating the block in the PR body, for a
  body owned by a template.
- `--out` / `-o <path>` — write the diagram into that Markdown file instead of posting to GitHub.
- `--dry-run` / `-n` — render it in the reply and change nothing.
- Trailing free text — a focus hint naming the layer, boundary, or flow to diagram.

## Behavior

Before resolving anything, a Step 0 precursor looks for an installed skill that covers Mermaid or
software diagramming — `mermaid-diagrams` is the usual match — and loads it with the `Skill` tool.
The command's own syntax and diagram-type lists are a fallback, not the authority: a skill is
maintained against Mermaid's grammar, so where the two disagree about syntax or type choice the
skill wins, and where they disagree about what the diagram is *for* the command wins. Finding no
such skill is an expected answer that is reported once, and no skill is ever installed to satisfy
the step. The skill that was loaded, or the absence of one, is named in the closing report.

Resolves the subject from `my-command-tools state` plus `gh pr view` in one batch, treating a
missing PR as an expected answer rather than a failure. Reads the changed files as one batched
pass, following an import or route registration at most one hop past the diff, then commits to a
single claim: what changed shape, in 5–20 nodes that all name something real. Nodes the change
touched are marked with a `classDef`; untouched context stays plain.

The output is always the same block — a fenced `mermaid` diagram between `<!-- diagram:start -->`
and `<!-- diagram:end -->` under an `## Architecture` heading — so a re-run **replaces** the last
one instead of appending a second. Destinations resolve in order: the `--out` file, the reply
alone under `--dry-run`, the open PR's body (or a comment under `--comment`), and otherwise the
block is handed back unattached. Only the marker block is rewritten; the rest of a PR body is
preserved byte for byte, and a body with no markers gets the block appended.

Mermaid validity is enforced because GitHub renders an invalid diagram as a red error block:
labels holding brackets, parentheses, colons, or commas are quoted, `end` is never a node id,
node ids stay bare identifiers with paths in the label, and no HTML beyond `<br/>` is used. The
diagram is validated with `mmdc` when it is already on PATH; when it is not, the command does
**not** install it — it checks by inspection and says so in the reply.

## Composing into a task run

`/task -a diagram <prompt>` weaves it into a task. After `/pr` is the normal position: the PR
exists, so the diagram lands in its body in one pass. Before `/pr`, there is nothing to attach
to, so the run produces the block and hands it to `/pr` for the description, saying plainly that
it is unattached; running `/diagram` again afterwards attaches it to the now-existing PR. Either
way it never blocks the task — an unresolvable subject or a failed attachment is reported and the
run continues.

## Related

- Command source: `src/commands/diagram.md`
- Codex skill: `skills/diagram/SKILL.md`
- Feature: [task](task.md) — the `--add` composition point
- Feature: [pr](pr.md) — writes the PR body the diagram lands in
- Spec: [Adding a command](../specs/adding-a-command.md)
