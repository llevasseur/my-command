### The concept store

**The store is a hosted service, and every call into it goes through one toolkit verb.** It is a Cloudflare Worker over D1, and it is the source of truth for every concept `/teach` has ever saved. `my-command-tools concepts` is the only thing that speaks to it — never hand-roll a `node -e` block or a `curl` against it. The verb is what `Bash(my-command-tools:*)` allowlists, so it runs without an approval round-trip, and an inlined snippet costs one on every run.

**Both halves of the address come from the environment, and the verb reads them itself.**

- **`CONCEPTS_URL`** — the base URL of the Worker. `IDEAS_URL` is read first and `CONCEPTS_URL` is the documented fallback, because ideas and concepts are one dataset behind one Worker.
- **`CONCEPTS_TOKEN`** — the shared bearer token, sent as an `Authorization: Bearer <token>` header. `IDEAS_TOKEN` is read first and `CONCEPTS_TOKEN` is the fallback, for the same reason.

**Never print the token, never write it into a file, and never put it on a command line or in a URL** — a token in a query string lands in the transcript, in shell history, and in the Worker's request log. `printenv CONCEPTS_URL` is safe to read; **never run `printenv CONCEPTS_TOKEN`**. The verb reads both variables from `process.env` inside its own process, so neither value ever reaches an argument, and a record being saved travels on **stdin** rather than as arguments for the same reason.

**Every subcommand prints exactly one status line on stdout and always exits `0`.** Read that line; it is the outcome, and nothing else in the run overrides it. `--json` returns the structured result instead, for a caller that wants the fields rather than the line.

**An unreachable store is a stated skip, never a stop.** Name the cause in one short line — which variable was unset, the status code and the short reason it returned, or the network error — and carry on. Never stop the run over it, and never ask the user to fix it mid-run. **Never work around it by touching a local file**: `logs/concepts.jsonl` is a backup of the store, not a second copy of it, so writing to it forks the corpus and reading it answers from a snapshot of unknown age.
