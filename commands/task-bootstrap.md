---
description: Interview a repo's tech stack and its run contract, then generate that repo's own worktree bootstrap (scripts/bootstrap-worktree.sh and/or a "Worktree Setup" doc section) that /my-command:task's Step 1.5 discovers and /my-command:verify reads. One-time per repo; keeps /my-command:task device- and project-agnostic.
argument-hint: "[--here|-h] [--base <branch>] [--draft|-d] [notes about the stack]"
---

Set up a **repo-local worktree bootstrap** so a fresh `git worktree` behaves like the main checkout — and so the device-wide `/my-command:task` command never has to hardcode this repo's paths. `/my-command:task` Step 1.5 looks for exactly this: a `scripts/bootstrap-worktree.sh` (or a "Worktree Setup" section in `AGENTS.md`/`CLAUDE.md`).

Run it **once per repo** — or to update an existing bootstrap when the stack changes.

The `<command-args>` block above: parse leading flags off the front; anything else is free-text **notes about the stack** that seed the interview.

<!-- include: shared/closing-turn-anchor.md -->**Before the first tool call, anchor the way this run ends.** Put "close the run in a text-only turn" in the harness todo/task list as its own final item — worded on its own, never folded into the work it follows. The todo list is live session state that a compaction carries forward; this prompt is not, so once this run is summarized that item is the only surviving record that an outcome is still owed. **A run another command invoked inline with the `Skill` tool anchors its handback instead**, worded as "hand back to the invoking command in its next turn": a nested run that spends a text-only turn ends the whole assistant turn and strands every step its parent still owes, so the item it carries must not tell it to. A run the user invoked directly, and one dispatched as a subagent, both anchor the text-only close. **Resolve the item in the same tool-call turn as the run's last piece of real work** — the teardown, the final `verify`, the closing `gh` call — so the anchor is already marked completed when that turn returns and the only thing left for the run to do is speak. **Never leave marking it as a call of its own after the work ends.** A run whose last scheduled action is a bookkeeping tool call ends on that call: the mark lands, the message that was meant to follow it does not, and the run records no outcome — the exact failure this anchor exists to prevent, arriving through the anchor itself. Compose the closing message against a task list that is already clean, and if the anchor somehow survives the work, close it alongside whatever you are already calling rather than scheduling a turn for it — a still-open anchor is never a reason to end the run on a tool call.<!-- /include -->

<!-- include-block: shared/step-marker.md -->
### Mark each step as you enter it

**Open every step with its marker, on the first line of the message that enters it:** the word `STEP` in capitals, the number written in the `## Step …` heading you are entering, a slash, and how many `## Step …` headings this command declares — `STEP <n>/<N>`. The marker states the step outright, so the record of this run anchors it exactly instead of inferring it from the words around it.

- **Take `<n>` from the heading, not from a count of the steps you have finished.** `## Step 1.5 — …` writes `1.5` and keeps the fraction. A command whose headings start at `## Step 0 — …` writes `0` for its first step. `<N>` is the number of `## Step …` headings in this command, counting a `Step 0` and a `Step 1.5` like any other.
- **A command with no `## Step …` headings has no marker to write.** A single `## Steps` list declares nothing to anchor against, so open those runs in prose alone.
- **Write the marker on entry, once.** Continuing inside a step you already opened writes nothing. Re-entering a step after a correction writes it again, because that is an entry.
- **Keep naming the step in prose as well.** Every run recorded before this marker existed is read from that prose, and the prose is still the only reading for any message the marker is missing from. Dropping it to save a line costs the fallback and buys nothing.
<!-- /include-block -->

## Flags (where the work happens — mirrors /my-command:task)

- `--here` / `-h` — work on the current branch; no worktree.
- `--base <branch>` — branch the worktree off `<branch>` instead of `main`.
- `--draft` / `-d` — open the PR as a draft (passed to `/my-command:pr`).

## Step 1 — Set up the workspace

Same as `/my-command:task` Step 1, based on **live** git state from `my-command-tools state`:

