---
type: spec
title: Command toolkit
description: The device-wide `my-command-tools` CLI that commands call for the deterministic git/gh plumbing of a workflow run, and how it ships with every install mode.
tags: [process, toolkit, install, cli]
timestamp: 2026-07-25
updated: 2026-09-09
---

# Command toolkit

## Summary

Workflow commands such as `/task`, `/pr`, `/fb`, `/god`, and `/revive` repeatedly
derive the same git state. The zero-dependency Node CLI `my-command-tools` owns
that deterministic work: state, repository gates, explicit-path commits, PRs,
and worktrees. Every verb returns **JSON on stdout**.

Judgment stays with the agent. The toolkit never decides whether a comment is
noise, what a PR description should say, or whether a failure is worth fixing.

## Verbs

| Verb | Answers |
|------|---------|
| `state` | branch, base, commits, tracked vs untracked changes, `hasWork` |
| `scope` | what a branch changed: the ref to diff, its commits, its files, and with `--diff` the hunks themselves |
| `verify` | which of the repo's gates ran and passed; bounded output only on failure |
| `app start\|stop` | boot this repo's app on an ephemeral port and stop it again, by recorded pid |
| `commit` | stage an explicit path list and commit, with guards |
| `pr` | push, then create or update the branch's PR |
| `prs view\|list\|checks` | read-only pull-request lookups; never writes |
| `worktree begin\|end\|reap\|list` | the isolated-workspace lifecycle, and which worktrees have outlived their branch |
| `shots record\|read` | what a verification loop did — driver tier, verdict, rounds — written beside the screenshots it took, and read back |
| `cleanup` | retire a merged branch's local and remote refs, judged against its PR |
| `identity` | which GitHub account this checkout's remote wants, and `--select` to switch to it |
| `stash write\|restore\|list` | `/cp`'s five-deep clipboard ring under `~/.claude`, and the clipboard sink |
| `doctor` | where the toolkit resolved from, what's on PATH, which clone it tracks, and which external tools this device has |

`app` is the one verb that starts something and leaves it running. `verify` runs the
repo's gates and returns; a closed-loop check needs the repo's *app*, answering on a
port, for as long as the round takes. It records the pid and port at `start` because
argv is not reliable evidence: `worktree reap` finds a survivor by matching the
worktree path in its command line, which misses a dev server its own watcher re-exec'd
without that path — and under `/task --here` there is no worktree to scan at all.
`stop` reads the record, then sweeps the port for whatever the recorded pid handed
off to.

`state` collapses the rev-parse / status / log / diff opening volley into one call
and settles `/task`'s no-change gate with a single `hasWork` boolean.

`scope`, `prs`, `identity`, and `doctor.checkout` exist for a second reason beyond
call count: a probe with a name is never composed as the shell shape that gets
refused. `scope` replaces `$(git merge-base origin/main HEAD)`, `prs` replaces
`gh pr list … | jq …`, `identity` replaces
`GH_TOKEN="$(gh auth token --user <login>)" …`, and `doctor.checkout` replaces the
nest of three command substitutions `/sync` used to derive its clone path with. See
[Workflow gates](workflow-gates.md).

`stash` is the same move made for a shape no flag could fix. `/cp` step 3 prescribed
its five-deep ring rotation as a `for i in 3 2 1` loop composing `$((i + 1))` paths.
Every path in it was under `~/.claude`, so the snippet carried no git operation and no
repo-relative write — and it was refused every run regardless, because a
worktree-isolated session cannot resolve a loop-computed path by reading it and `/cp`
is usually invoked from inside a worktree. **The fix is the name, not the paths**: an
inline snippet is a different string every time and can never be allowlisted, while
`Bash(my-command-tools:*)` already is, so the rotation became a verb that a gate reads
in one token. It takes the entry as `--content-file <path>` for the reason
`commit --message-file` does, keeps the ring under `$CLAUDE_CONFIG_DIR` (or
`~/.claude`) and nowhere else, and owns the platform detection — the stash is written
everywhere, only the clipboard sink varies. A slot holding nothing is reported rather
than copied, since clearing the clipboard is worse than leaving it.

