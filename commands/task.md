---
description: Take a task from criteria to PR — set up an isolated branch/worktree, implement, then /my-command:clean and /my-command:pr (inline, or in one subagent with --sub)
argument-hint: "[--here|-h] [--base <branch>] [--draft|-d] [--sub|-s] [--add|-a <command + prompt>[, <command + prompt>]] <task criteria>"
---

Take a task from a plain-language description all the way to an open PR — feature, bug fix, update, refactor, anything. The end goal is always a PR, and I always run `/my-command:clean` before `/my-command:pr`.

The task is the text in the `<command-args>` block above. Parse leading flags off the front; everything else is the **task criteria**.

**The git plumbing runs through `my-command-tools`.** Every verb prints JSON on stdout — read the fields rather than re-deriving them with your own `git` calls. If the CLI isn't on PATH, run `my-command-tools doctor` and report what it says instead of falling back to hand-rolled shell.

## Flags

- `--here` / `-h` — do NOT create a worktree. Work on the **current branch** as it is now.
- `--base <branch>` — branch off `<branch>` instead of `main`. Ignored when `--here` is set.
- `--draft` / `-d` — open the resulting PR as a draft. Passed straight through to `/my-command:pr` in step 3. Default is **not** draft. It does **not** keep the worktree around — step 3's teardown still removes it.
- `--sub` / `-s` — run Step 3's `/my-command:clean` + `/my-command:pr` stage in **one fresh subagent** instead of inline. Default is **inline**: this command spawns no subagents of its own unless you ask for one.
- `--add` / `-a` — register one or more commands available to the user for the agent to weave into this `/my-command:task` run, each paired with a prompt that guides its use. See Step 0 below.
- Anything not a recognized flag is part of the task criteria.

### Parsing `--add`

`--add` takes a **comma-separated list** of entries. Each entry names a user-available command followed by a plain-language prompt describing how it relates to this run. There is no separate timing flag; the agent running `/my-command:task` interprets the prompt and decides whether and when to invoke the command.

- The leading command token identifies the command to invoke; a leading `/` is optional. The rest of the entry is the prompt associated with that command.
- Entries are separated by a comma that precedes the next command. A comma inside an associated prompt (not followed by a command) stays part of that prompt.

## Step 0 — Incorporate added commands

Run this step only when `--add` / `-a` is present, before setting up the workspace or starting the task pipeline.

1. Use the command discovery available in the current session and on the user's device to resolve every command named in the `--add` list, including user, project, and plugin commands. Base the result on what is actually installed and available; do not infer availability from a command's name.
2. Skip any list entry whose command cannot be found. An unavailable added command does not block the task.
3. Load each available command's instructions into the current context without invoking it. Combine those instructions with the prompt associated with that list entry so the agent running `/my-command:task` can determine whether, when, and how the command belongs in this run.
4. Update the pipeline in context with the resulting command steps. Added commands interleave with the built-in steps and never replace them. Preserve list order when multiple added commands belong at the same point.
5. Report the updated pipeline, including where each available added command fits. Then continue with Step 1 and follow the updated pipeline through completion.

Honor any condition implied by an associated prompt at the relevant point. If it does not hold, skip that command and say why. If the prompt is too vague to determine safe usage, ask one focused question before invoking that command. If an available command is invoked and fails, stop and surface the failure rather than silently continuing.

## Step 1 — Set up the workspace

Decide where the work happens **before** touching any code. Base every workspace decision on **live** git state — `my-command-tools state` — never the session's startup snapshot, which can be stale. It reports `branch`, `defaultBranch`, `onDefaultBranch`, `worktree`, and the `base` it resolved.

If the repo being changed is not the repo this session started in, prefer starting a new session in the target repo. Otherwise, do not use `EnterWorktree`: run `my-command-tools worktree begin` in the target repo, do all work through absolute paths under its returned `path`, then tear down with `my-command-tools worktree end`, which re-verifies the branch reached origin before removing it. The `EnterWorktree` directions below apply only when the target and session-start repo are the same.