- **Default:** `my-command-tools worktree begin --branch chore/worktree-bootstrap`, then `EnterWorktree` at the `path` it reports. <!-- include: shared/enter-worktree.md -->**The `path` `worktree begin` printed is this run's working root: resolve every read, edit, commit and `--cwd` under it as an absolute path, whether or not the session itself ever moves.** That is the documented mode rather than a recovery from something refused. **`EnterWorktree` only moves the session, and only a run you invoked directly, in the repo this session started in, has any reason to call it.** A run dispatched with the `Agent` tool starts with its cwd already *at* a repository root, where the tool refuses — "the current working directory … is the repository root" — so a dispatched run does not call it at all; ten recorded runs took that certain refusal and then worked by absolute path anyway, which is what they could have done first. Where it is called, the form is `EnterWorktree({path: "<absolute path>"})` with the path copied byte for byte from the `path` field — never `name`, which asks for a *new* worktree and is refused for a session that already made one another way, and never a relative or reassembled path, which is not in `git worktree list`. **Decide teardown with entry, because it is not `ExitWorktree({action: "remove"})`:** a worktree `my-command-tools worktree begin` created is not the session tool's to remove, so step out with `ExitWorktree({action: "keep"})` and then run `my-command-tools worktree end --branch <branch>` from outside the path.<!-- /include -->
- **`--base <branch>`:** the same call plus `--base <branch>`.
- **`--here`:** stay on the current branch; if `state` reports `onDefaultBranch`, create a feature branch first and say so.

Don't pass `--bootstrap` — the bootstrap you're creating doesn't exist yet, so this command's own worktree can't use it. That's expected; a fresh worktree here only needs git, which it has.

## Step 2 — Detect the stack (before asking anything)

Read the repo so you ask only about what you can't infer:

- **Package manager + install:** lockfile decides it — `pnpm-lock.yaml`→`pnpm install`, `package-lock.json`→`npm ci`, `yarn.lock`→`yarn install`, `bun.lockb`→`bun install`. Non-JS stacks: `Cargo.toml`, `go.mod`, `pyproject.toml`/`poetry.lock`, `Gemfile`, etc.
- **Monorepo layout:** `workspaces` in `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`.
- **Gitignored env files:** find `.env` / `.env.*`, then test each with `git check-ignore` — only the **gitignored** ones are symlink candidates (tracked env like `.env.example` stays put).
- **Derived/generated code + its generator:** `schema.prisma`→`prisma generate`; `codegen.ts`/`codegen.yml`→`graphql-codegen`; TanStack route trees; `*.proto`; etc. Map each generator to the `package.json` script that runs it **and the package dir it runs in**.
- **Repo conventions:** existing `scripts/` shebang style + `set -euo pipefail`; whether a `CHANGELOG.md` or changelog command exists; `shellcheck` availability.
- **Boot + routes:** a `dev`, `start`, or `preview` script in `package.json`; a health or readiness endpoint; the route directories a framework implies (`app/`, `pages/`, `routes/`, `src/routes/`).
- **Jira signal — and only signal.** Three things count: the **Atlassian MCP server connected** in this session, a **Jira URL in the README** (`*.atlassian.net/browse/…`, or a project or board link), and **issue keys in branch names** (`git branch -a` carrying `<PROJECT>-<number>`). None of the three present means this repo has no Jira, which is a complete answer — record it and ask nothing.

## Step 3 — Interview to confirm + fill gaps

Present what you detected and ask only for the unknowns and confirmations — one tight round, using AskUserQuestion for structured choices. If the notes in the arguments already answer something, don't re-ask.

- Confirm the **env files** to symlink.
- Confirm the **install** command.
- For each **generator**: confirm command + package dir; add any you missed.
- **Generation granularity:** lazy by target (recommended for monorepos) vs all-at-once; name the targets.
- **Extra setup:** native builds, `docker compose up`, DB migrate/seed, config-file copies, tool installs.
- **Output form:** committed `scripts/bootstrap-worktree.sh` (recommended) / a "Worktree Setup" doc section / both.

## Step 3.5 — Second round: the run contract

`/my-command:verify` and `/my-command:task` Step 2.6 boot this repo's app and check the change inside it. They need
four facts. Ask for them in one round; skip whatever Step 2 already settled.

- **Boot** — the command that starts the app. `pnpm dev`, `make serve`, whatever it is.
- **Health** — a URL that answers once the app is up, path included.
- **Login** — a seeded dev account, in the repo's own shape. Optional. Say plainly when asking:
  it is used only against a localhost URL the verification run itself booted, and never against
  any other host.
- **Routes** — a map of source glob to route. `src/settings/**` → `/settings`. Several entries
  is normal, and a diff matching none is what lets a verification round skip itself.

Nothing to boot — a library, a CLI, a docs repo — is a real answer. Record it, emit no contract,
and `/my-command:verify` skips. Never invent a boot command to fill the field.

