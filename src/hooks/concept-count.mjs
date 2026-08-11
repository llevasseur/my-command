#!/usr/bin/env node
// concept-count — count one skill install on the concept record it came from. `/learn`'s
// exit step.
//
// Usage: concept-count.mjs <term> <skill>
//
// The count is a **version of the concept record**, not a counter of its own: the newest
// stored version is read, the skill is appended to its `skills`, every other field is
// carried forward, and the whole record is written back. Carrying the rest forward inside
// the same call is what stops a version written here from erasing `notes`, `tips`,
// `sources` or `surfacedSkills` for every later reader.
//
// A repeat lease and a no-op install both still write a row, deliberately — the row counts
// an install rather than a distinct skill.
import { guard, request, resolve, say, unresolved } from './lib/store.mjs';

/** Never recorded as an applied skill: it is how a skill is found, not one that was used. */
const NEVER_COUNTED = 'find-skills';

/** Carried forward from the stored version rather than retyped by the caller. */
const CARRIED = ['notes', 'tips', 'sources', 'surfacedSkills'];

const [term, skill] = process.argv.slice(2);

guard('not counted', async () => {
  if (!term || !skill) return say('not counted: a term and a skill are both required');
  if (skill === NEVER_COUNTED) return say(`not counted: ${NEVER_COUNTED} is never recorded as an applied skill`);

  const store = resolve('concepts');
  if (unresolved(store)) return say(`not counted: ${store.missing}`);

  const read = await request(store, `/api/concepts/concept?term=${encodeURIComponent(term)}`);
  if (!read.ok) return say(`not counted: the store answered ${read.reason}`);

  const stored = read.data?.concept;
  if (!stored) return say(`not counted: the corpus holds no concept for ${JSON.stringify(term)}`);

  /** @type {Record<string, any>} */
  const record = {
    term: stored.term,
    sentence: stored.sentence,
    field: stored.field,
    skills: [...(stored.skills ?? []), skill].filter((entry) => entry !== NEVER_COUNTED),
    savedAt: new Date().toISOString(),
  };
  for (const key of CARRIED) {
    const value = stored[key];
    const present = typeof value === 'string' ? value.trim() !== '' : Array.isArray(value) && value.length > 0;
    if (present) record[key] = value;
  }

  const write = await request(store, '/api/concepts', { method: 'POST', body: record });
  if (!write.ok) return say(`not counted: ${write.reason}`);
  say(`counted: ${write.status} — ${skill} on ${record.term}`);
});
