#!/usr/bin/env node
// ideas-mark — set one idea's status. `/work` marks an idea `shipped` against its own PR,
// and releases an unshipped claim back to `accepted` in its closing turn.
//
// Usage: ideas-mark.mjs <slug> <status> [note]
//
// Each shipped idea is marked against **its own** PR, never the run's last one — a mark
// carrying the wrong url records a claim about work that idea did not produce.
import { guard, request, resolve, say, unresolved } from './lib/store.mjs';

/** The statuses the ledger accepts. Rejected here so a typo costs no round trip. */
const STATUSES = ['proposed', 'accepted', 'claimed', 'rejected', 'shipped'];

const [slug, status, note] = process.argv.slice(2);

guard('not marked', async () => {
  if (!slug || !status) return say('not marked: a slug and a status are both required');
  if (!STATUSES.includes(status)) return say(`not marked: status must be one of ${STATUSES.join(', ')}`);
  // The ledger refuses a rejection with no reason, and the reason is the most valuable
  // row on it — so the refusal is stated here rather than spent as a 400.
  if (status === 'rejected' && !note?.trim()) return say('not marked: a rejected mark needs a note saying why');

  const store = resolve();
  if (unresolved(store)) return say(`not marked: ${store.missing}`);

  const mark = { slug, status, ...(note ? { note } : {}) };
  const result = await request(store, '/api/ideas/mark', { method: 'POST', body: { marks: [mark] } });
  if (!result.ok) return say(`not marked: ${result.reason}`);

  if (result.data?.updated?.includes(slug)) return say(`marked: ${slug} is ${status}`);
  if (result.data?.unknown?.includes(slug)) return say(`not marked: the ledger holds no idea ${JSON.stringify(slug)}`);
  say(`not marked: the ledger answered ${result.status} without updating ${JSON.stringify(slug)}`);
});
