---
description: >
  Merge the latest main into open PR branches (or a single target/current branch),
  resolve every merge conflict one by one, and push to origin. Invoke on /mc.
  Default: merge main into every open PR branch based on main. --here / -h: only the
  current branch. --target / -t <branch>: only the named branch, in an isolated worktree.
argument-hint: "[--here | -h] [--target | -t <branch>]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(my-command-tools:*), Read, Edit, Write
---

# mc — Merge main & resolve conflicts

**Announce at start** which mode you are running (all PRs / here / target `<branch>`).

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the closing turn.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows — and leave it open until it is the only item left. The todo list is live session state that a compaction carries forward; this prompt is not. Once this run is summarized, that item is the only surviving record that an outcome is still owed. **Then close it out:** "until it is the only item left" is the trigger to resolve it, not a reason to leave it open forever — once it is the last item and the work is done, mark it completed with the run's **final tool call**, and send the text-only message after that call returns. Both constraints hold at once that way: the task list ends clean and the closing message still carries zero tool calls. Never hand back with the anchor still open — a finished run reads as abandoned in the job list.<!-- /include -->

## Argument parsing

Parse `$ARGUMENTS`:

- `--here` or `-h` → **HERE mode**: operate only on the currently checked-out branch.
- `--target <branch>` or `-t <branch>` → **TARGET mode**: operate only on `<branch>`, in an
  **isolated worktree** — the current checkout is never touched.
- Neither → **ALL mode** (default): operate on every open PR that bases off `main`.

`--here` and `--target` are mutually exclusive — if both are given, stop and ask which one.

## Preconditions (do these once, up front)

1. `my-command-tools state` — it errors if you are not inside a git repo, and one call
   settles the next three preconditions. Read `branch` as `START_BRANCH` (the branch to
   return to at the end), `defaultBranch` as `MAIN`, and `changes` for the clean-tree
   check below.
2. **Working tree must be clean — HERE and ALL modes only.** Both `changes.tracked` and
   `changes.untracked` must be empty. **TARGET mode skips this check**: it merges inside its
   own worktree and never moves this checkout's `HEAD`, so uncommitted work here is none of
   its business — leave it exactly as it is. For HERE and ALL, if there is uncommitted
   work, first check for an in-progress merge before stopping: if `.git/MERGE_HEAD` exists,
   a prior merge was interrupted before completing or aborting. Read `.git/MERGE_MSG` to see
   what was being merged. If that pending merge is **exactly the operation this invocation
   would perform** (HERE mode with `main` merging into the current branch), **finish it** —
   resolve the remaining conflicts per
   the per-branch loop below (steps 4–7) rather than aborting; aborting would discard partial
   resolution already staged. Only if the pending merge is unrelated, or there is dirty work
   with no `MERGE_HEAD`, stop and tell the user to commit or stash first — do **not** stash or
   abort on their behalf.
   - TARGET mode's equivalent recovery lives in its worktree, not here — see
     "TARGET mode workspace" below.
3. Everything below uses `main` as shorthand for the `defaultBranch` from step 1.
4. Update remotes, and fast-forward local main **for HERE and ALL modes**:
   - `git fetch --all --prune`
   - `git checkout main && git pull --ff-only origin main`
   - If the fast-forward fails, stop and report — local `main` has diverged and needs a human.
   - **TARGET mode does neither of these.** `worktree begin` fetches for you, and the merge
     there uses `origin/main` directly, so there is no reason to check out or move local
     `main` in the user's checkout.

## Building the branch list

- **HERE mode** → the single branch = `START_BRANCH` (must not be `main`; if it is, stop).
- **TARGET mode** → the single branch = the provided `<branch>`. Verify it exists
  (`git rev-parse --verify <branch>` or `origin/<branch>`); if neither has it, stop and
  report. Do **not** create a local tracking branch by hand — the worktree setup below
  checks the branch out for you.
- **ALL mode** → list open PRs based on main:
  `gh pr list --state open --base main --json number,headRefName,headRepositoryOwner,isCrossRepository,title --limit 200`
  - **Skip cross-repo / fork PRs** (`isCrossRepository == true`) — you cannot push to a fork.
    Collect their branch names and report them as skipped at the end.
  - The branch list = the `headRefName` of each remaining PR.

## TARGET mode workspace

TARGET mode never checks `<branch>` out in the current tree. It gets its own worktree, so a
dirty working tree, an unrelated in-progress merge, or a branch you are mid-edit on all stay
untouched, and `HEAD` here never moves.

1. `my-command-tools worktree begin --branch <branch> --existing --bootstrap`. It fetches
   first, then checks out that **existing** branch into a worktree and reports the `path`.
   `--existing` is what makes this safe: without it the verb would create a new branch,
   silently abandoning the work already on `<branch>` — the very work you are merging into.
2. **Do not enter the worktree.** Work through absolute paths under the reported `path`:
   `git -C <path> …` for every git call in the loop below, and absolute paths for `Read`
   and `Edit` on conflicted files. `/mc` is frequently invoked as a step inside another
   workflow (`/merge-deps`, `/god`); relocating the whole session into a worktree would move
   the ground under that caller.
