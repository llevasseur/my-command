---
description: >
  Merge each open PR branch's own base branch into it (not always main),
  resolve every merge conflict one by one, and push to origin. Invoke on /mc.
  Bases are fixed bottom-up: if a branch's base is itself behind its base, that
  is resolved first, recursively down to main. Default: process every open PR
  based on main or on another open PR branch. --here / -h: only the current
  branch (and its base chain). --target / -t <branch>: only the named branch
  (and its base chain).
argument-hint: "[--here | -h] [--target | -t <branch>]"
allowed-tools: Bash(git:*), Bash(gh:*), Read, Edit, Write
---

# mc — Merge each branch's base & resolve conflicts

Use this skill when the user invokes `/mc` or asks for the same workflow: bring each
branch up to date with **its own base branch** (the PR's base, which may be `main` or
another open PR branch) and resolve every resulting merge conflict, then push.

The base is the point of reconciliation. A stacked branch B based on branch A based on
`main` must have **A** merged into it — not `main` directly. And if A is itself behind
its base, A is fixed first. Conflicts are always resolved at the lowest branch in the
stack, then flow upward. This is recursive and terminates at `main`.

**Announce at start** which mode you are running (all PRs / here / target `<branch>`).

## Argument parsing

Parse `$ARGUMENTS`:

- `--here` or `-h` → **HERE mode**: operate only on the currently checked-out branch
  (its base chain is still fixed first).
- `--target <branch>` or `-t <branch>` → **TARGET mode**: operate only on `<branch>`
  (its base chain is still fixed first).
- Neither → **ALL mode** (default): operate on every open PR whose base is `main` or
  another open PR branch.

`--here` and `--target` are mutually exclusive — if both are given, stop and ask which one.

## Preconditions (do these once, up front)

1. Confirm you are inside a git repo: `git rev-parse --is-inside-work-tree`. If not, stop.
2. Record the starting branch so you can return to it at the end:
   `START_BRANCH=$(git rev-parse --abbrev-ref HEAD)`.
