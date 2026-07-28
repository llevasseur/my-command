---
type: feature
title: pr
description: Create or update the PR for the current branch with a concise bulleted description, written straight to GitHub.
tags: [command, git, github]
timestamp: 2026-07-15
---

# pr

## Summary

Pushes the current branch and creates or updates its pull request with a concise,
bulleted description derived from the branch's commits and diff. Removes the local
worktree at the end only when this session is the one that created it.

## Flags / Parameters

- `--draft` / `-d` — mark the PR as a draft (converts an existing non-draft PR to
  draft too). Default is **not** draft.
- Everything after the flags is an optional **title / extra context** for the
  description.

## Behavior

Refuses to run on `main`. The push and the create-vs-update decision are one
`my-command-tools pr` call: it pushes, finds the branch's open PR if there is one, and
either edits it or opens a new one against the default branch. Only pushes existing
commits and writes PR metadata — never creates commits. An existing PR keeps its title
unless `--retitle` is passed, and `--draft` only ever moves a PR *toward* draft: an
existing draft stays a draft, flag or not, and nothing here runs `gh pr ready`. Only
`/god` promotes a draft, deliberately, right before merging.

### Worktree teardown is ownership-scoped

Teardown happens only when **this session created the worktree**. Then it force-removes
at the end (`ExitWorktree` with `discard_changes: true`), expecting the task's commits to
live on the worktree — they were pushed to origin, so only the redundant local copy is
discarded.

When `/pr` runs as someone else's subagent — `/task` Step 3 dispatches `/clean` + `/pr`
into a fresh one — it does not own the worktree, so it skips teardown entirely and the
dispatching command removes the workspace after it returns. Attempting removal there is
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
