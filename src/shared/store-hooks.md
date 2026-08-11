### Reach the hosted ideas ledger through the ideas hooks

**Every read, claim, and mark against the hosted ideas ledger goes through a hook in `~/.claude/my-command/hooks/`**, never through an inlined `node -e` block. The hooks are installed beside the workflow gates and **allowlisted by name**, so each call runs without an approval round-trip; an inlined block is not allowlisted and costs one. On a device with `CLAUDE_CONFIG_DIR` set, they sit under that directory's `my-command/hooks/` instead — `my-command-tools doctor` reports where. The hosted **concept** store is a separate address reached through `my-command-tools concepts`, not through these.

- `ideas-read.mjs [--available] [--repo <owner/name>] [--area <area>] [--status <a,b>]` — read the ledger.
- `ideas-add.mjs <path-to-json>` — record proposals from a JSON array in a file.
- `ideas-claim.mjs <slug> <holder> [pr-url]` — take an idea.
- `ideas-mark.mjs <slug> <status> [note]` — set an idea's status.

**Never pass a token to one of these, and never print one.** Each hook reads `IDEAS_URL`/`IDEAS_TOKEN` — falling back to `CONCEPTS_URL`/`CONCEPTS_TOKEN`, since ideas and concepts sit behind one Worker — from `process.env` inside its own process. A token on a command line reaches the transcript and the shell history; `printenv CONCEPTS_TOKEN` and `printenv IDEAS_TOKEN` are never run.

**Read the first line of the output, and only the first line, as the outcome.** Every hook prints at most one status line and always **exits 0**, so the exit status says nothing — `read:`, `added:`, `claimed:`, `marked:` are the successes, and a line beginning `not ` carries the cause after the colon: which variable was unset, the HTTP status with its short reason, or the network error. `ideas-read.mjs` and `ideas-add.mjs` print their JSON on the lines after that one, on success only.

**An unreachable ledger is a stated skip, never a stop** — except where the command says otherwise. The call is lost and nothing else: the run continues and says in one short line why, naming the cause the hook gave it. Each hook already retries once on a network error or a 5xx, replaying the identical request, so **never recover by re-running a whole command**.
