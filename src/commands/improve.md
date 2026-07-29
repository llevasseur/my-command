---
description: Turn claude-proxy's session suggestions into an implemented improvement — read what the agent keeps doing the slow way, hand it to /task as criteria, and flag the suggestions that shipped as done
argument-hint: "[--range|-r <spec>] [--dry-run|-n] [--here|-h] [--base <branch>] [--draft|-d] [--add|-a <list>] [extra context]"
---

Improve the agentic workflow using evidence instead of intuition. claude-proxy reads every ten recorded sessions and reports what would have reached the same outcome in fewer steps — work issued serially that was independent by construction, the same error rediscovered session after session, a guardrail refusing a call the agent had already decided to make, a file read three times in one run. This command collects those findings, turns the pending ones into task criteria, runs `/task` on them in a subagent, and records which suggestions were actually applied so the next run doesn't re-propose them.

Your input is the text in the `<command-args>` block above. Parse leading flags off the front; anything left over is extra context that steers which pending suggestions to act on (it narrows the work, it never invents work the suggestions don't support).

**The suggestions are the criteria.** Every change this run proposes traces back to a suggestion with its own evidence and its own source sessions. Do not pad the task with improvements you thought of yourself.

## Flags

- `--range <spec>` / `-r <spec>` — which session buckets to read. One bucket (`9`), a list (`2,3,9`), a span (`2-9`), or a mix (`2-4,9`). **Default: every bucket.**
- `--dry-run` / `-n` — report the pending suggestions and the task criteria they compose into, then stop. No subagent, no branch, no PR, and nothing marked.
- Anything not listed above that `/task` recognizes is **passed straight through** to the `/task` invocation in Step 4 — currently `--here` / `-h`, `--base <branch>`, `--draft` / `-d`, and `--add` / `-a <list>`. Read `/task`'s own Flags section rather than duplicating its list here; this command does not interpret them itself.
- Anything not a recognized flag is extra context.

## Step 1 — Resolve the claude-proxy dependency

**This command cannot run without claude-proxy**, and its location is not hardcoded — it comes from the environment, exactly as [revive](revive.md) resolves the transcript store.

- **`CLAUDE_PROXY_STORE` (required)** — the directory the proxy writes session transcripts into. Read it from the environment (`printenv CLAUDE_PROXY_STORE`); never guess a path and never derive one from a repo checkout or clone location.
- Derive the two paths the suggestion tooling needs from it: the **log directory** is its parent (the store is `<logDir>/sessions`), and the **claude-proxy checkout** is the directory above that. Confirm the checkout by looking for its `server/package.json`.
- **If `CLAUDE_PROXY_STORE` is unset, or its path is missing, or the derived checkout has no `server/package.json`, stop.** Say which of the three failed, that `/improve` has no suggestions to read without it, and that it must be exported in the shell environment — e.g. in `~/.zshrc`:

  ```sh
  export CLAUDE_PROXY_STORE="$HOME/path/to/claude-proxy/logs/sessions"
  ```

  Do not search the filesystem for a claude-proxy checkout yourself, and do not fall back to a hardcoded path.

## Step 2 — Read the pending suggestions

Suggestions carry a status flag: `pending` by default, `done` once applied, `skipped` when deliberately passed over. **Read only the pending ones** — that is what keeps a later `/improve` over the same range from re-proposing work that already shipped.

Run the claude-proxy CLI from the checkout you derived, with `LOG_DIR` pinned to the derived log directory so it reads the same store `CLAUDE_PROXY_STORE` points at:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions list -s pending -d --json          # every bucket
LOG_DIR="<logDir>" pnpm --filter server suggestions list -r 2-9 -s pending -d --json   # with --range
```

- `-s pending` filters to unapplied suggestions, `-d` adds each one's detail, evidence and source sessions, and `--json` gives the shape to parse. **The CLI reads the log directory directly, so no proxy server needs to be running.**
- The equivalent over HTTP, if a server is already up, is `GET $CLAUDE_PROXY_API/api/sessions/suggestions/status?status=pending&detail=1&range=<spec>` (default `http://127.0.0.1:8788`). Prefer the CLI — it has no liveness precondition.
- Each row carries `bucket`, `label`, `id`, `severity`, `title`, and under `-d` its `detail`, `evidence` and `sources`. `meta.missing` lists buckets in the range that don't exist yet.
- If the range names buckets that don't exist, say which and continue with the ones that do. If **nothing** is pending in the range, stop and say so — that is a real answer, not a failure, and there is no task to run.

## Step 3 — Compose the task criteria

Turn the pending rows into criteria a `/task` run can implement without going back to the proxy.

1. **Group by what would change.** Several buckets often trip the same rule; that is one improvement with more evidence behind it, not several.
2. **Keep the evidence attached.** Each criterion states the behavior to change, the suggestion's own `detail`/`evidence` as the reason, and the `bucket/id` pairs it came from. The subagent has no access to this conversation, so anything unstated is lost.
3. **Say where the change lands.** These suggestions describe how an *agent* works, so the fix is nearly always in instructions — a command in `src/commands/`, an `AGENTS.md` rule, a repo convention — rather than application code. Name the target file when the evidence supports one and say it's undetermined when it doesn't.
4. **Honor the extra context** as a filter on the pending set: it can narrow which suggestions to act on, and it cannot add criteria the suggestions don't support.
5. **Drop what this repo cannot act on.** A suggestion whose fix belongs to another repo or to the proxy itself stays `pending` and is reported as out of scope — do not mark it `done` and do not invent a local edit for it.
6. Report the criteria and the `bucket/id` pairs behind each before going further.

**`--dry-run` / `-n` stops here**, having reported the pending suggestions and the criteria, and having marked nothing.

## Step 4 — Run the task in a subagent

Dispatch **one fresh subagent** via the `Agent` tool to run `/task` with the composed criteria and the pass-through flags exactly as given:

```
/task <pass-through flags> <composed criteria>
```

- One subagent for the whole run, not one per suggestion — the criteria were grouped in Step 3 so they land in a single coherent PR.
- A fresh context is the point: the subagent gets the criteria and the evidence, not this run's proxy reads. Give it everything it needs to act alone, including the source sessions each criterion rests on.
- `/task` owns the workspace, the verification, the commits and the PR from here. Do not create a worktree, edit files, or commit in this command — that is `/task`'s pipeline and duplicating it produces two workspaces for one change.
- When the subagent returns, record what it reports: the branch, the PR number/URL, and **which criteria it actually implemented** versus dropped. That distinction is what Step 5 writes down.

## Step 5 — Flag what shipped

Mark **only** the suggestions the run actually implemented, one call per bucket, with the PR as the note:

```sh
LOG_DIR="<logDir>" pnpm --filter server suggestions mark -r <bucket> -i <id>[,<id>...] -s done -n "<PR url>"
```

- A suggestion the subagent dropped, deferred, or couldn't act on stays `pending` — it should come back on the next `/improve`. Flagging it now is how real work gets lost.
- Use `-s skipped -n "<why>"` only for a suggestion deliberately passed over for a stated reason, so it stops resurfacing without pretending it was applied.
- If the subagent opened no PR, mark nothing.
- Report at the end: the range read, how many suggestions were pending, the criteria that shipped, the PR number/URL, what was marked `done` or `skipped`, and what stays `pending` with why. That report is a **text-only turn** — after the last `mark` call, never in the same turn as one, or this run joins the unfinished-task count the suggestions are measuring.

## Notes

- **Never invent an improvement.** If the pending set is thin, the run is small. Padding it with your own ideas breaks the trace from every change back to the sessions that justified it.
- **Marking is a claim about reality.** `done` means the change is in the PR the note points at. Mark after the subagent returns, never before it runs.
- **Never fall back to a guessed claude-proxy path.** An unset `CLAUDE_PROXY_STORE` is a stop with an explanation, not a search.
- The suggestions are recomputed from every transcript on each read, and buckets are fixed windows of ten numbered oldest-first — so a bucket number means the same sessions tomorrow, and the flags survive the recomputation.
- A suggestion that keeps tripping after being marked `done` is worth reporting: either the fix didn't take or the rule is measuring something the change didn't address.