3. **If the verb refuses because the path or branch is already taken** (`worktree path
   already exists`, or git reporting `<branch>` already checked out), do not retry it.
   Inspect `my-command-tools worktree list`, validate the reported owner path and branch,
   and use that existing checkout when it is this run's target — a leftover from an
   interrupted run is yours to finish. A live owner belonging to another session is a stop,
   not a reason to force or remove it. If the list shows nothing holding it, the registration
   is stale: `git worktree prune` and retry once.
4. **Finish an interrupted merge rather than restarting it.** If `<path>/.git/MERGE_HEAD`
   exists, a previous TARGET run stopped mid-merge. Read `<path>/.git/MERGE_MSG`; if it is
   `main` merging into `<branch>` — the operation this invocation would perform — resolve
   the remaining conflicts per steps 4–7 below instead of aborting, since aborting discards
   resolution already staged. If it is anything else, stop and report the path.

## Per-branch merge loop

<!-- include-block: shared/merge-command-forms.md -->
### Merge command forms

The merge steps are where this pipeline's failed shell calls concentrate, and almost every one is a rejected merge re-issued verbatim. Read the error text and branch on it; never send the same call twice.

- **Merging a PR into the default branch** is `gh pr merge <number> --<method> --delete-branch`, issued **once**. Its rejections are states, not usage errors:
  - `Merge already in progress`, or a failing `mergePullRequest` GraphQL call — GitHub accepted a merge and is still processing it. **Do not re-issue it.** Read the outcome instead: `gh pr view <number> --json state,mergedAt,mergeStateStatus`. `MERGED` is success, and the run continues at its next step. Only a PR that settles back to `OPEN` is merged again, and then once.
  - Pending required checks — a wait, not a refusal. Re-issue the identical command **with `--auto`** and record the PR as queued.
  - `not mergeable`, `BLOCKED`, or `BEHIND` — the default branch moved. Run `/mc -t <branch>`, then retry the merge once.
  - Never reach for `--admin`, `gh api -X PUT .../merge`, or a `GH_TOKEN=` re-run to get past any of these.
- **Merging the default branch into a branch** addresses a worktree by path rather than by changing directory: `git -C <path> merge --no-edit origin/main`, `git -C <path> diff --name-only --diff-filter=U`, `git -C <path> push origin HEAD`. `cd <dir> && git …` is the recorded failure, because a worktree session is rarely where that path resolves. The toolkit takes the path as a flag for the same reason: `my-command-tools verify --cwd <path>`.
- A refusal that comes from the harness rather than from `gh` is final. Surface it and carry on with the rest of the run.
<!-- /include-block -->

For **each** branch in the list, do the following. Keep going even if one branch needs a
human — collect it and move on; never leave a branch mid-merge.

In TARGET mode there is exactly one branch and it is already checked out in the worktree, so
**skip step 1** and prefix every git call below with `-C <path>`. HERE and ALL modes run the
steps as written, in the current checkout.

1. `git checkout <branch>` then `git pull --ff-only origin <branch>` (skip the pull if the
   branch has no upstream yet).
2. Merge main in: `git merge --no-edit main` — or, in TARGET mode,
   `git -C <path> merge --no-edit origin/main`, which needs no fast-forwarded local `main`
   and so leaves the user's checkout alone. Conflict markers then read `>>>>>>> origin/main`
   for the incoming side.
