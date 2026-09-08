---
type: feature
title: pr
description: Create or update the PR for the current branch with a concise bulleted description, written straight to GitHub.
tags: [command, git, github]
timestamp: 2026-07-15
updated: 2026-08-02
---

# pr

## Summary

Pushes the current branch and creates or updates its pull request with a concise,
bulleted description derived from the branch's commits and diff. Removes the local
worktree at the end only when this session created it **and** no command that invoked
`/pr` owns its teardown.

## Flags / Parameters

- `--draft` / `-d` — mark the PR as a draft (converts an existing non-draft PR to
  draft too). Default is **not** draft.
- Everything after the flags is an optional **title / extra context** for the
  description.

## Behavior

Refuses to run on the repo's default branch. The push and the create-vs-update decision are one
`my-command-tools pr` call: it pushes, finds the branch's open PR if there is one, and
either edits it or opens a new one against the default branch. Only pushes existing
commits and writes PR metadata — never creates commits. An existing PR keeps its title
unless `--retitle` is passed, and `--draft` only ever moves a PR *toward* draft: an
existing draft stays a draft, flag or not, and `/pr` never promotes one — the verb runs
`gh pr ready --undo` only to move a non-draft PR *into* draft. Only
`/god` promotes a draft, deliberately, right before merging.

### The description's shape is stated, checked, and measured

"Concise bullet-point form" was one sentence at the head of a step that then spent about
350 words on transport mechanics, plus one Notes bullet at the foot of the file that a run
only reached after the body was already written. It lost: a recorded run produced a
1244-word body with 9 headers and 10 standalone prose paragraphs with that rule in place.

The rule now owns its own step and states numbers instead of adjectives, in
`src/shared/pr-body-shape.md` so it travels with any command that reaches `/pr`. Bullets
only — a line that is neither a `-` bullet nor a `##` header does not belong; the first
line is a header, never prose; one idea per bullet at one to two sentences, and a bullet
past about 40 words is split or cut; headers only past about 6 bullets and 4 at most,
sentence case, 2 to 4 words; under 400 words, hard stop at 600. The named failure mode is
writing the body as a record of the author's work — compliance notes, gate output, docs
inventories, "what I checked" — each of which earns one terse bullet or none, and belongs
in the run's closing turn instead. The test for any line is whether a reviewer who never
saw the request would act differently for having read it.

Three things hold the rule up rather than one. The `unslop` skill runs over the body file
before publishing, conditional on it being installed device-locally at
`~/.claude/skills/unslop` — it is a skill, so its absence from `ls ~/.claude/commands/`
proves nothing, and a run that genuinely cannot find it says so in its report. A numeric
self-check runs immediately before the `my-command-tools pr` call — word count, em dashes,
bold runs, non-bullet lines — with the four numbers stated in the report, mirroring
`/task` Step 2.5's anti-slop lint. And the verb itself measures what it is handed:
`my-command-tools pr` computes the word count and bullet count from the `--body-file` and
returns `bodyWarnings` when the body is over budget or carries no bullets. That last one
warns and never blocks, and it is the only one a model cannot skim past.

### Assets in the description are never dropped

Updating a PR rewrites its body wholesale, and the replacement is authored from the
branch's commits and diff — which know nothing about a screenshot or screen recording
someone pasted into the PR by hand. Before editing, `my-command-tools pr` reads the
current body and carries its assets forward: markdown images, `<img>`/`<video>`/`<audio>`
/`<picture>` elements, and links to GitHub-hosted attachments (`user-attachments/assets/`,
a repo's own `/assets/` path, `(private-)user-images.githubusercontent.com`), including a
bare attachment URL, which GitHub embeds on its own.

Each is reinserted verbatim, so alt text and sizing attributes survive the round trip.
Assets are de-duplicated by URL, so the same image appearing twice is carried once.
Anything the rewritten body already references — matched by URL — is left where the new
body put it; the rest is appended under an `## Assets` heading, reusing that heading when
the body already has one so repeated updates collect into one section instead of stacking.
Where markup nests, the outermost match wins, so a `<picture>` is kept whole rather than
shredded into its `<img>`. Updates report the carry-over count as `assetsPreserved`.

### Worktree teardown is ownership-scoped

Teardown happens only when **this session created the worktree and no command that
invoked `/pr` owns its teardown**. Then it force-removes
at the end (`ExitWorktree` with `discard_changes: true`), expecting the task's commits to
live on the worktree — they were pushed to origin, so only the redundant local copy is
discarded.

When `/pr` runs as someone else's subagent — `/task --sub` Step 3 dispatches `/clean` +
`/pr` into a fresh one — it does not own the worktree, so it skips teardown entirely and
the dispatching command removes the workspace after it returns. It skips teardown in the
inline case too (`/task` without `--sub`, where `/pr` runs in the very session that created
the worktree): that command's own Step 3 removes it immediately afterwards, and has a push
check to run first. Attempting removal there is
what produced the recurring `not the owner of the worktree` refusal: `ExitWorktree`
refuses, and `git worktree remove` refuses too while the owning session's liveness lock is
held. If `ExitWorktree` refuses anyway, `/pr` steps out with `action: "keep"` and tries
`my-command-tools worktree end`, which re-checks the work is on origin; if git still
refuses because a live session holds the worktree, it leaves the path in place and says so
rather than forcing past the lock.

Commands that set a worktree up and then delegate — [fb](fb.md) `--target`,
[review](review.md), [task-bootstrap](task-bootstrap.md), [revive](revive.md) — tear their
own down with `ExitWorktree` (`action: "keep"`) followed by `worktree end`, since a
worktree entered via `EnterWorktree({path})` is one `ExitWorktree` will not remove.

## Related

- Command source: `src/commands/pr.md`
- Invoked by: [task](task.md) as the final step
- Spec: [Adding a command](../specs/adding-a-command.md)