The same reasoning gives `commit` and `pr` their file forms. `--message-file <path>`
and `--body-file <path>` are what the usage strings advertise, because the multi-line
alternative is a heredoc and a heredoc composing a file is refused wholesale inside a
worktree — the shape those two verbs are called from most. The file pairs with the
tool that refusal already names: write the prose to a path, pass the path. `--message -`
and `--body -` still read stdin, but the usage strings no longer offer them as a route:
the gate refuses that form on sight, so a usage string that advertised it was prose
prescribing the exact call the gate then refused, and three recorded sessions spent a
turn each on the round trip. What the toolkit prints and what the gate does now say the
same thing.

`scope --diff` returns that branch's diff **content** in the same call, split into
`diff.committed` and `diff.workingTree` and annotated per line — `<sign><line number>\t<text>`,
the number being the line's own file. That closes the loop the verb previously left open:
`scope` handed back `files`, and the caller then went and diffed, once per path. There is
nothing left to fetch, so the per-path loop has no remaining excuse. Output is capped by
`--diff-limit` (200,000 characters by default) and a file past the cap is named in
`diff.omitted` rather than cut in half, since a truncated hunk reads as a complete one.

There is deliberately no comment-scoping verb. `/clean` needs the surrounding
branch diff to judge comments; pre-filtering would remove that context.

`worktree begin` creates a branch by default (`/task`) or, with `--existing`,
checks one out (`/fb --target`, `/review`, `/revive`, `/merge-deps`). It refuses
an existing branch without that flag and refuses `--base` with it, preventing a
fresh branch from abandoning existing commits.

`begin` and `end` also bracket the branch's **screenshots**. `begin` reports
`shotsDir` — `.my-command/shots/` inside the new checkout, as an absolute path —
and creates it on both the created-branch and the `--existing` path. Creation is a
recursive `mkdir`, so re-begetting a branch's worktree needs no pre-flight check.
Nothing in the repository ignores that path: `.my-command/` is excluded
device-wide through the user's global git excludes, which is why the directory can
sit inside the checkout without appearing in any branch's diff.

`end` empties it **before** the worktree is removed, reporting the destination as
`shotsKept` — `~/.my-command/shots/<repo>/<branch>/`, the home directory expanded
at runtime rather than written down. `<repo>` is read from the *common* git dir,
not from the caller's cwd, because `end` is routinely called from inside a worktree
whose basename is the worktree's rather than the repo's. **A slashed branch becomes
nested directories, one per segment** — `feat/a/b` keeps as `…/feat/a/b/` — not one
flattened name. Git's ref namespace already forbids a branch existing both as a ref
and as another branch's directory prefix, so nesting cannot collide, whereas
flattening would put `feat/a-b` and `feat-a/b` in the same place. Every segment is
still sanitized to `[A-Za-z0-9._-]` before it is joined, since a keep path built
from a branch name is not the place to trust git's own ref rules.

Three failures the move survives, each of them ordinary rather than exotic: the
destination not existing (created recursively), a filename already there from a
previous run against the same branch (suffixed `-2`, `-3`, … before the extension,
never overwritten — screenshot tools name by route and step, so collisions are the
norm and a silent overwrite destroys the evidence the keep exists to hold), and a
rename across filesystems, which fails outright with `EXDEV` when the home
directory and the worktree sit on different volumes (copy-then-delete, the same
move by a slower route). An absent or empty directory is not a failure: most
branches capture nothing, and that reports `shotsKept: null`.

`--drop-shots` deletes the directory instead, reporting `shotsDropped: true` and
`shotsKept: null` — the flag's effect, not a count. `MY_COMMAND_SHOTS_DIR`
overrides the keep root, which is how the tests exercise the move for real without
writing into a developer's home directory.

