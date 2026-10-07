# /teach reference — rolling the hosted concept store out to every device

Read this only when the user asks how to move a device onto the hosted concept store, or when
claude-proxy's `logs/concepts.jsonl` can be retired. A normal `/teach` run never needs it.

## Why the local file outlives the switch

`/teach` posts to the hosted store only and never writes `logs/concepts.jsonl` as well. There is
no dual-write, because two stores that each look complete is the failure the rollout order
avoids. claude-proxy retires that file **only after every device runs this version of `/teach`**
(ADR 0029).

## Rolling this out to every device

**Do this by hand on each machine. Nothing here is automated, and no command does it for you.**
claude-proxy cannot retire `logs/concepts.jsonl` until every machine you teach from has finished
both steps.

On each device, in order:

1. **Set both variables in the shell profile** (`~/.zshrc` or the equivalent), then open a new
   shell:

   ```sh
   export CONCEPTS_URL="https://<your-worker>.workers.dev"
   export CONCEPTS_TOKEN="<the token from the Worker's secret store>"
   ```

   Read the token out of the Worker's secret store or your password manager. Never commit it,
   and never paste it into a repo file, a note, or a prompt.

2. **Pull this version of the command** — run **`/sync`** in a session on that device, or
   `git pull` in the clone the commands are symlinked from. A device that has not pulled this
   version keeps writing to its own local file, and those concepts never reach the store.

Confirm a device is done by teaching one throwaway concept and checking that the reply says
`saved: 201`. When every device reports that, step 3 of the rollout is safe to start in
claude-proxy.
