---
type: feature
title: pr
description: Create or update the PR for the current branch with a concise bulleted description, written straight to GitHub.
tags: [command, git, github]
timestamp: 2026-07-15
updated: 2026-09-09
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

### A frontend change carries its screenshots

`/verify` and `/task` Step 2.6 capture screenshots of the running app into
`.my-command/shots/` inside the worktree, and `worktree end` preserves them to
`~/.my-command/shots/<repo>/<branch>/`. Until now nothing put them in front of a reviewer:
the person who most needed to see what the change looked like had to be told a path on the
author's machine.

`my-command-tools pr` now embeds them, gated on the diff. A changed path is frontend when
its extension is markup or a stylesheet — `.tsx`, `.jsx`, `.vue`, `.svelte`, `.astro`,
`.css`, `.scss`, `.sass`, `.less`, `.styl`, `.html`, `.htm` — or when it is a script file
under a directory that serves a UI (`components/`, `pages/`, `views/`, `screens/`,
`routes/`, `layouts/`, `styles/`, `ui/`, `frontend/`, `client/`, `webapp/`). The
directory qualifier is what keeps a repository of CLI verbs and markdown — which most of
them are, this one included — from tripping the check on a `.ts` file. Two paths attach
nothing and say nothing: a diff with no frontend change, and a frontend change with no
screenshots. A `shotsWarning` appears only when there was something to attach and the run
could not.

Screenshots are read from both places they can be: the live `.my-command/shots/` in the
workspace, which is where they still are when `/task` runs `/pr` before its teardown, and
the device-wide keep, which is where a `--here` run or a second `/pr` after teardown finds
them. The workspace wins a name collision, being the newer of the two.

Filenames decide the layout. A stem carrying a `before` or `after` marker at either end —
`home-before.png`, `after_home.png`, `settings.after.png` — pairs into a **before/after
table**, one row per view, before column then after; a view with only one side still gets
its row, with the missing cell saying so, because that is more use to a reviewer than
losing the pairing. Everything with no marker renders as a **grid**, two columns wide.
Images are `<img>` elements rather than markdown so a table cell can carry a width, which
also means the existing asset preservation recognises them and carries them forward by
`src` on the next update. `worktree end`'s collision suffix is accounted for:
`home-before-2.png` is the same view as `home-before.png`, not a view called `home-2`.
`--no-shots` switches the whole thing off.

### Why the bytes live on a side branch

GitHub mints the `user-attachments` URLs behind its own web editor through no public API,
so a PR body written by a tool cannot use them. That leaves three routes, and this is the
one the verb takes: **commit the images to a `my-command-shots` branch of the same
repository and link `raw.githubusercontent.com`.**

It needs no credential beyond the push that has just happened, creates no release and no
gist, and keeps the images in the one place whose access already matches the PR's. A
release asset would put screenshots in the repository's release list, which is a
user-facing surface with a different meaning; a gist would put them under an account
rather than the repository, outliving any access change to the repo itself.

The publish is git plumbing and never touches the working tree: `hash-object` writes the
blobs, a throwaway index builds a tree on top of whatever the branch already carries, and
`commit-tree` makes the commit, which is pushed straight to `refs/heads/my-command-shots`.
Nothing is checked out and the branch under review is never left dirty. **Every path is
content-addressed** — `shots/<branch>/<blob>-<name>` — so the same screenshot published
twice is one blob at one URL: re-running `/pr` neither duplicates an image nor invalidates
a link already in the body, and a run whose tree matches the branch's tip pushes nothing at
all. The cost is a branch that only grows, which is the price of links that keep working.

The one case it declines is a **private repository**, where `raw.githubusercontent.com`
needs a credential neither the reviewer's browser nor GitHub's image proxy has. That is
reported as a warning rather than attached as a broken image. An unanswerable probe is not
a private repository: the publish proceeds, since a broken image is recoverable and a
silently skipped one is not.

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