`shots record` writes the third thing that lives in that directory: `verdict.json`, naming
the driver tier a verification loop ran, the verdict it reached, and the round count. It
refuses a tier or verdict outside `mycommand-verifier`'s own vocabulary rather than storing
a typo, since a misspelled tier would record fine and silently withhold the screenshots
later. `/verify` Step 6 and `/task` Step 2.6 call it on every ending, green or not.
`shots read` reports the record and the images together, from both locations.

`pr` closes that loop at the other end. A branch whose recorded tier is a **browser** gets
its screenshots — read from the live `.my-command/shots/` and from the keep, the live copy
winning a collision — published under a `## Screenshots` heading: before/after pairs as a
table with one row per view, everything unpaired as a two-column grid.

**The gate is that recorded tier and not the shape of the diff**, which is a correction of
the first version. Gating on changed paths withheld exactly the evidence that mattered
most: a backend change proven in a browser through a dynamic frontend that needed no edit
had no frontend file in its diff, so its screenshots were dropped, while a frontend diff
nobody exercised would have attached whatever stale images the keep still held. The tier is
the fact the glob was guessing at, and `/verify` is the one component that knows it. The
verdict is reported and never gates: a `red` loop's screenshots are the ones a reviewer
most needs. Both silent paths stay silent — no screenshots, and a non-browser tier, each
attach nothing and report nothing. `--no-shots` switches it off, and `shotsWarning` is
reserved for what genuinely could not be published: images sitting beside no record at all,
a comment `gh` refused, or the overflow past one comment's file limit.

**Every repository takes an attachment comment**, whatever its visibility. One `gh pr comment
--body-file <path> --attach <file>` per run — up to `gh`'s 50 files, posted once the create
or edit above has yielded a PR number — uploads each file to GitHub's `user-attachments`
CDN, which serves under the reader's own credential and so renders on a private repository
too. The body and `--attach` carry the same absolute path deliberately: `gh` rewrites an
`![alt](<path>)` reference in place only where the string matches byte for byte, and
otherwise appends the images to the end of the comment and leaves the reference broken.
Re-runs are idempotent through the `<!-- my-command-shots <digest> -->` marker, which is
looked up before posting: the same digest reuses the comment, a different one replaces it.
`screenshots.via` is always `comment`, reported with the comment's URL.

A public repository used to embed the images in the body instead, from a `my-command-shots`
side branch linked over `raw.githubusercontent.com`, on the premise that no `user-attachments`
URL could be minted for a body written by a tool. Measured against `gh` 2.100.0 that premise
is false — `--attach` is on `pr create`, `pr edit`, `pr comment` and `issue comment` — so the
side branch, the content-addressed paths and the `gh repo view` privacy probe that chose
between the two are all gone. The body is still not used, for the other reason: `--attach`
mints a fresh URL per upload, which `pr`'s preserve-assets-by-`src` rule would accumulate
across runs.

The keep sits **after the reap and before the removal**. After, because a process
still writing screenshots would otherwise race the move; before, because once the
directory is gone there is nothing left to keep. It is also past `end`'s refusals,
so a worktree that survives an unpushed-HEAD refusal keeps its screenshots with it
rather than having them relocated out from under live work.

`worktree list` reports each worktree as `root`, `path`, `branch`, `head`, and
`reclaimable` — the last being `true` when that branch is already an ancestor of
`origin/<default-branch>`, so removing the worktree loses nothing. Nothing previously
answered that question, and the manual alternative is a `git merge-base --is-ancestor`
per worktree. The comparison ref is reported once as `comparedWith`, and `reclaimable`
is `null` rather than `false` wherever it could not be judged — a detached worktree,
which has no branch whose merge could be read, a branch ref git can no longer resolve,
and every entry when `origin/<default>` is absent locally. Only git's exit 1 counts as a
real "not merged"; any other exit is a failure to judge. That distinction is the point
of the tri-state: `false` everywhere
would read as "all live work" when the truth is "fetch first". The default branch is
always `false`, never `true`, even though it is trivially its own ancestor — reporting
it reclaimable would contradict the guard that refuses to target it.

