#!/usr/bin/env node
// ideas-read — read the hosted ideas ledger. The dedupe read `/ideate` runs before it
// composes anything, and the available set `/work` picks from.
//
// Usage: ideas-read.mjs [--available] [--repo <owner/name>] [--area <area>] [--status <a,b>]
//
// Prints the status line first and, on success only, the ledger's JSON after it. A caller
// reads line 1 to learn whether it has a ledger at all, because **an empty ledger and an
// unread one are indistinguishable from the rows alone** — and only the second of those
// means a following write may duplicate something already stored.
//
// **`--available` is answered by the Worker**, which knows which claims have gone stale.
// Re-deriving that here would be a second implementation of the ledger's own staleness
// rule, and the two would disagree the first time either changed.
import { guard, request, resolve, say, unresolved } from './lib/store.mjs';

const args = process.argv.slice(2);

guard('not read', async () => {
  const store = resolve('ideas');
  if (unresolved(store)) return say(`not read: ${store.missing}`);

  const query = new URLSearchParams();
  if (args.includes('--available')) query.set('available', 'true');
  for (const name of ['repo', 'area', 'status']) {
    const value = flagValue(name);
    if (value) query.set(name, value);
  }

  const result = await request(store, `/api/ideas${query.size ? `?${query}` : ''}`);
  if (!result.ok) return say(`not read: ${result.reason}`);

  const rows = Array.isArray(result.data) ? result.data : (result.data?.ideas ?? []);
  say(`read: ${result.status} (${rows.length} ${rows.length === 1 ? 'idea' : 'ideas'})`, JSON.stringify(result.data));
});

/** The value following `--<name>`, or undefined. @param {string} name @returns {string | undefined} */
function flagValue(name) {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
}
