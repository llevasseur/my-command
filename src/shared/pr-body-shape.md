### The shape

**"Concise" is a measurement here, not a mood.** A PR body that lost to prose was written by an author who agreed with the word and then wrote nine headers and ten paragraphs anyway. These are the numbers that decide it.

- **Bullets only.** A line that is neither a `-` bullet nor a `##` header does not belong in the body. There is no lead-in sentence under a header, no closing summary, no connective prose between sections.
- **The first line is a header, never prose.** A body that opens with a sentence has already started explaining itself.
- **One idea per bullet, one to two sentences.** A bullet past about 40 words is a paragraph wearing a dash: split it into the two ideas it is carrying, or cut the half the reviewer will not act on.
- **Headers only past about 6 bullets, and 4 at most.** Sentence case, 2 to 4 words. A body with more headers than a reviewer can hold is an outline of the author's week, not a map of the diff.
- **Target under 400 words. Past 600 the body is being written for the author rather than the reviewer** — stop and cut, do not reorganize.

**The body is for the reviewer, and it is not a record of the author's work.** This is the failure mode that survives every restatement of "be concise", because each section that causes it feels earned at the time it is written. Requirement-by-requirement compliance notes, verification and gate output, docs inventories, and "what I checked" material each earn **one terse bullet or none**. Any section that exists to prove the task was done belongs in the run's closing turn, where the person who asked for the work is reading — not in the PR, where a reviewer is deciding whether the diff is right.

**The test for any line: would a reviewer who never saw the request act differently for having read it?** If not, it is not a shorter bullet — it is a deleted one.