3. **Working tree must be clean.** Run `git status --porcelain`. If there is uncommitted
   work, first check for an in-progress merge before stopping: if `.git/MERGE_HEAD` exists,
   a prior merge was interrupted before completing or aborting. Read `.git/MERGE_MSG` to see
   what was being merged. If that pending merge is **exactly a base-branch merge this
   invocation would perform** (the current branch's base merging into the current branch),
   **finish it** — resolve the remaining conflicts per the per-branch merge steps below
   rather than aborting; aborting would discard partial resolution already staged. Only if
   the pending merge is unrelated, or there is dirty work with no `MERGE_HEAD`, stop and
   tell the user to commit or stash first — do **not** stash or abort on their behalf.
4. Identify the default branch name (usually `main`): `git remote show origin | sed -n 's/.*HEAD branch: //p'`.
   Call it `MAIN`. Everything below uses `main` as shorthand for it.
5. Update remotes and fast-forward local main:
   - `git fetch --all --prune`
   - `git checkout main && git pull --ff-only origin main`
   - If the fast-forward fails, stop and report — local `main` has diverged and needs a human.
   - After this, `main` is the fixed root of the recursion: it is never merged into by this
     workflow, only merged *from*.

## Building the branch list

- **HERE mode** → the single starting branch = `START_BRANCH` (must not be `main`; if it is, stop).
- **TARGET mode** → the single starting branch = the provided `<branch>`. Verify it exists
  (`git rev-parse --verify <branch>` or `origin/<branch>`); if only the remote has it,
  create a local tracking branch.
- **ALL mode** → list **all** open PRs (do **not** filter by base — stacked PRs base off
  other branches, not `main`):
  `gh pr list --state open --json number,headRefName,baseRefName,headRepositoryOwner,isCrossRepository,title --limit 200`
  - **Skip cross-repo / fork PRs** (`isCrossRepository == true`) — you cannot push to a fork.
    Collect their branch names and report them as skipped at the end.
  - The starting branch list = the `headRefName` of each remaining PR. Order does not matter:
    `fix()` recurses into each branch's base first and memoizes, so every branch's base is
    fixed before the branch regardless of list order.

## Resolving a branch's base

For any branch, compute the branch you must merge **into** it — call it `BASE`:

1. `BASE=$(gh pr view <branch> --json baseRefName -q .baseRefName 2>/dev/null)`.
2. If `BASE` is empty (the branch has no open PR) → `BASE = main`.
3. If `BASE == main` → `BASE = main`.
4. Otherwise the PR bases off another branch. Check whether **that** base branch has its own
   open PR: `gh pr view <BASE> --json state -q .state 2>/dev/null`.
   - If it returns `OPEN` → keep `BASE` as-is: it is a real stacked base to recurse into and
     merge from.
   - If it is anything else (closed, merged, or no PR) → **fall back**: `BASE = main`. Merge
     `main` directly rather than a stale base branch.

## `fix(branch)` — recursive base merge

Track two sets for the whole run:

- **DONE** — branches already fixed and pushed this run. Fix each branch at most once.
- **ON_STACK** — branches currently being fixed on the recursion path, for cycle detection.

`fix(branch)`:

1. If `branch` is `main`, or `branch` is in **DONE** → return (nothing to do; `main` is the
   fixed root, and a done branch is already up to date this run).
2. If `branch` is in **ON_STACK** → a base cycle exists (A bases on B bases on A). Do **not**
   merge; record `branch` in the "needs human" list with reason "base cycle" and return.
   Otherwise add `branch` to **ON_STACK**.
3. Resolve `BASE` for `branch` using **Resolving a branch's base** above.
4. **Fix the base first:** if `BASE != main`, call `fix(BASE)` and let it fully return before
   touching `branch`. This is the recursive step — the base is brought up to date (and pushed)
   before it is merged upward.
5. `git checkout <branch>` then `git pull --ff-only origin <branch>` (skip the pull if the
   branch has no upstream yet).
6. Merge the base in: `git merge --no-edit <BASE>`.
7. **If the merge succeeds cleanly** (exit 0, no conflicts) → go to step 9 (push).
8. **If there are conflicts** (`git merge` exits non-zero), resolve them **one file at a time**:
   - List conflicts: `git diff --name-only --diff-filter=U`.
   - For each conflicted file, `Read` it, understand **both** sides (`<<<<<<< HEAD` is
     `<branch>`, `>>>>>>> <BASE>` is the incoming base), and edit to a correct combined result:
     - When the two sides touch **independent** things (e.g. different imports, unrelated
       list entries, separate functions), **keep both**.
     - When they edit the **same** logic, reconcile them so the intent of *both* changes
       survives — do not blindly pick one side. Re-derive the correct code from context.
     - For generated / lock files (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`,
       `*.snap`), prefer regenerating over hand-merging: take the base's version, then re-run
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
     file + why in the "needs human" list, remove `branch` from **ON_STACK**, and return.
   - Once every conflict is staged: `git commit --no-edit` to complete the merge commit.
9. **Sanity check before pushing** (best effort, only if fast and available): if the repo
   has an obvious typecheck/lint and it was passing before, run it. Don't block on a
   pre-existing failure — only bail if *your* merge resolution introduced it.
10. Push: `git push origin HEAD`. If it's a brand-new branch upstream, `git push -u origin HEAD`.
11. Move `branch` from **ON_STACK** to **DONE**.

## Per-mode execution

Keep going even if one branch needs a human — collect it and move on; never leave a branch
mid-merge.

- **HERE / TARGET mode** → call `fix()` once on the single starting branch. The recursion
  pulls in and fixes its entire base chain automatically.
- **ALL mode** → call `fix()` on every branch in the starting list. Memoization (**DONE**)
  and recursion give correct bottom-up ordering — a branch's base is always fixed and pushed
  before the branch merges it.

## Finish

1. Return to the starting branch: `git checkout $START_BRANCH`.
2. Report a concise summary:
   - ✅ branches merged cleanly and pushed (note which base each got — `main` or a stacked base)
   - 🟡 branches that had conflicts you resolved and pushed (name the files you touched)
   - 🔴 branches left for a human (fork PRs, diverged, base cycles, or unresolved conflicts) + the reason
3. Never mark the task complete if any branch is in the 🔴 list without saying so explicitly.

## Rules

- To pre-check whether a branch conflicts with its base, test locally with
  `git merge-tree --write-tree <BASE> <branch>` — do **not** trust GitHub's
  `mergeable`/`mergeStateStatus`: it is computed lazily and reports `UNKNOWN` for
  recently pushed or freshly created PRs.

- The base merged into a branch is **its PR's base**, not always `main`. Only fall back to
  `main` when the branch has no open PR or its base branch has no open PR (see
  **Resolving a branch's base**).
- Recursion always terminates at `main` (the fixed root), fixes each branch at most once per
  run, and never merges into a branch caught in a base cycle — it reports it instead.
- Never force-push. Never rewrite existing history — merges only.
- Never resolve a conflict by discarding a side's intent just to make it compile.
- Never stash, reset --hard, or delete the user's uncommitted work.
- One branch failing must not abort the others (ALL mode processes every branch).
- `$ARGUMENTS` holds the flags; treat anything after `-t`/`--target` as the branch name.
