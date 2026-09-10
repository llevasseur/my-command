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

A media element carrying no source is **not** an asset. `<img>` written inside a sentence
about `<img>` tags is prose, and the first version preserved it: this repo's own PR
description grew an `## Assets` heading with a bare `<img>` under it, taken from a bullet
that explained how the screenshot section is built. The URL is now read from `src`,
`srcset`, or `poster`, and a match with none of them is skipped rather than carried over as
its own matched text.

Each is reinserted verbatim, so alt text and sizing attributes survive the round trip.
Assets are de-duplicated by URL, so the same image appearing twice is carried once.
Anything the rewritten body already references — matched by URL — is left where the new
body put it; the rest is appended under an `## Assets` heading, reusing that heading when
the body already has one so repeated updates collect into one section instead of stacking.
Where markup nests, the outermost match wins, so a `<picture>` is kept whole rather than
shredded into its `<img>`. Updates report the carry-over count as `assetsPreserved`.

### A browser-verified branch carries its screenshots

`/verify` and `/task` Step 2.6 capture screenshots of the running app into
`.my-command/shots/` inside the worktree, and `worktree end` preserves them to
`~/.my-command/shots/<repo>/<branch>/`. Until now nothing put them in front of a reviewer:
the person who most needed to see what the change looked like had to be told a path on the
author's machine.

`my-command-tools pr` embeds them, gated on the **verdict `/verify` Step 6 records beside
them**. That record — `verdict.json`, written by `my-command-tools shots record` — names
the driver tier the loop ran and the verdict it reached, and `pr` publishes the
screenshots when the tier is a browser (`playwright`). Three cases follow from that. A
branch with no screenshots attaches nothing and says nothing. A branch verified at
`http` or `static` photographed nothing worth showing, so it attaches nothing and says
nothing too. Screenshots sitting beside no record at all produce a `shotsWarning`, since
something is there to attach and nothing says whether it may be — in practice that means
Step 6 was skipped.

**The verdict itself never gates it.** A `red` loop's screenshots are the ones a reviewer
most needs, and withholding them would hide the failure the loop found, so the verdict is
reported alongside the count and tier and does nothing else.

### Why the tier, and not the diff

The first version of this gated on the diff: markup and stylesheet extensions counted
anywhere, script files counted under a directory that serves a UI. It was wrong in both
directions, and the interesting direction is the first one.

A backend change verified **through** the frontend attached nothing. Widen a datastructure,
prove in a browser that a dynamic frontend picked it up without needing an edit, and the
screenshots proving exactly that were withheld, because no frontend file appeared in the
diff. That is the case where the evidence is least reproducible from the diff alone and so
most worth attaching. The other direction was quieter but real: a frontend diff nobody ever
exercised would attach whatever stale images were lying around in the keep.

The tier answers the question the glob was guessing at. `/verify` only reaches the browser
tier when it actually drove one, and it is the one component that knows which tier it ran.
So the loop records that fact and `pr` reads it, instead of inferring visual relevance from
file extensions. The cost is a dependency between two commands that were independent: a
branch verified before this record existed, or by hand, attaches nothing until
`shots record` runs.

Screenshots are read from both places they can be: the live `.my-command/shots/` in the
workspace, which is where they still are when `/task` runs `/pr` before its teardown, and
the device-wide keep, which is where a `--here` run or a second `/pr` after teardown finds
them. The workspace wins a name collision, being the newer of the two.

Filenames decide the layout. A stem carrying a `before` or `after` marker at either end —
`home-before.png`, `after_home.png`, `settings.after.png` — pairs into a **before/after
table**, one row per view, before column then after; a view with only one side still gets
its row, with the missing cell saying so, because that is more use to a reviewer than
losing the pairing. Everything with no marker renders as a **grid**, two columns wide.
Images are markdown rather than `<img>` elements, because `![alt](<path>)` is the only shape
`gh` rewrites into an uploaded URL. `worktree end`'s collision suffix is accounted for:
`home-before-2.png` is the same view as `home-before.png`, not a view called `home-2`.
`--no-shots` switches the whole thing off.

### Why every repository gets an attachment comment

`gh pr comment <number> --body-file <path> --attach <file>` uploads each attached file to
GitHub's own `user-attachments` CDN and prints the comment's URL. That CDN serves under the
**reader's** own credential, which is what makes one route work for every repository: a
private repo renders it as readily as a public one, where a `raw.githubusercontent.com` link
would need a credential neither the reviewer's browser nor GitHub's image proxy has. One
comment per `pr` run carries every image, up to `gh`'s limit of 50 files per command; past
that the overflow is reported as a warning rather than silently dropped.

