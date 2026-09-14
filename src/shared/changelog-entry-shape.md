### The entry's shape

**"Concise" is a measurement here, not a mood.** These are the numbers that decide it.

- **One bullet per user-visible change.** Not one per file, and not one per decision made along the way.
- **A bold lead of 12 words or fewer, naming the change.** What a reader now sees, gets, or no longer has to do.
- **A body of 2 to 3 sentences, under 60 words.** `scripts/check-changelog.mjs` fails any bullet over 80 words.
- **At most one "because" clause.** A second reason is a design note, not a change.
- **No nested lists.** A bullet that needs sub-bullets is carrying two changes: split it, or cut the one nobody sees.
- **Internal wiring stays out** unless it changes behavior someone sees. Helper reuse, which call pipes into which, and where a function moved are the diff's business, not the entry's.
- **The why lives in `docs/features/<cmd>.md`.** Link it; do not restate it. An entry that explains a rationale is a design doc growing in the wrong file.