The verb stays **offline**: it reads the remote-tracking ref already on disk rather than
fetching, so `list` remains a cheap local lookup and its answer is as fresh as the last
fetch (`begin` fetches). There is deliberately **no size field**. `du` overstates a
worktree severalfold on APFS because pnpm clones package files from its store rather
than copying them — a measured install producing a 197 MB tree cost 0 MB of real disk —
so apparent size measures the store, not what removing the worktree would return. The
reclaim signal is the merged branch.

`cleanup` covers the state a worktree teardown leaves behind: the branch itself,
after its PR merged. Both halves of that had been failing for reasons the merge
method makes predictable. `git branch -d` consults history alone, so a squash
merge — one commit on the target with none of the branch's own — reads as unmerged
and the deletion is refused; and GitHub's auto-delete setting takes the remote ref
at merge time, so a `git push <remote> --delete` afterwards fails on a ref that is
already gone. Neither is a question git can answer, which is why the verb asks the
**PR** instead: a merged PR for that head is the evidence that the commits landed,
and `git ls-remote --heads` is the evidence the remote ref is still there to
delete. So a squash-merged branch is deleted and reported as `squash-merged` with
its PR number, an auto-deleted remote is reported `already-absent` with `pass:
true`, and the only refusal left is `not-merged` — no merged PR and no containing
history, which is the one case where the commits really do exist nowhere else.
A branch a worktree still holds is refused as `checked-out`, naming the path.
`--keep-local` and `--keep-remote` each skip their half.

## Guards

These are the reason the plumbing is worth centralizing — each one encodes a
failure a workflow run has actually hit:

- `commit` refuses the default branch, and refuses `.` / `-A` / `--all`-style
  whole-tree staging. Paths are always explicit, so carryover files from a dirty
  checkout or a shared worktree stay put.
- `worktree end` refuses to remove a worktree whose HEAD isn't on `origin`, unless
  `--force`. Unpushed work is not discarded by accident.
- `worktree begin` refuses an existing branch unless `--existing` is given, so a run
  that meant to check out someone's pushed work can never start a fresh branch over
  the top of it.
- `pr` only ever moves a PR *toward* draft — it never silently flips an existing
  draft to ready and puts it in front of reviewers early.
- `verify` returns no log at all for a passing gate and a bounded tail for a
  failing one, so callers stop hand-rolling `2>&1 | tail -12` and stop re-running a
  whole build because they guessed the window too small.
- `verify --background` detaches the run and hands back the wait rather than
  leaving the caller to invent one. It returns a `wait.tool` / `wait.input` pair
  that is a single backgrounded Bash call ending by itself once the verdict file
  is non-empty, the `result` path to read when its notice arrives, and the
  `verdict` path itself. That is the affordance the watched-condition gates were
  refusing without: a gate that says "you are already watching this" leaves a
  caller polling anyway unless something else does the waiting, and every
  recorded case of a run reading its own output file five times began with a
  refusal it had no replacement for.
- `verify --wait [<verdict>]` **is** the wait, in one call. `--background` hands
  back a *notified* wait — three calls, an armed watch, and a report to read
  afterwards — and a run with nothing else to do spent the interval reading that
  report instead: twenty times in one recorded session, fifteen in another, four
  announcements of "I will stop polling" each followed by another poll on the
  next turn, and two sessions that ended still inside the loop with the work
  unreported. `--wait` blocks until the detached run exits, then prints that
  run's whole report and exits on its verdict, so the answer is in the result of
  the call that did the waiting. `--background` now returns it ready to send
  under `wait.blocking` and `wait.blockingCall` (a foreground Bash call carrying
  `timeout: 600000`), the watched-condition denials name it, and
  `--wait-timeout <s>` bounds it at 570s by default — timing out reports the run
  as still going and never kills it. `wait.input` stays for a run that must
  remain free while the gates run.