3. **If the merge succeeds cleanly** (exit 0, no conflicts) → go to step 6 (push).
4. **If there are conflicts** (`git merge` exits non-zero), resolve them **one file at a time**:
   - List conflicts: `git diff --name-only --diff-filter=U`.
   - For each conflicted file, `Read` it, understand **both** sides (`<<<<<<< HEAD` is the PR
     branch, `>>>>>>> main` — `origin/main` in TARGET mode — is incoming main), and edit to a
     correct combined result. In TARGET mode read and edit the copy **under `<path>`**, never
     the same file in the original checkout:
     - When the two sides touch **independent** things (e.g. different imports, unrelated
       list entries, separate functions), **keep both**.
     - When they edit the **same** logic, reconcile them so the intent of *both* changes
       survives — do not blindly pick one side. Re-derive the correct code from context.
     - For generated / lock files (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`,
       `*.snap`), prefer regenerating over hand-merging: take main's version, then re-run
       the generator (e.g. `npm install`) if the toolchain is available; otherwise flag it.
     - **Machine-generated index/listing files** (e.g. okq-generated `docs/**/index.md`)
       that conflict `AA`/`UU` on both sides are regeneration noise, not content: check
       the repo's `scripts/` for a dedicated resolver (e.g.
       `scripts/resolve-okq-index-conflicts.sh`) and use it; otherwise resolve each one
       wholesale to one side (`git checkout --theirs <file> && git add <file>`) and re-run
       the generator before committing — never hand-merge the markers.
     - Never commit a `package.json` resolution with a stale lockfile — regenerate the
       lockfile (e.g. `pnpm install --lockfile-only`) and stage it in the same merge commit.
   - Remove all conflict markers, then `git add <file>`.
   - A conflict you genuinely cannot resolve with confidence (ambiguous business logic,
     data loss either way): **do not guess**. `git merge --abort`, record the branch +
     file + why in a "needs human" list, and move to the next branch.
5. Once every conflict is staged: `git commit --no-edit` to complete the merge commit.
6. **Sanity check before pushing** (best effort): `my-command-tools verify --only check,typecheck`
   — or whatever subset of the repo's gates is fast. It reports a bounded log for each
   failure, and `missing` for any gate this repo doesn't have. Don't block on a
   pre-existing failure — only bail if *your* merge resolution introduced it. In TARGET mode
   name the checkout with the flag rather than changing directory —
   `my-command-tools verify --cwd <path> --only check,typecheck` — because `cd <path> && …`
   resolves against wherever this session actually is and grades the wrong checkout, or fails
   outright. A fresh worktree has no `node_modules`, so treat a gate that fails on missing
   dependencies or generated modules as un-bootstrapped environment, not as your conflict
   resolution — the sanity check is best effort, so record it as skipped rather than
   installing a whole toolchain to satisfy it.
7. Push: `git push origin HEAD`. If it's a brand-new branch upstream, `git push -u origin HEAD`.

## Finish

1. **HERE and ALL modes:** return to the starting branch: `git checkout $START_BRANCH`.
   **TARGET mode:** nothing to return to — `HEAD` never moved. Instead, tear the worktree
   down: `my-command-tools worktree end --branch <branch>`, run from outside `<path>`. The
   verb re-verifies that `HEAD` reached origin before removing, so a refusal means the merge
   commit is not pushed — push it rather than passing `--force`. Tear down on **every** exit
   path, including the unresolved-conflict one: after `git merge --abort` the worktree holds
   nothing this run authored, just a clean checkout of `<branch>`. If removal refuses there —
   `<branch>` carried unpushed commits before this run — that is the user's work, not yours
   to force away: leave the worktree in place and report its path.
2. Report a concise summary:
   - ✅ branches merged cleanly and pushed
   - 🟡 branches that had conflicts you resolved and pushed (name the files you touched)
   - 🔴 branches left for a human (fork PRs, diverged, or unresolved conflicts) + the reason
3. Never mark the task complete if any branch is in the 🔴 list without saying so explicitly.
4. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Rules

- To pre-check which branches conflict, test locally with
  `git merge-tree --write-tree main <branch>` (`origin/main` in TARGET mode, which never
  fast-forwards local `main`) — do **not** trust GitHub's
  `mergeable`/`mergeStateStatus`: it is computed lazily and reports `UNKNOWN` for
  recently pushed or freshly created PRs.

- **TARGET mode must not mutate the current checkout.** No `git checkout`, no local `main`
  fast-forward, no stashing. Running `git checkout <branch>` in TARGET mode means you have
  lost the worktree — go back and use `git -C <path>`.
- Never leave a TARGET worktree behind on a path that succeeded. The only worktree that
  survives the run is one `worktree end` explicitly refused to remove, and you must report
  that path.
- Never force-push. Never rewrite existing history — merges only.
- Never resolve a conflict by discarding a side's intent just to make it compile.
- Never stash, reset --hard, or delete the user's uncommitted work.
- One branch failing must not abort the others (ALL mode processes every branch).
- `$ARGUMENTS` holds the flags; treat anything after `-t`/`--target` as the branch name.
- <!-- include: shared/approval-own-call.md -->**A command that may need approval goes in its own Bash call** — `git fetch`, `git config`, and, as a narrow exception to the general rule to chain dependent mutations, branch-lifecycle operations such as checkout/switch, pull, remote-branch inspection, and local branch deletion. Folding one into an `&&` chain escalates approval to the whole compound command and costs a turn plus a retry. Put status output, pipes, and follow-up verification in separate read-only calls.<!-- /include -->
- <!-- include: shared/classifier-refusal.md -->A classifier refusal is not evidence that repository protections should be weakened. Inspect the refused command first; when the intended operation is safe and the refusal looks incidental to the command's shape — an over-broad chain, pipe, or extra flag — retry only the smallest exact command, never an allowlisted Bash pattern or a permission-settings change.<!-- /include -->

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**This step is never skipped and never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes, the closing turn does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/revive <thread id>` as the recovery path when the proxy thread id is available.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no marker to type: the `- done:` line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A subagent's report is never this turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close the run here, in a message of your own.
- **Resolve the anchor item as the last tool call.** The todo item that held this turn open is the one thing still owed once the work lands: mark it completed, let that call return, then send the message. It is the natural final call, and it keeps the closing message free of tool calls exactly as this step requires. Handing back with it still open makes a finished run read as abandoned.
- **Do not tack the report onto the tool call before it.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of a run and swallow the outcome.
<!-- /include-block -->