- **Default (no flags):** create a fresh worktree branched off the latest `main`.
  - Derive a branch name from the criteria: `<type>/<kebab-summary>`, where `<type>` is `feat` (new feature), `fix` (bug fix), `chore` (maintenance/refactor), or `docs` (docs only). Keep the summary short and specific (e.g. `fix/artifact-panel-scroll`).
  - `my-command-tools worktree begin --branch <name> --bootstrap`. It fetches first, so the branch lands on the freshest `origin/<default-branch>` rather than a stale local ref, and it reports the `path` it created and the `base` it used.
  - Switch into that `path` with the `EnterWorktree` tool. The verb prepares the checkout; moving this session into it is `EnterWorktree`'s job.
  - **This counts as an explicit worktree request.** ALWAYS create the worktree, even in a background/in-place session under `worktree.bgIsolation: "none"`. Do not work in place on the default path — that requires the explicit `--here` / `-h` flag.
- **`--base <branch>` given:** add `--base <branch>` to the same `worktree begin` call, then `EnterWorktree` by `path` as above.
- **`--here` / `-h` given:** stay on the current branch — no worktree.
  - Check `state` first. If `onDefaultBranch` is true, don't implement on `main` — create a feature branch in place (`git checkout -b <type>/<kebab-summary>`) and tell me you did.

## Step 1.5 — Bootstrap the worktree

**Skip this entirely for `--here`** (the current checkout is already bootstrapped). A fresh worktree has no `node_modules`, no `.env` files, and no generated code — without them `tsc`/`biome`/tests silently under-check or fail outright, so do this **before** implementing.

`--bootstrap` in Step 1 already ran the repo's own `scripts/bootstrap-worktree.sh` if it has one. Read the result off that same JSON:

- `bootstrapScript` is a path and `bootstrapped.ok` is true → the repo bootstrapped itself. Nothing more to do.
- `bootstrapped.ok` is false → the repo's own bootstrap failed. Report `bootstrapped.output` and fix that; don't paper over it with the generic fallback.
- `bootstrapScript` is `null` → the repo has no bootstrap of its own. Check for a "Worktree Setup" section in `AGENTS.md`/`CLAUDE.md` and follow it; if there's nothing there either, do the generic equivalent below. This command must not hardcode any one repo's paths.

The generic fallback:

- **Symlink the gitignored `.env` files** from the main checkout so env stays a single source of truth (never copy or edit — I manage the values). The main checkout is the repo root the worktree branched from; link each `.env` that exists there at the same relative path.
- **Install dependencies:** run the repo's install (`pnpm install` / `npm ci` / etc.) at the worktree root.
- **Generate lazily — only what the task touches.** Generated code (Prisma clients, GraphQL `__generated__` types, route trees) is derived from schema files in *this* worktree, so regenerate it here — **never symlink or copy it in** (a symlink reflects the wrong branch or corrupts the main checkout when written through; a copy goes stale and hides schema drift). Find the repo's generate commands in its `package.json` scripts. Docs-only tasks can skip generation.

Treat typecheck errors like "cannot find generated module" or a missing `*.gen.ts` as environment setup, not code bugs — bootstrap, then re-typecheck.

## Step 2 — Implement the task