- The report is written **atomically at exit, before the verdict file**, and both
  the usage text and the denials say so. That is what makes the polling provably
  futile rather than merely wasteful: until the run is over the report does not
  exist, so every early read returns the same nothing. A refusal that only says
  "stop polling" leaves a caller with a reason to try once more.
- `worktree begin` reports `workingRoot` — the same absolute path as `path`,
  named for what the caller does with it — and an `enterWorktree` line stating
  that entering it is not needed. `path` alone read as somewhere to move the
  session to: ten recorded runs answered it with `EnterWorktree` and took a
  refusal that was certain, because a dispatched run's working directory is
  already a repository root, which that tool declines. Each then worked by
  absolute path and finished fine.
- `stash write --consume` deletes the content file once its bytes are in the
  ring. `/cp` composes into one fixed path every run, so without it the file
  survives to the next run, whose `Write` lands on a path that session never read
  — which `Write` rejects. A recorded run hit that same rejection on that same
  file every time it ran. The flag removes the pre-existing file rather than
  asking every future run to remember to read it first.
- `commit` retries **once** on an unapproved signing prompt. The failed attempt wrote
  nothing, so re-issuing the same commit is the entire fix — and it is a fix nobody has
  to recall. Never a rewrite, never `--no-gpg-sign`, never a config change.
- `pr` resolves a `must be a collaborator` rejection itself: the same write under a
  token belonging to the repository owner, then over REST, whose endpoints accept the
  credential GraphQL refused. It reports the `identity` that worked. A wrong-identity
  condition with one known answer is not a caller's problem.
- `identity` answers the same question for the `gh` calls that are not `pr` — a
  `gh pr edit` appending to a description, a `gh api` write. It reads the owner off the
  remote rather than guessing a login, and `--select` runs the one plain
  `gh auth switch --user <owner>`. This device is logged in as two accounts, so the
  pick is per repository and it is not a judgment call.
- `prs` has no write path at all, so a read-only lookup can never be the thing that
  changes a PR.

## Device-wide resolution

A command or skill must reach the toolkit no matter how MyCommand was installed.
Roots are tried in order, first hit wins:

1. `$MY_COMMAND_TOOLKIT` — explicit override (development, testing).
2. `$CLAUDE_PLUGIN_ROOT/src/toolkit` — set by Claude Code when a plugin command
   runs, so a plugin install needs no separate step.
3. `<shim dir>/../toolkit` — the payload beside the shim itself. Shim-only: it is
   what lets an install under a relocated `CLAUDE_CONFIG_DIR`/`CODEX_HOME` run
   *its own* toolkit rather than falling through to another root's copy.
4. `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/my-command/toolkit` — the device install
   the npx wizard writes, which is what personal-copy commands use.
5. `${CODEX_HOME:-$HOME/.codex}/my-command/toolkit` — the device install written
   with Codex Skills, which is what native `$skill` workflows use.

Root 3 is resolvable only from the shim's own location, so `paths.mjs` — and
therefore `doctor` — knows the four location-independent roots. The order lives in
exactly three places, each cross-referenced by comment:
`src/toolkit/bin/my-command-tools` (the shim), `src/toolkit/lib/paths.mjs` (what
`doctor` reports), and `installToolkit()` in `src/my-command.ts` (what writes roots
4 and 5). Changing one means changing all three.

## Reachable by name

Resolution answers "where is the toolkit"; it does not answer "can a command call
it". A command spells the call as a bare `my-command-tools` and declares it as
`allowed-tools: Bash(my-command-tools:*)`, so the shim has to be **on PATH** —
a fixed device path alone is invisible to a command. Absolute-path invocation is not
the workaround: it fails to match that permission rule, trading a missing command for
a prompt on every call.

So every install that places the shim also links it onto PATH, at
`<user bin dir>/my-command-tools` → `<device root>/bin/my-command-tools`:

- The link targets the **fixed shim path**, never one install's payload, so it keeps
  working when a later install replaces the toolkit underneath it.
