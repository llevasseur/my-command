#!/usr/bin/env node
// ideas-claim — take one idea before any code is written. `/work`'s claim step.
//
// Usage: ideas-claim.mjs <slug> <holder> [pr-url]
//
// **A claim refused by a live holder is an answer, not a failure.** The ledger spans every
// device, so the holder may be a run on a machine this one has never talked to and there is
// nothing local to check the refusal against — the caller picks a different idea.
//
// Re-claiming as the same holder is idempotent, and that is how a run attaches its PR url
// later. A different holder is refused like anyone else's.
import { guard, request, resolve, say, unresolved } from './lib/store.mjs';

const [slug, by, pr] = process.argv.slice(2);

guard('not claimed', async () => {
  if (!slug || !by) return say('not claimed: a slug and a holder are both required');

  const store = resolve('ideas');
  if (unresolved(store)) return say(`not claimed: ${store.missing}`);

  const claim = { slug, by, ...(pr ? { pr } : {}) };
  const result = await request(store, '/api/ideas/claim', { method: 'POST', body: { claims: [claim] } });
  if (!result.ok) return say(`not claimed: ${result.reason}`);

  if (result.data?.claimed?.includes(slug)) return say(`claimed: ${slug} by ${by}${pr ? ` (${pr})` : ''}`);
  if (result.data?.unknown?.includes(slug)) return say(`not claimed: the ledger holds no idea ${JSON.stringify(slug)}`);

  const refusal = result.data?.refused?.find((/** @type {any} */ entry) => entry?.slug === slug);
  if (refusal) {
    const holder = refusal.heldBy ? ` by ${refusal.heldBy}` : '';
    const since = refusal.since ? ` since ${refusal.since}` : '';
    return say(`not claimed: ${slug} is ${refusal.status ?? 'held'}${holder}${since}`);
  }
  say(`not claimed: the ledger answered ${result.status} without deciding ${JSON.stringify(slug)}`);
});