- Restate the criteria in one line so we agree on scope, then implement it.
- **Batch independent reconnaissance.** Issue independent reads, greps, and read-only exploratory shell probes as separate tool calls in one turn (parallel when possible). Never chain them with `&&` or `;`, or stitch them together with `echo` separators. One no-match or approval must not taint the other probes or cause successful ones to be retried. Only when a miss is expected for an individual read-only probe — an optional `printenv`, `grep -c`, or search — end that probe with `|| true`; never suppress a corrective or state-changing command's failure. The shell is zsh, so quote any `*` or `?` that the invoked program, rather than the shell, should expand; an unmatched `.env*` otherwise aborts before the probe runs.
- **Read targeted context once.** Read each file immediately before `Edit`, and re-read it only if an edit, hook, formatter, generator, external process, or another agent may have changed it since. For pagination, pass numeric `offset` and `limit` values, never strings, and prefer a targeted slice over pulling a whole file back in.
- **Keep path context live.** Before a relative or path-dependent command, use the root/path from the latest `my-command-tools state` or `worktree begin` result and confirm the live cwd when needed. A missing `logs/`, `.env`, or worktree path after it existed is evidence of cwd/worktree drift: re-resolve the path once instead of retrying the same relative command.
- **Bound long-running processes.** Start a dev server or watcher with Bash's background mode and a log file; do not run it as a foreground command that can consume the tool's two-minute window. Wait through the harness's `Monitor` tool or another bounded wait, then inspect the startup log for the actual port or failure. Never busy-spin with `until …; do :; done`: recorded runs timed out with exit 143 and one tight loop was killed with exit 137.
- For "create/initialize X" criteria, inspect the target path first — X may already exist, and the real work is extending it rather than scaffolding greenfield.
- Once isolated in a worktree, the worktree directory is the only writable root — resolve every read/edit/commit path under it, never the original shared checkout.
- Follow the repo's own conventions (read `CLAUDE.md`/`AGENTS.md` and match surrounding code — style, naming, tests).
- For anything non-trivial or ambiguous, plan before coding; for a bug, reproduce before fixing. Use the relevant superpowers skills (brainstorming, systematic-debugging, TDD) rather than guessing.
- **If the criteria are already satisfied, change nothing.** Some criteria are conditional ("do X if it isn't already the case"). When inspection shows the repo already meets them, do not manufacture edits to justify the run — report what you inspected and what you found, and fall through to Step 3's no-change check.
- **Verify before claiming done** — `my-command-tools verify`. It discovers the repo's own gates and runs them fastest-failing first, returning no log for a gate that passed and a bounded tail for one that failed. Narrow it with `--only <script,...>` when only part of the repo was touched. Report which gates ran; `pass: false` means you are not done.
- **Commits are explicitly allowed here.** Invoking `/my-command:task` is your standing permission to commit **on this branch** (never on `main`) — commit the work in logical commits with clear messages without asking again.
  - `my-command-tools commit --message <text> <path> [<path>...]`, one call per logical commit. Use `--message -` to pipe a multi-line message on stdin.
  - Paths are always explicit, and the verb refuses `.`/`-A`-style whole-tree staging: only commit files **you** created or changed for this task. Pre-existing untracked files carried over from the original workspace are not yours to ship — the verb reports them under `remaining` so you can confirm they stayed put.
  - `1Password: failed to fill whole buffer` with `fatal: failed to write commit object` is an unapproved signing prompt, not a repository problem: the commit did not happen and the tree is untouched. Retry the same commit once after the prompt is approved. Never rewrite the commit, pass `--no-gpg-sign`, or change the repo's signing configuration to get around it.
- If the repo tracks a changelog (e.g. a `changelog` command or `CHANGELOG.md`), add an entry.

## Step 3 — Clean, then PR (inline by default; one fresh subagent with `--sub`)

**First, confirm this run actually produced changes — if it did not, skip this stage.** On an empty diff `/my-command:pr` would push a branch and open a PR with no content.

`my-command-tools state` settles this in one call. Pass `--base <ref>` when this run didn't branch off the default — the `--base <branch>` you used, or for `--here` the commit the branch was at when this run started. Then read:

- **`hasWork: false`** — nothing to ship. It already accounts for both halves: `commits` since the base, and `changes.tracked`. Untracked strays are reported separately under `changes.untracked` and deliberately don't count, since they're the carryover files Step 2 forbids committing.
- **`hasWork: true`** — carry on below.

On `false`, **run neither `/my-command:clean` nor `/my-command:pr`, and do not push.** Go straight to teardown (2), then tell me the criteria were already satisfied, what you checked to establish that, and that no PR was opened. Under `--here`, if the branch carries unpushed commits from *before* this run, leave them alone and say they are there — they are not this run's work to ship.

Otherwise run `/my-command:clean` then `/my-command:pr` in sequence on this branch. `--sub` changes **where** they run and nothing else — same commands, same order, same verification, same teardown:

- **Default (no `--sub`):** run both **inline in this session**, via the `Skill` tool, one after the other. No subagent is dispatched.
- **`--sub` / `-s`:** dispatch **one fresh subagent** via the `Agent` tool to run both. It shares this worktree but not this conversation — hand it the branch name and enough context to act alone. **One subagent for both**, never one each: the shared context is what lets `/my-command:pr`'s description pick up whatever `/my-command:clean` touched.

Either way it is one continuous stage: a Step 0 added command scheduled at this point runs in the same place the pair does — inline here by default, inside that same subagent under `--sub`.

