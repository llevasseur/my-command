---
description: >
  Merge the latest main into open PR branches (or a single target/current branch),
  resolve every merge conflict one by one, and push to origin. Invoke on /my-command:mc.
  Default: merge main into every open PR branch based on main. --here / -h: only the
  current branch. --target / -t <branch>: only the named branch.
argument-hint: "[--here | -h] [--target | -t <branch>]"
allowed-tools: Bash(git:*), Bash(gh:*), Read, Edit, Write
---

# mc — Merge main & resolve conflicts

Use this skill when the user invokes `/my-command:mc` or asks for the same workflow: get branches
up to date with `main` and resolve every resulting merge conflict, then push.

**Announce at start** which mode you are running (all PRs / here / target `<branch>`).

## Argument parsing

Parse `$ARGUMENTS`:

- `--here` or `-h` → **HERE mode**: operate only on the currently checked-out branch.
- `--target <branch>` or `-t <branch>` → **TARGET mode**: operate only on `<branch>`.
- Neither → **ALL mode** (default): operate on every open PR that bases off `main`.

`--here` and `--target` are mutually exclusive — if both are given, stop and ask which one.

## Preconditions (do these once, up front)

1. Confirm you are inside a git repo: `git rev-parse --is-inside-work-tree`. If not, stop.
2. Record the starting branch so you can return to it at the end:
   `START_BRANCH=$(git rev-parse --abbrev-ref HEAD)`.
3. **Working tree must be clean.** Run `git status --porcelain`. If there is uncommitted
   work, first check for an in-progress merge before stopping: if `.git/MERGE_HEAD` exists,
   a prior merge was interrupted before completing or aborting. Read `.git/MERGE_MSG` to see
   what was being merged. If that pending merge is **exactly the operation this invocation
   would perform** (HERE mode with `main` merging into the current branch, or TARGET mode
   with `main` merging into `<branch>`), **finish it** — resolve the remaining conflicts per
   the per-branch loop below (steps 4–7) rather than aborting; aborting would discard partial
   resolution already staged. Only if the pending merge is unrelated, or there is dirty work
   with no `MERGE_HEAD`, stop and tell the user to commit or stash first — do **not** stash or
   abort on their behalf.
4. Identify the default branch name (usually `main`): `git remote show origin | sed -n 's/.*HEAD branch: //p'`.
   Call it `MAIN`. Everything below uses `main` as shorthand for it.
5. Update remotes and fast-forward local main:
   - `git fetch --all --prune`
   - `git checkout main && git pull --ff-only origin main`
   - If the fast-forward fails, stop and report — local `main` has diverged and needs a human.

## Building the branch list

- **HERE mode** → the single branch = `START_BRANCH` (must not be `main`; if it is, stop).
- **TARGET mode** → the single branch = the provided `<branch>`. Verify it exists
  (`git rev-parse --verify <branch>` or `origin/<branch>`); if only the remote has it,
  create a local tracking branch.
- **ALL mode** → list open PRs based on main:
  `gh pr list --state open --base main --json number,headRefName,headRepositoryOwner,isCrossRepository,title --limit 200`
  - **Skip cross-repo / fork PRs** (`isCrossRepository == true`) — you cannot push to a fork.
    Collect their branch names and report them as skipped at the end.
  - The branch list = the `headRefName` of each remaining PR.

## Per-branch merge loop

For **each** branch in the list, do the following. Keep going even if one branch needs a
human — collect it and move on; never leave a branch mid-merge.

1. `git checkout <branch>` then `git pull --ff-only origin <branch>` (skip the pull if the
   branch has no upstream yet).
2. Merge main in: `git merge --no-edit main`.
3. **If the merge succeeds cleanly** (exit 0, no conflicts) → go to step 6 (push).
4. **If there are conflicts** (`git merge` exits non-zero), resolve them **one file at a time**:
   - List conflicts: `git diff --name-only --diff-filter=U`.
   - For each conflicted file, `Read` it, understand **both** sides (`<<<<<<< HEAD` is the PR
     branch, `>>>>>>> main` is incoming main), and edit to a correct combined result:
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
6. **Sanity check before pushing** (best effort, only if fast and available): if the repo
   has an obvious typecheck/lint and it was passing before, run it. Don't block on a
   pre-existing failure — only bail if *your* merge resolution introduced it.
7. Push: `git push origin HEAD`. If it's a brand-new branch upstream, `git push -u origin HEAD`.

## Finish

1. Return to the starting branch: `git checkout $START_BRANCH`.
2. Report a concise summary:
   - ✅ branches merged cleanly and pushed
   - 🟡 branches that had conflicts you resolved and pushed (name the files you touched)
   - 🔴 branches left for a human (fork PRs, diverged, or unresolved conflicts) + the reason
3. Never mark the task complete if any branch is in the 🔴 list without saying so explicitly.

## Rules

- To pre-check which branches conflict, test locally with
  `git merge-tree --write-tree main <branch>` — do **not** trust GitHub's
  `mergeable`/`mergeStateStatus`: it is computed lazily and reports `UNKNOWN` for
  recently pushed or freshly created PRs.

- Never force-push. Never rewrite existing history — merges only.
- Never resolve a conflict by discarding a side's intent just to make it compile.
- Never stash, reset --hard, or delete the user's uncommitted work.
- One branch failing must not abort the others (ALL mode processes every branch).
- `$ARGUMENTS` holds the flags; treat anything after `-t`/`--target` as the branch name.