- The directory is the first of `~/.local/bin`, `~/bin` **already on the user's
  PATH**. Both are user-owned, so linking needs no elevation.
- **No shell profile is ever edited.** Linking into a directory the user already has
  on PATH takes effect in the next shell with nothing to undo, where rewriting
  dotfiles guesses at the shell and leaves a mess behind. When neither candidate is on
  PATH, the installer prints the `export PATH=…` line instead of writing it.
- A real file already under that name belongs to something else and is left alone; a
  symlink is repointed, so a re-run is idempotent.

Without the link, commands silently fell back to unguarded hand-written
`git`/`gh`. `doctor.onPath` reports whether the bare call resolves to this
install's shim and gives the exact link command when it does not.

## Reported device facts

Alongside where it resolved from, `doctor` reports the external tools the verbs and the
workflow commands depend on. `node` is the running version; `git` and `gh` each report
`{available, version}`, `git` because every verb shells out to it and `gh` because only
`pr` and `prs` do — a device without `gh` still works for the rest.

`playwright` reports `{installed, version, source}`, and it is the one entry no verb uses.
It is there because a closed-loop check picks its driver tier from it, and that decision
needs a fact rather than a guess. Two probes run in order and the first to answer wins:

| `source` | Probe |
|---|---|
| `playwright-cli` | `playwright-cli --version` |
| `npx` | `npx --no-install playwright --version` |

Three properties are load-bearing, and each of them is a failure this field would
otherwise cause:

- **Non-installing.** `--no-install` is what keeps the second probe a probe: plain
  `npx playwright` fetches the package on a device that lacks it, so a read-only report
  would silently change the machine it was reporting on. Nothing here installs the CLI or
  downloads a browser.
- **Time-bounded.** Each probe is abandoned after 5s. `npx` reaches for a registry on a
  cold cache, and `doctor` is the verb a stuck device runs to find out what is wrong — it
  is the last thing that may hang.
- **Absence is a report, not a failure.** Neither probe resolving reads
  `{installed: false, version: null, source: null}` and `doctor` still exits 0. A missing
  binary, a non-zero exit, and a timeout are one answer: this did not resolve.

`scripts/install-marketplace-personal.sh` reads this field off `doctor --compact` rather
than re-probing, and when it is absent it **prints** the single global install command —
`npm i -g playwright` — for a human to run. It never runs it, never installs a browser,
and never fails on a device without Playwright. The probe order and that command live in
`src/toolkit/verbs/doctor.mjs` alone; `doctor.test.mjs` pins the installer's printed
command to the export so the two cannot drift.

Whether a *repository* has Playwright of its own is a separate question, asked by
[`/verify`](../features/verify.md) when it picks a tier. This field is about the device,
which is why it sits beside `node`, `git`, and `gh`.

### `gitExcludes`

The workflow commands drop artifact directories — `.playwright-cli/` for a browser driver,
`.my-command/` for a run's scratch — inside whichever repository they happen to run in.
Those directories belong to the tooling, not to the project, so they are ignored **once
per device** in the user's global git excludes file. No repository's own `.gitignore` is
ever edited: a per-repo edit would surface as a stray diff in every repository a workflow
command had ever touched, in a file that repository's own contributors own.

`gitExcludes` is that arrangement reported rather than assumed:

| Field | What it answers |
|---|---|
| `configured` | whether `core.excludesFile` is set in the global git config at all |
| `path` | the file git effectively reads, `~` expanded |
| `exists` | whether that file is readable |
| `patterns` | a map from each pattern to whether the file declares it |
| `missing` | the patterns it does not |
| `complete` | `missing` being empty, as one answer |
| `hint` | the append command that closes a partial state, or `null` |

`patterns` and `missing` are why this is not a boolean. Half-written is the state that
actually happens — one pattern added by an older installer, the other not — and a bare
`false` would send a human to re-read a file that is most of the way there. The slashless
spelling counts as present, so someone who already wrote `.my-command` by hand is not
handed a near-duplicate; a commented-out line does not.