**The browser driver is not a fifth fact, so never ask for one.** A verification run reads it
off `my-command-tools doctor` as a device fact and reaches its browser tier through a global
`playwright-cli` when the repo has no Playwright of its own — so the contract stays these four
facts, and the generated bootstrap never installs Playwright or downloads a browser to raise a
tier.

## Step 3.6 — Third round: the Jira contract

`/my-command:ticket` creates and moves this repo's Jira work items, and it hardcodes none of this repo's
values — it reads them from a contract this step writes.

**Ask only when Step 2 saw signal.** No connected Atlassian MCP server, no Jira URL in the README,
and no issue keys in branch names means the repo has no Jira: record that, emit no Jira contract,
and move on. `/my-command:ticket` handles a repo with no contract by skipping, so nothing downstream breaks.
**Never ask a repo whether it uses Jira when nothing in it says so.**

With signal, **query Jira for the facts rather than asking me to recite them.** The ids are what
this contract exists to pin, and an id typed from memory is the one field nobody notices is wrong
until a transition fires into the wrong status.

1. **Resolve the site and project.** `getAccessibleAtlassianResources` for the sites this account
   can reach; the project key from the signal Step 2 found, confirmed with
   `getVisibleJiraProjects`.
2. **Read the project's issue types** — `getJiraProjectIssueTypesMetadata` — and record each one's
   **name and id**.
3. **Read the transition ids from a real item.** `getTransitionsForJiraIssue` against one existing
   issue in the project returns the live transition ids and names. Ask which transition means
   *work has started* and which means *ready for review*, and record for each: the transition id,
   the transition name, **and the target status's id and name**. All four, because `/my-command:ticket`
   checks the declared name and id against the live workflow before it fires anything, and
   confirms the resulting status afterwards.
4. **Ask which transitions are forbidden**, and why. Closing an item, skipping QA, reopening —
   whatever this team does not let a tool do. Each entry carries its reason, because that reason
   is what `/my-command:ticket` reports when one is asked for.
5. **Ask the remaining four:** the board id, whether tickets go into a sprint (`null`, a specific
   sprint id, or `"active"` for whatever sprint is open), the default issue type, and the link
   type used for a blocking relationship.
6. Map each issue type to the template it usually wants — `story`, `bug`, `chore`, `spike`, or
   `technical`. It is a default: `/my-command:ticket` picks by whether the change is user-visible and may
   override it.

**Never write `cloudId` into the contract.** `/my-command:ticket` resolves it at run time from `site`, so a
site migration does not leave a pinned id pointing at the wrong tenant.

**This leg is additive and re-runnable.** A repo that already has `scripts/bootstrap-worktree.sh`
gains **only** the Jira contract: the existing flags, guards, symlinks, install, and codegen are
left exactly as they are, and a repo that already has a Jira contract has it updated in place
rather than re-scaffolded. Re-running this command to add Jira to a repo that was bootstrapped
before this leg existed is the normal path, not a special case.

## Step 4 — Recommendations (rules the generated bootstrap MUST follow)

Design the bootstrap around these, and explain each as you apply it:

- **Auto-detect the main checkout** via `git rev-parse --git-common-dir` → its parent dir. Never hardcode absolute paths. This is what makes the script portable *and* independent of which branch the worktree sits on.
- **Branch/base-agnostic.** `/my-command:task` and its callers create worktrees off `main`, off a `--base <branch>`, or check out an existing `--target <branch>` — so the bootstrap must never assume `main` or any branch. Operate only on (a) the worktree's own working tree and (b) the main checkout as the env source of truth. Regenerate derived code from the **worktree's own** schema so a non-`main` base with a different schema is handled correctly — never symlink or copy generated artifacts in (they'd reflect the wrong branch and hide drift).
- **Symlink gitignored env** from the main checkout (single source of truth) — never copy or edit; skip any missing; never overwrite an existing file.
- **Install** with the repo's package manager at the worktree root.
- **Regenerate lazily** by target; docs-only work can skip generation.
- **Refuse to run from the main checkout** (guard: detected main == worktree root → exit non-zero).
- **Commit it, don't gitignore it.** Only *tracked* files land in fresh worktrees (where `/my-command:task` looks for it), and teammates who share the `/my-command:task` command should get the bootstrap too. Keeping it free of machine-specific paths (via auto-detection) is what makes committing safe.
- **Print the run contract behind `--print-verify-contract`.** It prints `{boot, health, login, routes}` as JSON on stdout, exits 0, and does nothing else — no install, no symlink, no codegen. Handle it **first**, ahead of the main-checkout guard: a caller asking what the contract is has no worktree yet, and the guard would refuse it.
- **Print the Jira contract behind `--print-jira-contract`**, on the same terms: JSON on stdout, exit 0, nothing else, handled first alongside `--print-verify-contract` and ahead of the main-checkout guard, since `/my-command:ticket` asks for it from wherever it is standing. It prints `{site, projectKey, board, sprint, defaultIssueType, issueTypes, lifecycle, never, linkType}` and **never a `cloudId`**. Emit the flag only where Step 3.6 found signal; a repo with no Jira omits it and `/my-command:ticket` skips.
- **Omitting the contract is allowed.** A bootstrap without the flag makes `/my-command:verify` fall through to detection — the `dev`/`start`/`preview` script, and the real bound port read out of the startup log. Emit the flag when the answers are worth pinning; leave it out for a repo with no app.
- Match repo conventions: shebang + `set -euo pipefail`, `chmod +x`.

## Step 5 — Write the bootstrap

- Write `scripts/bootstrap-worktree.sh` (and/or the doc section) per the answers, following every rule in Step 4; `chmod +x` the script.
- If emitting a doc section, add a short **Worktree Setup** heading to `AGENTS.md`/`CLAUDE.md` (whichever the repo uses) that points at the script or lists the steps.
- Skeleton to adapt (JS/monorepo shown — swap in the detected stack):

```bash
#!/usr/bin/env bash
set -euo pipefail
# The run contract, first: /my-command:verify asks for it from anywhere, worktree or not.
if [ "${1:-}" = "--print-verify-contract" ]; then
  cat <<'JSON'
{
  "boot": "pnpm dev",
  "health": "http://localhost:3000/api/health",
  "login": {"email": "dev@example.com", "password": "dev-only"},
  "routes": {"src/settings/**": "/settings", "src/api/**": "/api/health"}
}
JSON
  exit 0
fi
# The Jira contract, on the same terms. Emit this branch only where Step 3.6 found signal.
if [ "${1:-}" = "--print-jira-contract" ]; then
  cat <<'JSON'
{
  "site": "example.atlassian.net",
  "projectKey": "ENG",
  "board": 12,
  "sprint": "active",
  "defaultIssueType": "Task",
  "issueTypes": {"Task": {"id": "10002", "template": "technical"}},
  "lifecycle": {
    "start":  {"transitionId": "21", "transitionName": "Start work", "statusId": "3", "statusName": "In Progress"},
    "review": {"transitionId": "31", "transitionName": "Ready for review", "statusId": "10004", "statusName": "In Review"}
  },
  "never": [{"transitionId": "41", "transitionName": "Done", "reason": "only QA closes an item"}],
  "linkType": "Blocks"
}
JSON
  exit 0
fi
WORKTREE_ROOT="$(git rev-parse --show-toplevel)"
# --git-common-dir points at the MAIN checkout's .git even from a linked worktree
GIT_COMMON_DIR="$(cd "$WORKTREE_ROOT" && cd "$(git rev-parse --git-common-dir)" && pwd)"
MAIN_CHECKOUT="$(dirname "$GIT_COMMON_DIR")"
cd "$WORKTREE_ROOT"
[ "$MAIN_CHECKOUT" = "$WORKTREE_ROOT" ] && { echo "run from a linked worktree, not the main checkout" >&2; exit 1; }
# symlink gitignored env from "$MAIN_CHECKOUT" (skip missing, never overwrite) …
# install deps at the worktree root …
# regenerate derived code lazily by target arg (default all) …
```

## Step 6 — Verify

- `bash -n scripts/bootstrap-worktree.sh`; run `shellcheck` if it's available.
- If the script emits a contract, prove it parses: `bash scripts/bootstrap-worktree.sh --print-verify-contract | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"`. Run it from the main checkout too — the flag must answer before the guard, not be refused by it. Prove `--print-jira-contract` the same way where Step 3.6 emitted one, and confirm its JSON carries no `cloudId`.
- **Dry-run the logic without a slow real install:** shim the package manager onto `PATH` (a stub that just echoes its args), run the script, and confirm — env symlinks point at the main checkout, missing files are skipped, a re-run keeps existing files, target selection works, and it refuses to run from the main checkout.
- Optionally offer a real run to confirm install + codegen actually succeed.

## Step 7 — Changelog, then /my-command:clean and /my-command:pr

- If the repo tracks a changelog, add an entry.
- Commit only the files you created: `my-command-tools commit --message <text> <path> [<path>...]`, or `--message-file <absolute path>` for a multi-line message written out with `Write` — never a heredoc on stdin, which a `PreToolUse` gate refuses. Staging is always explicit — the verb refuses whole-tree staging — so nothing you didn't author comes along. Invoking this command is standing permission to commit on this branch (never on `main`).
  - <!-- include: shared/signing-retry.md -->`1Password: failed to fill whole buffer` with `fatal: failed to write commit object` is an unapproved signing prompt, not a repository problem: the commit did not happen and the tree is untouched. Retry the same commit once after the prompt is approved. Never rewrite the commit, pass `--no-gpg-sign`, or change the repo's signing configuration to get around it.<!-- /include -->
- Run **`/my-command:clean`**, commit any edits it makes (it deliberately leaves them uncommitted for the invoker — that's you — and `/my-command:pr` never commits), then **`/my-command:pr`** (`/my-command:pr --draft` if `--draft`/`-d`).
- **Tear the worktree down yourself** if Step 1 created one; `/my-command:pr` skips teardown for a worktree its session didn't create. <!-- include: shared/worktree-ownership.md -->**Remove a worktree through the same mechanism that created it.** One created by `git worktree add` or `my-command-tools worktree begin` is not owned by the session worktree tool merely because the session later entered it via `EnterWorktree({path})` — `ExitWorktree` refuses to remove it. Step back out with `action: "keep"`, then run `my-command-tools worktree end --branch <branch>` from outside the worktree; it re-verifies the branch reached origin before removing, so push rather than forcing if it refuses. If it refuses because another live session still holds the worktree, stop and report the path as left in place — never force past a live lock. **Whatever removes the worktree, stop the processes rooted in it first.** `worktree end` now does this itself, but `ExitWorktree` does not: a dev server or watcher started inside a worktree outlives the directory, and where the repo symlinks shared state (a log directory, a database) into each worktree, the survivor keeps writing to that shared state through a path that no longer resolves — one whose reads now fail can reconcile the shared store down to empty and make the main checkout look like it has no data. Run `my-command-tools worktree reap --path <worktree path>` immediately before `ExitWorktree({action: "remove"})`, and pass `--no-reap` to `end` only when a survivor is deliberate.<!-- /include --> Here that branch is `chore/worktree-bootstrap`.

## Notes

- One-time per repo. If a bootstrap already exists, **update** it rather than scaffolding a new one — inspect it first.
- Keep this command device- and project-agnostic: everything project-specific comes from detection + the interview, never hardcoded here.
- Report the branch up front and the PR number/URL at the end. <!-- include: shared/text-only-turn.md -->Deliver that report in this run's **closing turn** — the terminal step below — rather than alongside the tool call that precedes it.<!-- /include -->

## Close the run in a text-only turn

<!-- include-block: shared/closing-turn.md -->
**Every run states its outcome on the way out, and *how* it states it depends on how this run was invoked.** One mechanic decides all three cases: in Claude Code an assistant message carrying text and **zero tool calls** ends the assistant's turn and hands control back to the user. That is what records a run's outcome — and it is also what strands a parent pipeline when a nested run spends one, because the parent's remaining steps never get a turn to run in.

**Tell which of the three cases this run is in before composing anything, from how it was invoked:**

- **Outermost** — the user invoked this command directly, as the prompt this turn is answering. No other command run encloses it. It **closes in a text-only turn**.
- **Nested inline** — another command invoked this one with the `Skill` tool in this same session, as a step of its own pipeline, and that parent still has steps owed once this one returns. It **hands back without spending a text-only turn**.
- **Subagent** — this run was dispatched with the `Agent` tool (`--sub`, a delegated unit, any Agent-tool dispatch). It has its own conversation, and its final message is a report *to* the parent session rather than a turn *in* the parent's conversation, so nothing of the parent's is waiting behind it. It **closes in a text-only turn**, exactly like an outermost run.

**Outermost and subagent: close in a text-only turn. Never skipped, never delegated.** The run is over when this session sends **one message carrying text and zero tool calls** — not when the work lands. That is the mechanic, not a style preference: a run's outcome is recorded only from a message with no tool call in it, so a message carrying the report *and* a tool call is recorded as a decision mid-run, and a run whose last message is a tool call records no outcome at all. Make the last tool call, let it return, then reply with text alone.

**Nested inline: hand back without spending a text-only turn.** Emit the report and the return marker as **text in the same assistant message that carries the parent's next tool call**, so the turn continues into the parent's next step instead of ending and returning control to the user. A nested run that closes in a text-only turn strands every step its parent still owes — the recorded failure is a `/my-command:clean` and a `/my-command:pr` nested in one pipeline, where each child's text-only close handed control back before the parent could invoke the next child, run its teardown, or record its own outcome, leaving a live run reading as abandoned. So do not compose a message of text alone here, and do not stop to let the parent speak: say what this run did, write the marker, and make the parent's next call in that same message. The parent's own closing turn is the one that records the outcome for both.

- **Every exit routes here, not just the shipped one.** Finished; nothing to do; a gate still failing; a step blocked, refused, or awaiting my answer; the request abandoned as wrong. The wording changes; which of the three cases applies does not. A run that stopped early says where it stopped and what is on the branch, and leaves `/my-command:revive <thread id>` as the recovery path when the proxy thread id is available. A nested run that stopped early still hands back in the parent's turn — it reports the stop as text beside the parent's next call, and the parent decides whether to carry on.
- **Say it in one self-contained line first**, then any detail. Someone who never saw the request should be able to read that line alone.
- **End the message with this run's return marker, alone on the last line, in all three cases:** the word `RETURN` in capitals, a space, then the name this run was invoked under, leading slash and all — `RETURN /<command>`, carrying whatever namespace prefix that invocation carried. Written **exactly once**, on the last line of the message that hands control back, whether that message is a text-only close or a nested handback riding the parent's next tool call. The marker is the only record of where a run handed control back, so it is never weakened, deferred to a later message, or dropped because the turn continues: without it a nested run's span runs on to the next nested invocation, or to the end of the transcript for the last one, and that run is charged with everything its host did after it returned. **A run that ends abnormally never reaches this step and writes no marker**, so its span still runs to the end of the transcript: the marker makes the normal exit exact and leaves the abnormal one exactly as it already was.
- **A compaction boundary is a checkpoint, not an ending.** A recap prompt ("The user stepped away and is coming back…"), a `[SYSTEM NOTIFICATION - NOT USER INPUT]` event, or a session-continuation preamble each mean the run is still owed its turn: answer that prompt in text alone, say where the run actually stands, and restore the anchor todo item if it did not survive. A session is likeliest to die just after a compaction, so that answer is often the only outcome the run ever records. **Each side of the boundary records its own standing**, because a run split across two transcripts is two runs to the record: one that carried a PR across a boundary and closed on neither side reads as two abandoned runs, not one shipped one.
- **Every prompt from me opens a task, and only a text-only reply closes it.** The transcript starts a new `## Task:` at each of my messages — a mid-run question, a correction, a recap prompt, a change of direction — and writes `- done:` only when a reply carries text and no tool call. So answer my message in text alone *before* returning to tool calls. That is true even inside a nested run: my message is addressed to the session, not to whichever command currently holds it. A run that reads the message and keeps working straight through leaves that task, and every task before it, with no outcome line. There is no `- done:` marker to type: that line is written for you from any text-only turn, and skipped entirely from a turn that carries a tool call.
- **A reply to another session is not this turn either.** `SendMessage` is a tool call, so a run whose whole job was answering another agent records no outcome when that reply is the last thing it sends. Send the reply, let it return, then close in text alone — even when the closing message says much what the reply already said.
- **A subagent's report is never the dispatching run's turn.** The outcome belongs to the session the run started in, so after an `Agent` call returns, close that run in a message of your own.
- **Resolve the anchor before the message is composed, never as a call after it.** Mark the anchor todo item completed in the same tool-call turn as the run's last piece of real work, so nothing is left scheduled when that turn returns and the run's next action is the message itself. Marking it as a standalone final call is the recorded way this step fails: the mark lands every time, the message does not, and the run records no outcome. Handing back with it still open reads as abandoned, so close it — alongside a call you were already making, never as a turn of its own.
- **Do not tack the report onto the tool call before it — in the two closing cases.** `ExitWorktree`, `worktree end`, `verify`, and a closing `gh` call are exactly the calls that sit at the end of an outermost or subagent run and swallow the outcome. The nested handback is the deliberate exception and the only one: there the report rides the parent's **next** call, which is what keeps the parent's turn alive.
<!-- /include-block -->
