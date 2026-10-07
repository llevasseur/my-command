### The shape

**The repo's own convention decides the shape.** Look for it in this order and follow the first source that states one:

1. **Written guidance:** `CLAUDE.md`, `AGENTS.md`, or `CONTRIBUTING.md` on how PR descriptions are written.
2. **A template, skill, or command the repo ships:** `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE/`, or a PR skill or command under `.claude/` or `.agents/`. Fill its sections; do not replace them.
3. **Recent PR bodies:** `gh pr list --state merged --limit 5 --json body`. Match their sections, headers, and length.

**Only when the repo states none, use this shape:**

- **Bullets only.** A line that is neither a `-` bullet nor a `##` header does not belong in the body. There is no lead-in sentence under a header, no closing summary, no connective prose between sections.
- **The first line is a header, never prose.** A body that opens with a sentence has already started explaining itself.
- **One idea per bullet, one to two sentences.** A bullet that reads as a paragraph is carrying two ideas: split it, or cut the half the reviewer will not act on.
- **Headers only when the bullets need grouping.** Sentence case, a few words each. A body with more headers than a reviewer can hold is an outline of the author's week, not a map of the diff.

**Size is measured for you.** `my-command-tools pr` counts the body it publishes and returns `bodyWarnings` when it runs long or carries no bullet. Read a warning as a cut to make, then update the PR.

**Whatever the shape, the body is for the reviewer, and it is not a record of the author's work.** Requirement-by-requirement compliance notes, verification and gate output, docs inventories, and "what I checked" material each earn **one terse bullet or none**. Any section that exists to prove the task was done belongs in the run's closing turn, where the person who asked for the work is reading — not in the PR, where a reviewer is deciding whether the diff is right.

**The test for any line: would a reviewer who never saw the request act differently for having read it?** If not, it is not a shorter bullet — it is a deleted one.
