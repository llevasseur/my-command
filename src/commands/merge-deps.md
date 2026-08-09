---
description: >
  Batch-merge open non-draft Dependabot PRs into main, one by one. For each, first run
  /mc -t <branch> to merge main in and resolve conflicts, verify in an isolated worktree,
  then merge into main and clean the worktree. Invoke on /my-command:merge-deps.
argument-hint: "[--label <name>] [--squash | --merge | --rebase] [--auto] [--dry-run | -n]"
allowed-tools: Bash, Read, Edit, Write
---

# merge-deps — Batch-merge Dependabot PRs

Merge every open, non-draft dependency PR (Dependabot) into `main`, one at a time:
`/mc` it up to date with `main`, verify it green in an isolated worktree, then merge
through GitHub so branch protection is respected. Worktrees are cleaned up as you go.

**Announce at start** the label filter, merge method, and whether this is a dry run.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **Resolve it in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

## Flags

Parse leading flags off `$ARGUMENTS`:

- `--label <name>` — the label a PR must carry to be in scope. Default: `dependencies`
  (Dependabot's default). Pass to widen/narrow (e.g. `--label "dependencies,security"`
  matches PRs with **any** of those labels).
- `--squash` / `--merge` / `--rebase` — the merge method handed to `gh pr merge`.
  Mutually exclusive; if more than one is given, stop and ask which. Default: `--squash`
  (clean single commit per dependency bump).
- `--auto` — don't wait on CI. Enable GitHub auto-merge for each PR (merges when its
  required checks pass) and move on. Without it, each PR is merged immediately and, only
  if GitHub blocks on still-pending required checks, auto-merge is enabled as a fallback.
- `--dry-run` / `-n` — list the PRs that would be processed, in order, then stop. No
  branches touched, no merges, no worktrees.

## Preconditions (once, up front)

1. `my-command-tools doctor` — confirms `git` and `gh` are available. Then `gh auth status`
   for authentication, which `doctor` doesn't check.
2. `my-command-tools state` — it errors if you are not inside a git repo, and reports
   `branch` (record as `START_BRANCH`), `defaultBranch` (call it `MAIN`; `main` below is
   shorthand), and `changes`.
3. **Working tree must be clean** — both `changes.tracked` and `changes.untracked` empty.
   If dirty, first check for an
   in-progress merge (`.git/MERGE_HEAD`) before stopping — do **not** stash, reset, or
   abort the user's work. Tell them to commit or stash and stop.
4. Update and fast-forward local main: `git fetch --all --prune`, then
   `git checkout main && git pull --ff-only origin main`. If the fast-forward fails, stop
   and report — local `main` diverged and needs a human.

## Select the PRs

List open, non-draft PRs carrying the label, based on main:

```
my-command-tools prs list --base main --label <label> --draft false --limit 200
```

One read-only call, JSON on stdout, with every field below already in it — no `--json` list to
name and no `| jq` to pipe it through.

- Keep only PRs where `isDraft == false` (belt-and-suspenders alongside `--draft false`).
- **Skip cross-repo / fork PRs** (`isCrossRepository == true`) — you cannot push the `/mc`
  conflict resolution to a fork. Collect them and report as skipped.
- Process in **ascending PR number** (oldest first) for a deterministic order.
- If there are none, say so and stop.
- **`--dry-run`:** print the ordered list (number, branch, title) and stop here.

## Per-PR loop (sequential — one PR fully done before the next)

<!-- include-block: shared/merge-command-forms.md -->
### Merge command forms

The merge steps are where this pipeline's failed shell calls concentrate, and almost every one is a rejected merge re-issued verbatim. Read the error text and branch on it; never send the same call twice.

- **Merging a PR into the default branch** is `gh pr merge <number> --<method>`, issued **once**, and **never with `--delete-branch`**. That flag runs a local branch cleanup after the merge, which fails with `fatal: '<default>' is already used by worktree at …` on any device that keeps the default branch checked out — so the merge lands and the call still exits 1, reporting a failure for work that succeeded. Delete the branch as its own step instead: `my-command-tools worktree end --branch <branch>` for the local worktree and branch, and `git push origin --delete <branch>` for the remote ref, each in its own call. Its rejections are states, not usage errors:
  - `Merge already in progress`, or a failing `mergePullRequest` GraphQL call — GitHub accepted a merge and is still processing it. **Do not re-issue it.** Read the outcome instead: `my-command-tools prs view <number>`, whose result already carries `state`, `mergedAt`, and `mergeStateStatus`. `MERGED` is success, and the run continues at its next step. Only a PR that settles back to `OPEN` is merged again, and then once.
  - Pending required checks — a wait, not a refusal. Re-issue the identical command **with `--auto`** and record the PR as queued.
  - `not mergeable`, `BLOCKED`, or `BEHIND` — the default branch moved. Run `/mc -t <branch>`, then retry the merge once.
  - Never reach for `--admin`, `gh api -X PUT .../merge`, or a `GH_TOKEN=` re-run to get past any of these.
- **Merging the default branch into a branch** addresses a worktree by path rather than by changing directory: `git -C <path> merge --no-edit origin/main`, `git -C <path> diff --name-only --diff-filter=U`, `git -C <path> push origin HEAD`. `cd <dir> && git …` is the recorded failure, because a worktree session is rarely where that path resolves. The toolkit takes the path as a flag for the same reason: `my-command-tools verify --cwd <path>`.
- A refusal that comes from the harness rather than from `gh` is final. Surface it and carry on with the rest of the run.
<!-- /include-block -->

Merging one PR changes `main`, so the next PR must be resolved and verified against the
**new** `main`. Process strictly one at a time. If a PR can't be safely merged, record it
and move on — never leave a branch mid-merge or a worktree behind.