1. **Clean, then PR.** Run **`/my-command:clean`** on this branch first, commit any edits it makes (`/my-command:clean` is branch-aware — committed + staged + unstaged — so it picks up step 2's commits; if nothing changes, there's nothing to commit), then, in the same run, run **`/my-command:pr`** — push and open (or update) the PR with a concise bulleted description, passing `--draft` when `--draft`/`-d` was given, plus any title/context I supplied. Teardown is not part of this stage; it is (2) below. Under `--sub`, tell the subagent that explicitly — **not** to tear down the worktree. `/my-command:pr` skips teardown on its own for a worktree its session didn't create, so this is a reminder, not the only safeguard.
2. **Teardown.** After `/my-command:pr` returns — from the subagent under `--sub`, or inline — or straight away on the no-change path above, remove a dedicated worktree. For a cross-repo run, work from outside its returned `path` and run `my-command-tools worktree end --branch <branch>`; it re-verifies that `HEAD` reached origin before removal. Otherwise remove it here with `ExitWorktree` (`action: "remove"`); the branch is either already pushed or carries no work, so this only discards the local copy. Use `ExitWorktree`, not `worktree end`, for the same-repo path: this session is *inside* the worktree, and only `ExitWorktree` moves the session back out. **Remove it even when the PR is a draft** — `--draft`/`-d` controls the PR's review state on GitHub, not the local workspace. Skip teardown only for `--here`.
   - **For same-repo teardown, expect the commit guard on the shipped path.** With commits on the branch, `action: "remove"` alone refuses (`Worktree has N commits on <branch>`). So once `/my-command:pr` has pushed, confirm the work is on origin — `my-command-tools state` reports `head`, and it must match `origin/<branch>` — then call `ExitWorktree` with `action: "remove"` **and** `discard_changes: true` on the first attempt. If HEAD is ahead of origin, push before tearing down instead of discarding. On the no-change path there are no commits and plain `action: "remove"` is correct.
   - **Worktree ownership.** Record how each task worktree was created and remove it through the same mechanism. A worktree created by `git worktree add` or a repository helper is not owned by a session worktree tool merely because the session later entered it.
   - Before removal, inspect `git worktree list --porcelain`, locked state, uncommitted changes, and unpushed commits. Run cleanup from outside the target worktree.
   - If a tool reports that the session does not own a worktree, do not retry that tool. Reconfirm the safety checks, then use the repository helper or `git worktree remove <exact-path>` that matches how the worktree was created.

## Notes

- Never implement or commit directly on `main`.
- If the criteria are too vague to act on, ask me one focused clarifying question before setting up the workspace — don't spin up a worktree for a guess.
- **Never wait by sleeping.** A foreground `sleep` is blocked by the harness, and so is polling with `sleep N && <check>`. Wait on a condition with the `Monitor` tool and an until-loop, or with the tool that blocks properly (`gh pr checks --watch`).
- **A command that may need approval goes in its own Bash call** — `git fetch`, `git config`, and, as a narrow exception to the general rule to chain dependent mutations, branch-lifecycle operations such as checkout/switch, pull, remote-branch inspection, and local branch deletion. Folding one into an `&&` chain escalates approval to the whole compound command and costs a turn plus a retry. Put status output, pipes, and follow-up verification in separate read-only calls.
- A classifier refusal is not evidence that repository protections should be weakened. Inspect the refused command first; when the intended operation is safe and the refusal looks incidental to the command's shape — an over-broad chain, pipe, or extra flag — retry only the smallest exact command, never an allowlisted Bash pattern or a permission-settings change.
- A refusal of a **PR merge or a remote-ref deletion is final.** Surface it to the human and carry on with the rest of the work. Re-expressing the same operation is refused for the same reason and costs a second turn: `gh api -X PUT .../pulls/N/merge` is `gh pr merge`, and `gh api --method DELETE .../git/refs/heads/...` is `git push origin --delete`, so neither is the narrow retry the bullet above permits — nor is re-running one under `GH_TOKEN=...`.
- `gh`'s GraphQL-backed writes (`gh pr create`, `gh pr edit`) resolve to an account that is not a collaborator on `llevasseur`-owned repos, while REST succeeds. A `must be a collaborator` GraphQL error means the wrong identity, not a permission to request: select the right account (`gh auth switch`, or `GH_TOKEN="$(gh auth token --user llevasseur)"`) or use the REST equivalent.
- **Record the outcome accurately.** Completion means the PR exists and any dedicated worktree is removed. A failed or interrupted run is not complete; say where it stopped and leave `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available.
- Report the branch name up front and the PR number/URL at the end — or, on a no-change run, that no PR was opened and why. The final report is a **text-only turn**: state it after the last tool call, never in the same turn as one. The proxy distills that standalone response to its exact `- done: <outcome>` syntax; ending on a tool call records no outcome and makes a finished run look interrupted.
