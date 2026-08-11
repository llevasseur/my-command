#!/usr/bin/env node
// concept-save — write one settled concept to the hosted store. `/teach`'s save step.
//
// Usage:
//   concept-save.mjs <term> <sentence> <field> <skills> [notes] [tips] [sources] [surfaced]
//
// The list arguments are newline-separated. An empty optional field is **omitted from the
// record entirely** rather than written as "" or [] — reads resolve the newest version, so
// a version carrying an empty value would erase a real one for every later reader.
//
// The store is append-only: re-teaching a term adds a version.
import { guard, request, resolve, say, unresolved } from './lib/store.mjs';

const [term, sentence, field, skills, notes, tips, sources, surfaced] = process.argv.slice(2);

guard('not saved', async () => {
  if (!term || !sentence || !field) return say('not saved: term, sentence and field are all required');

  const store = resolve('concepts');
  if (unresolved(store)) return say(`not saved: ${store.missing}`);

  const record = { term, sentence, field, skills: list(skills), savedAt: new Date().toISOString() };
  put(record, 'notes', notes);
  put(record, 'tips', list(tips));
  put(record, 'sources', list(sources));
  put(record, 'surfacedSkills', list(surfaced));

  const result = await request(store, '/api/concepts', { method: 'POST', body: record });
  if (!result.ok) return say(`not saved: ${result.reason}`);
  say(`saved: ${result.status} ${result.status === 200 ? '(already stored)' : '(new)'}`);
});

/** Split a newline-separated argument into trimmed, non-empty entries. @param {string} [raw] */
function list(raw) {
  return raw
    ? raw
        .split('\n')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

/**
 * Set a key only when it carries something. An absent optional field and an empty one are
 * the same fact, and only one of the two survives a later read intact.
 * @param {Record<string, any>} record @param {string} key @param {string | string[] | undefined} value
 */
function put(record, key, value) {
  const present = typeof value === 'string' ? value.trim() !== '' : Array.isArray(value) && value.length > 0;
  if (present) record[key] = value;
}
