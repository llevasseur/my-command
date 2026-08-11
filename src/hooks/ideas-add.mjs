#!/usr/bin/env node
// ideas-add — record `/ideate`'s proposals on the hosted ledger.
//
// Usage: ideas-add.mjs <path-to-json>
//
// The file holds the JSON array of proposals. It is a **path rather than an inline
// argument** because a proposal carries multiline rationale bullets, and composing those on
// a command line is the heredoc shape this repo's gates refuse.
//
// **The dedupe check happens on the server**, against every device's ideas and every status
// including `rejected` — so near matches come back under `similar` and a non-empty list is
// a collision even when the exact slug was free. The caller looks at those before insisting
// on a slug; a free slug is not a clear field.
import { readFileSync } from 'node:fs';
import { guard, request, resolve, say, unresolved, why } from './lib/store.mjs';

const [path] = process.argv.slice(2);

guard('not added', async () => {
  if (!path) return say('not added: a path to the proposals JSON is required');

  let ideas;
  try {
    ideas = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return say(`not added: ${path} could not be read as JSON (${why(err)})`);
  }
  if (!Array.isArray(ideas) || ideas.length === 0) return say('not added: the file must hold a non-empty JSON array');

  const store = resolve('ideas');
  if (unresolved(store)) return say(`not added: ${store.missing}`);

  const result = await request(store, '/api/ideas', { method: 'POST', body: { ideas } });
  if (!result.ok) return say(`not added: ${result.reason}`);

  const added = result.data?.added ?? [];
  const refused = result.data?.refused ?? [];
  say(
    `added: ${added.length} of ${ideas.length}${refused.length ? `, ${refused.length} refused` : ''}`,
    JSON.stringify(result.data),
  );
});
