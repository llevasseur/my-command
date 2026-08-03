---
description: Update the locally-installed MyCommand commands to the latest version on GitHub
argument-hint: "[--check]"
allowed-tools: Bash(git:*), Bash(readlink:*), Bash(ls:*), Bash(bash:*), Bash(claude:*), Bash(my-command-tools:*)
---

Update this device's MyCommand commands to the latest version from the GitHub repo.

`--check` (from $ARGUMENTS): report whether the local copy is behind, but don't change anything.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed.<!-- /include -->

## How the commands are installed here

These commands are installed one of three ways; detect which and act accordingly. Inspect `~/.claude/commands/sync.md`:

- **Symlink** → the git-synced personal install (the normal case). The link points into a local clone of the repo; updating means pulling that clone.
- **A real file** → a marketplace-synced personal copy. Update the marketplace checkout, then install its published namespaced commands locally as bare commands using the steps below.
- **Not present** → the commands are installed as the plugin (`/my-command:*`), which auto-updates through the marketplace. Run `git`-free: `claude plugin marketplace update my-command`, then remind me to `/reload-plugins`. Stop.

## Steps (symlink / git-synced install)

1. Locate the clone from the symlink, so this works regardless of where the repo was cloned:
   `REPO="$(cd "$(dirname "$(readlink -f ~/.claude/commands/sync.md)")/../.." && pwd)"`
   (the resolved path is `<clone>/src/commands/sync.md`, so the clone root is two directories up).
2. `git -C "$REPO" fetch origin` — as its **own** Bash call, not chained with `&&` into the
   comparison: a fetch may require approval, and folding it into a compound command escalates
   approval to the whole chain and costs a turn plus a retry. Then compare local `HEAD` to
   `origin/<default-branch>`.
   - If already up to date, say so and stop.
   - For `--check`, report how many commits behind (with `git -C "$REPO" log HEAD..origin/<branch> --oneline`) and stop without pulling.
3. Before pulling, check the clone is clean: `my-command-tools state --cwd "$REPO"` — both `changes.tracked` and `changes.untracked` must be empty. If there are local edits (you may be the author mid-change), report them and stop — never discard local work.
4. `git -C "$REPO" pull --ff-only`. If it can't fast-forward (diverged), report and stop rather than merging.
5. Re-link so any newly added commands get picked up: `bash "$REPO/scripts/install-personal.sh"`. Existing commands are symlinks, so they already reflect the pulled files.
6. Confirm the shared toolkit came along: `my-command-tools doctor`. The commands call it for their git plumbing, so a sync that updated the Markdown but left the toolkit stale or unresolvable is a half-sync. Report `resolvedBy` and `version`.
7. Report: the commits pulled (`git log <old>..<new> --oneline`) and which commands were added, changed, or removed. Note that a command you already invoked this session may be cached — restart the session if it still looks stale.

## Steps (real file / marketplace-synced personal install)

1. Ensure the marketplace is registered. If `~/.claude/plugins/marketplaces/my-command` does not exist, run `claude plugin marketplace add llevasseur/my-command`.
2. Run `claude plugin marketplace update my-command` so the local marketplace checkout contains the latest published command Markdown.
   - For `--check`, run the marketplace update check supported by the installed Claude CLI if available. If the CLI cannot check without updating, report that limitation and stop without changing the personal commands.
3. Verify `~/.claude/plugins/marketplaces/my-command/scripts/install-marketplace-personal.sh` exists. If it does not, report that this marketplace version does not support personal sync and stop.
4. Run `bash ~/.claude/plugins/marketplaces/my-command/scripts/install-marketplace-personal.sh`. It copies the marketplace's generated `commands/*.md` into `~/.claude/commands/` and converts references from `/my-command:*` to bare `/*` commands while preserving filenames.
5. Confirm the shared toolkit is reachable afterwards: `my-command-tools doctor`; report `resolvedBy` and `version`.
6. Report which personal command files were updated. Note that a command already invoked in this session may be cached — restart the session if it still looks stale.

## Notes

- Step 6 closes the run whichever install path ran. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->
- This command only consumes updates. Publishing a change is the maintainer flow: edit `src/commands/`, run `scripts/build-plugin.sh`, commit, push.
- Never force, reset, or stash the clone's working tree.

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
