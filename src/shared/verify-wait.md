**A verification run is waited on with one call, never polled.** `my-command-tools verify` runs the repo's own gates; a full sweep outlives the Bash tool's two-minute window, so start it detached and then **block on it**:

```bash
my-command-tools verify --background
```

That returns `wait.blocking` — a `my-command-tools verify --wait <verdict>` command — and `wait.blockingCall`, the same thing as a ready-to-send foreground `Bash` call carrying `timeout: 600000`. Send it. It blocks until the gates finish, prints that run's whole report, and exits on its verdict, so the wait is one call with the answer in its result. There is no watch to arm, no log to tail, and nothing to read afterwards.

**Do not read the report while the run is going.** The detached run writes its JSON report **atomically at exit**, before it writes the verdict file — so until the run is over that report does not exist and every early read returns the same nothing. Polling it cannot surface progress; it can only spend turns. Recorded runs read one report twenty times, another fifteen, each time announcing they would stop and then reading again on the very next turn, and two sessions ended still inside that loop with the work unreported. A `PreToolUse` gate refuses those reads and names this command in its refusal.

`wait.input` is still there for a run that must stay free while the gates go — a backgrounded call that notifies once and ends by itself. Take it only when you have other work to do in the meantime; otherwise `wait.blockingCall` is strictly fewer turns. Either way, **one wait per run**: a second watch over the same file is a duplicate, and arming one is what turned the recorded waits into collisions to reason about.