For each PR (number `N`, branch `B`):

1. **Refresh the branch, then resolve conflicts with `/mc`.** Dependabot force-pushes its
   branches, so the ref you fetched in preconditions may already be stale by the time the
   loop reaches this PR — first `git fetch origin B` so `/mc` branches off the current tip
   rather than a stale one (branching off a stale base makes its push get rejected as a
   non-fast-forward). If a stale local `B` already exists from an earlier iteration, delete
   it (`git branch -D B`) so `/mc` recreates it from the fresh `origin/B`. Then invoke
   **`/mc -t B`** — it merges the latest `main` into `B` one conflict at a time and pushes
   `B`. If `/mc` reports `B` in its 🔴 "needs human" list (a conflict it could not
   resolve), **do not merge**: record `B` as blocked (unresolved conflict), skip to the
   next PR.

2. **Verify in an isolated worktree.** After `/mc`, `B` is up to date with `main` and
   checked out nowhere — `/mc -t` does its merge in its own worktree and tears that worktree
   down before returning. Check `B` out in a throwaway worktree and
   confirm the dependency bump is green before it touches `main`:
   - `my-command-tools worktree begin --branch B --existing --bootstrap`. `--existing`
     checks `B` out rather than creating it — creating it would throw away the bump `/mc`
     just pushed. It reports the `path`, and runs the repo's own
     `scripts/bootstrap-worktree.sh` if it has one. If git says `B` is already checked out,
     `git worktree prune` and retry.
   - If `bootstrapScript` came back `null`, the repo has no bootstrap of its own: follow a
     "Worktree Setup" section in `AGENTS.md`/`CLAUDE.md` if there is one, otherwise run the
     repo's install (`pnpm install` / `npm ci` / …) only if verification needs it. Symlink
     gitignored `.env` files from the main checkout — never copy or edit them.
   - `my-command-tools verify --cwd <path>` — it discovers and runs the repo's own gates in
     that worktree, and returns a bounded log for each failure. If it **fails because of
     this update**, record `B` as blocked (failed verification), remove the worktree, skip
     to the next PR.

3. **Merge into main.** Merge through GitHub so branch protection is honored (never push
   to `main` directly):
   - `--auto` given → `gh pr merge N --<method> --auto` and record `B` as queued.
   - Otherwise → `gh pr merge N --<method>`. If GitHub rejects it because required checks
     are still pending, fall back to the same command **with `--auto`** and record `B` as
     queued; on a clean merge record `B` as merged.
   - On a merged (not queued) PR, delete the remote branch in its own call:
     `git push origin --delete B`.

4. **Clean the worktree.** `my-command-tools worktree end --branch B --force`. The verb
   normally refuses to remove a worktree whose HEAD isn't on origin; `--force` is right
   here and only here, because these worktrees hold no authored work — just install
   artifacts that left the tree dirty. Never force-remove a worktree that holds real work;
   these never do.

5. **Refresh local main** before the next PR so its `/mc` resolves against the just-merged
   result: `git checkout main && git pull --ff-only origin main`. (Skip the pull effect for
   queued/auto PRs whose merge hasn't landed yet — `/mc` fetches main itself regardless.)

## Finish

1. Return to the starting branch: `git checkout $START_BRANCH`.
2. Confirm no leftover worktrees: `my-command-tools worktree list`; prune any you created.
3. Report a concise summary:
   - ✅ merged into `main`
   - 🟡 had conflicts `/mc` resolved, then merged (name the files `/mc` touched)
   - ⏳ queued — auto-merge enabled, will merge when checks pass
   - 🔴 left for a human — with the reason (fork/cross-repo, unresolved conflict, or failed
     verification)
4. Never mark the run complete if anything is 🔴 without saying so explicitly.
5. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Notes

- **Dependency PRs only.** Scope is the label filter — never touch unlabeled or feature
  PRs. Non-draft only.
- Delegate all conflict resolution to `/mc` — never hand-merge here. Never force-push;
  merges only.
- Never merge a PR whose `/mc` conflicts are unresolved or whose verification failed.
- Respect branch protection: merge via `gh pr merge`, never a direct push to `main`.
- Worktrees live under `.claude/worktrees/`; remove each when its PR is done.
- `$ARGUMENTS` holds only the flags — this command takes no free-text criteria.
- <!-- include: shared/approval-own-call.md -->**A command that may need approval goes in its own Bash call** — `git fetch`, `git config`, and, as a narrow exception to the general rule to chain dependent mutations, branch-lifecycle operations such as checkout/switch, pull, remote-branch inspection, and local branch deletion. Folding one into an `&&` chain escalates approval to the whole compound command and costs a turn plus a retry. Put status output, pipes, and follow-up verification in separate read-only calls.<!-- /include -->
- <!-- include: shared/classifier-refusal.md -->A classifier refusal is not evidence that repository protections should be weakened. Inspect the refused command first; when the intended operation is safe and the refusal looks incidental to the command's shape — an over-broad chain, pipe, or extra flag — retry only the smallest exact command, never an allowlisted Bash pattern or a permission-settings change.<!-- /include -->
- <!-- include: shared/refusal-final.md -->A refusal of a **PR merge or a remote-ref deletion is final.** Surface it to the human and carry on with the rest of the work. Re-expressing the same operation is refused for the same reason and costs a second turn: `gh api -X PUT .../pulls/N/merge` is `gh pr merge`, and `gh api --method DELETE .../git/refs/heads/...` is `git push origin --delete`, so neither is a narrow retry — nor is re-running one under `GH_TOKEN=...`.<!-- /include --> Step 3's `gh pr merge N --<method>` and its `git push origin --delete B` are where this fires.

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no marker to type: the `- done:` line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close here in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
