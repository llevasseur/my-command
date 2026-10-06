### The entry's shape

**The repo's own convention decides the shape.** Look for it in this order and follow the first source that states one:

1. **Written guidance:** `CLAUDE.md`, `AGENTS.md`, or `CONTRIBUTING.md` on how entries are written.
2. **A changelog skill or command the repo ships** (`.claude/commands/`, `.claude/skills/`, `.agents/skills/`). Its instructions are the repo's shape.
3. **The newest entries in `CHANGELOG.md`.** Match their heading format, grouping, length, and voice.

**Only when the repo states none, use this shape:**

- **One bullet per user-visible change.** Not one per file, and not one per decision made along the way.
- **A short bold lead naming the change**, then a sentence or two on what a reader sees, gets, or can stop doing once it ships.
- **At most one "because" clause, and no nested lists.** A bullet that needs sub-bullets is carrying two changes: split it, or cut the one nobody sees.
- **Internal wiring stays out** unless it changes behavior someone sees.