`configured` and `path` are separate because git reads that file whether or not the config
names it: with `core.excludesFile` unset, git still honors `$XDG_CONFIG_HOME/git/ignore`.
So `path` resolves to that default rather than to nothing, and a device whose default file
already holds both patterns reads `complete: true` with `configured: false` — which is the
truth, where a `null` path would have reported a file git is actively reading as absent.

`scripts/install-marketplace-personal.sh` is the only thing that writes. Where
`core.excludesFile` is unset it picks git's own XDG location —
`${XDG_CONFIG_HOME:-$HOME/.config}/git/ignore`, derived at run time, never a baked-in home
— sets the config to it, and creates the file. Where the file already exists it **appends
only the missing lines**, so the user's existing entries are neither rewritten nor
reordered, and a file with no trailing newline gets one before the append rather than
having its last entry joined to ours. Running it twice changes nothing the second time.
Every failure around this is swallowed: an unwritable git config or an uncreatable
excludes path prints one line to stderr and the install completes, because nothing here is
needed for a command to run.

The step runs first and is reachable on its own — `install-marketplace-personal.sh
--excludes-only` does the ignore and stops — so repairing a partial device ignore does not
mean reinstalling every command file.

## Shipping constraint

**The toolkit ships as raw `.mjs` under `src/toolkit/`, never as build output.**
A plugin install is a git clone with no build step, and `dist/` is gitignored — so
anything requiring compilation simply does not exist in plugin mode. Raw `.mjs` is
the only payload that reaches every supported install path:

| Install path | How the toolkit arrives |
|---|---|
| `claude plugin install` | in the clone; found via `$CLAUDE_PLUGIN_ROOT` |
| `npx github:llevasseur/my-command` | `installToolkit()` copies it to the selected Claude or Codex device root |
| `scripts/install-personal.sh` | symlinks the checkout, so `git pull` updates it |
| `scripts/install-codex-personal.sh` | symlinks the checkout into the Codex device root, so `git pull` updates it |
| `scripts/install-marketplace-personal.sh` | updates command files only; the initial wizard install supplies the toolkit |
| `npm i -g @llevasseur/my-command` | the `my-command-tools` bin runs `src/toolkit/cli.mjs` from the installed package |

The npm bin points at `cli.mjs` directly rather than at the shim: an npm-installed
package is self-contained, so it should run *its own* toolkit, where the shim would
hand off to whichever copy the device roots resolve to.

Type safety is not given up for this: `tsconfig.toolkit.json` typechecks the `.mjs`
with `allowJs` + `checkJs` + `noEmit`, run as `pnpm run check:toolkit`.

## Invariants

- **New verb ⇒ registered.** Every `src/toolkit/verbs/*.mjs` appears in `cli.mjs`'s
  `VERBS` registry, or it can never be invoked. Enforced by `check-commands.sh`.
- **The shim stays executable.** `src/toolkit/bin/my-command-tools` is what lands on
  PATH; a lost mode bit fails only at call time. Enforced by `check-commands.sh`.
- **All install modes place the toolkit.** `src/my-command.ts` calls
  `installToolkit()` for the Claude plugin, personal-command, and Codex Skills
  paths, so no workflow ships without its tooling. Enforced by
  `check-commands.sh`.
- **Placing it implies linking it.** `installToolkit()` calls `linkOnPath()`, so the
  shim it just placed is callable by name. Dropping the call reinstates the silent
  fallback above. Enforced by `check-commands.sh`.
- **Zero dependencies, Node 22+.** Stdlib only — the toolkit runs from a bare clone
  with nothing installed. Tests use the built-in `node --test` runner.
- **JSON out, exit code carries the verdict.** 0 success, 1 a failed gate or refused
  guard, 2 a usage error. A `pass: false` result exits 1. Usage errors are a distinct
  `UsageError` class precisely so that 2 is reachable — a missing required flag is the
  caller's mistake, not a verdict about the repo.