**This used to be two routes, and the second one rested on a claim that is no longer true.**
A public repository's bytes were committed to a `my-command-shots` side branch of the
repository under review and linked from `raw.githubusercontent.com`, because a PR body
written by a tool was held to be unable to carry a `user-attachments` URL at all. Measured
against `gh` 2.100.0, that is false: `--attach` is on `gh pr create`, `gh pr edit`,
`gh pr comment` and `gh issue comment`, and `gh pr create --help` states outright that the
attachment is appended to the body and that a matching body reference "is rewritten to point
at the uploaded asset". So the capability gap the side branch was the price of does not
exist, and the branch — orphan, append-only, growing forever, on the repository being
reviewed — bought nothing. It is gone, along with the `gh repo view` privacy probe that
chose between the two.

**The body is still not where the screenshots go, for a different reason.** Each `--attach`
uploads afresh and mints a new URL, so a re-run would append the same image again under a
new link, and `pr`'s own preserve-assets-by-`src` rule would faithfully keep every stale
copy. The comment route has an idempotency mechanism already, described below, and one
route with that property beats two without it.

**The body-to-attachment rewrite matches on the reference string, and that is the whole
mechanic.** `gh` rewrites an `![alt](<path>)` in the body to its uploaded URL only where that
path string is byte-for-byte identical to the string passed to `--attach`. An absolute path
in both places works and keeps the markdown table intact. When the two differ, `gh` does not
fail: it appends every attached image to the end of the comment and leaves the body's
reference as a broken link — which is what a hand test produced when the body said
`./dashboard-after.png` and `--attach` was given an absolute path. So the verb copies each
screenshot into a temp directory under a markdown-safe name, renders the section against
those copies, and hands `--attach` the same strings. Staging rather than attaching in place
keeps a space or `)` in the repository's own path out of the reference, and keeps the
user's home path out of the comment. The paths are passed **bare**: `--attach 'file#alt
text'` does set alt text from the suffix, but its interaction with reference matching is
unverified, so the alt text is written body-side in the markdown instead. Mechanics
confirmed by hand against `gh` 2.100.0.

**One comment per PR, not per run.** A hidden marker carries it — `<!-- my-command-shots
<digest> -->`, hashing the attached names and bytes. Before posting, the verb lists the PR's
comments for that marker: a match with the same digest is reused as it stands and its URL
reported, and one with a different digest is deleted once the replacement is up. A PR that
`/fb` or `/review` updates three times carries one screenshot comment, not three.

The result is reported as `screenshots`, with `via: comment` and the comment's URL, so
`shotsWarning` is left for what genuinely could not be published: images beside no recorded
verdict, a comment `gh` refused, the overflow past 50 files, or a comment whose images do not
render. On a freshly created PR the number comes from the `gh pr view` lookup, or from the
`/pull/<n>` URL `gh pr create` printed when that lookup misses, so the comment is posted
either way.

### The comment is proven to render, not assumed to

`gh` exiting zero proves a comment was created. It does not prove a reviewer can see
anything in it, and the reference-matching mechanic above is exactly why: where the body's
`![alt](<path>)` is not byte-for-byte the `--attach` string, `gh` appends the images, leaves
the reference pointing at a temp path on the author's machine, and still exits zero. The
failure is silent on the author's side and total on the reviewer's — a `## Screenshots`
table of broken image icons. Staging the files under matching names is what avoids it; it is
not what proves it was avoided.

So the comment is read back and checked, in two stages, because they fail for different
reasons and only one of them is about the network.

- **The references.** `gh api repos/<owner>/<repo>/issues/comments/<id>` returns the body as
  GitHub holds it. Every attached file must appear as a markdown image whose alt text is the
  screenshot's name and whose href is on the attachment host, and no image reference may
  point anywhere on a filesystem. A local path under a name nobody attached is the same
  broken link seen from the other end, so it is counted too, once.
- **The bytes.** Each attachment URL is requested — HEAD first, since it needs no body,
  falling back to GET where the response carries no length — and must answer 2xx with a
  non-zero length. A rewritten reference to an asset the CDN will not serve renders no
  better than a path. The credential goes over `curl`'s stdin config rather than argv, where
  a token is readable by every process on the machine. `MY_COMMAND_SHOTS_PROBE=0` drops this
  half and keeps the first, for a machine that cannot reach the CDN at all — where every URL
  would read as dead and the warning would be about the network rather than the comment. It
  is also what keeps the unit suite offline.

The outcome lands on the result as `rendered` and `failed` counts beside the image count, and
anything that did not render goes into `shotsWarning` with the reason per file. **It never
fails the run.** The PR is open and pushed by the time this check runs, and a comment with a
dead image link is a defect in the comment, not a reason to withhold the pull request — so
the verb reports it and returns. Nothing about the existing gates moves: the browser tier
still decides whether images are published at all, the verdict still never withholds them,
and `--no-shots` still switches the whole thing off.

**The digest-reuse path is checked identically.** A comment carried over from a previous run
was verified when it was posted, but an asset can stop resolving afterwards, and reuse is the
path where nothing would otherwise look at it again. So the check runs on the reused comment's
own URL rather than being skipped as already-proven work.

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
