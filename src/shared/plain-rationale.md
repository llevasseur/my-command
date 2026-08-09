### Write the rationale as plain-language bullets

**An idea's rationale is a list of bullets, never a paragraph.** A person reads it on the dashboard to decide one thing: accept, or reject. That person is usually not the one who ran the survey, and usually has several cards open. A paragraph makes them read prose to find the claim they are deciding on. A fixed list makes two ideas comparable line for line.

Write literal markdown bullets, one `- ` per line, in this order. The first five are required. Write the sixth only when it applies:

1. **What it is** — the design, in one sentence. A mechanism, a shape, a decision.
2. **The problem** — what is wrong now, as a fact about the repo.
3. **How it works** — the mechanism that removes the problem.
4. **What it replaces or simplifies** — or, in those words, that it only adds surface.
5. **Size** — small, medium, or large. This is an order of magnitude, not an estimate.
6. **Depends on `<slug>`** — write this only when the idea consumes something a named idea introduces. Nothing infers this bullet. Its absence states that the idea declares no dependency, which is what `/improve` schedules on.

Each bullet follows [ASD-STE100](https://asd-ste100.org) Simplified Technical English:

- **One idea per sentence, and at most 20 words.** Split a longer sentence.
- **Active voice, present tense.** Write "the card renders the rationale", not "the rationale would be rendered".
- **One word for one concept.** Reuse the ledger's own noun each time. A synonym reads as a second thing.
- **No idiom, no metaphor, no irony.** Write what the thing does.
- **At most three nouns in a row.** Break a longer group with `of` or `for`.
- **Write an abbreviation out the first time**, or do not use it.
- **An article before each countable noun** — "the store", not "store".
- **No pronoun that points at another bullet.** Each bullet stands alone, because a reader scans the card out of order.

**These rules are stricter than `shared/rewrite-toward.md` on purpose.** That file draws on the same standard and declines its word list, its sentence cap, and its simple tenses, because it governs *command instructions*: an agent executes those, and a long sentence there buys precision. A rationale is a short pitch to a human who is about to click Accept or Reject, so the cap costs nothing and the plain words are the point.