## Acceptance criteria

- [ ] `my-command-tools doctor` resolves from all four location-independent roots, reporting which won.
- [ ] `doctor` reports `onPath.reachable`, and on a device with no link reports
      `reachable: false` with the exact `ln -s` fix rather than looking healthy.
- [ ] Every verb returns parseable JSON on stdout and nothing else, on both its success
      and its failure path. (`--help` output is prose, by design.)
- [ ] `commit` refuses the default branch and refuses whole-tree staging.
- [ ] `worktree begin --existing` checks a branch out at its own tip; without the flag an
      existing branch is refused.
- [ ] `worktree end` refuses a worktree with unpushed commits absent `--force`.
- [ ] `worktree begin` reports `shotsDir` and creates it, on the created-branch path and
      the `--existing` path alike, and creating it a second time is not an error.
- [ ] `worktree end` moves the shots to `~/.my-command/shots/<repo>/<branch>/` before the
      checkout is removed, reports that absolute path as `shotsKept`, nests a slashed
      branch one directory per segment, creates a destination that is not there, suffixes
      rather than overwrites a filename a previous run already kept, and falls back to
      copy-then-delete when the rename crosses filesystems.
- [ ] `worktree end` reports `shotsKept: null` rather than failing when the shots
      directory is empty or absent, and leaves the shots in place when it refuses to
      remove the worktree.
- [ ] `worktree end --drop-shots` deletes the shots and reports `shotsDropped: true` with
      `shotsKept: null`, writing nothing to the keep.
- [ ] `worktree list` marks a branch already merged into `origin/<default>` as
      `reclaimable: true`, live work as `false`, and the default branch as `false`;
      with no `origin/<default>` on disk it reports `comparedWith: null` and
      `reclaimable: null` rather than claiming nothing is reclaimable, and a branch
      ref git cannot resolve reads `null` rather than `false`.
- [ ] `cleanup` deletes a squash-merged branch git calls "not fully merged", reporting
      `squash-merged` with the PR number; refuses it as `not-merged` when no merged PR
      exists; reports an already-auto-deleted remote ref as `already-absent` with
      `pass: true`; and refuses a branch a worktree holds, naming the path.
- [ ] `verify --background` returns a `wait.input` that is one `run_in_background` Bash
      call, plus the `result` path to read once its notice arrives.
- [ ] `doctor` reports `playwright` as `{installed, version, source}` with `source` naming
      which probe answered; on a device with neither it reports
      `{installed: false, version: null, source: null}` and still exits 0, and no probe
      installs the CLI, downloads a browser, or outruns its 5s bound.
- [ ] `scripts/install-marketplace-personal.sh` prints `npm i -g playwright` when that
      field is absent, runs nothing, and exits 0 either way.
- [ ] `doctor` reports `gitExcludes` with the resolved `path` of `core.excludesFile` and a
      `patterns` map naming which of `.playwright-cli/` and `.my-command/` that file
      declares, so a half-written state reads as one present and one `missing` rather than
      as a bare false; an unset `core.excludesFile` resolves `path` to git's own XDG
      default rather than to nothing, and `doctor` still exits 0.
- [ ] `scripts/install-marketplace-personal.sh` appends only the missing patterns to that
      file — setting `core.excludesFile` to `${XDG_CONFIG_HOME:-$HOME/.config}/git/ignore`
      and creating the file when it is unset — leaves existing entries in their original
      order, is byte-identical on a second run, never edits any repository's own
      `.gitignore`, and exits 0 when the config or the path is unwritable.
- [ ] `pnpm run check:toolkit` and `pnpm test` pass in CI.
- [ ] A fresh `npx` install lands a runnable shim on the device root **and** leaves a
      bare `my-command-tools` call working in a new shell.

## Related

- Spec: [Install wizard](install-wizard.md) — the wizard that installs it
- Spec: [Adding a command](adding-a-command.md)
