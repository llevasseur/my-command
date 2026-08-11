// The hosted stores, reached the same way from every hook that touches them.
//
// Two datasets sit behind one Cloudflare Worker and one token: the append-only concept
// store and the append-only ideas ledger. Every call they receive from this repo goes
// through here, so the address resolution, the retry, and the shape of the one line a
// hook prints are decided once rather than per command.
//
// **Credentials come from `process.env` and go nowhere else.** They are read per call
// rather than captured at import, they are never accepted as an argument or a flag, and
// no value here is ever printed, written to a file, or put in a status line. A URL is
// never printed either — a configured address can carry one in its query string.

/** How long a hook waits on the store before giving up on an attempt. */
const TIMEOUT_MS = 15000;

/** @typedef {{ origin: string, token: string }} Store */
/** @typedef {{ missing: string }} Unresolved */

/**
 * The address of a hosted store, or the name of the variable that is missing.
 *
 * `CONCEPTS_URL`/`CONCEPTS_TOKEN` are the documented fallback for the ideas pair, because
 * ideas and concepts are one dataset behind one Worker — a device configured for concepts
 * is already configured for ideas. `IDEAS_*` wins where both are set, so the two can be
 * split later without a migration.
 *
 * @param {'concepts' | 'ideas'} dataset
 * @returns {Store | Unresolved}
 */
export function resolve(dataset) {
  const ideas = dataset === 'ideas';
  const origin = (ideas ? (process.env.IDEAS_URL ?? process.env.CONCEPTS_URL) : process.env.CONCEPTS_URL)?.trim();
  const token = (ideas ? (process.env.IDEAS_TOKEN ?? process.env.CONCEPTS_TOKEN) : process.env.CONCEPTS_TOKEN)?.trim();
  const suffix = ideas ? ' (CONCEPTS_URL and CONCEPTS_TOKEN are accepted as fallbacks)' : '';
  if (!origin) return { missing: `${ideas ? 'IDEAS_URL' : 'CONCEPTS_URL'} is not set${suffix}` };
  if (!token) return { missing: `${ideas ? 'IDEAS_TOKEN' : 'CONCEPTS_TOKEN'} is not set${suffix}` };
  return { origin: origin.replace(/\/+$/, ''), token };
}

/**
 * True when this resolution failed. Declared as a type guard so a caller that returns on
 * it is holding a resolved store on the line after, without asserting anything by hand.
 * @param {Store | Unresolved} r @returns {r is Unresolved}
 */
export function unresolved(r) {
  return typeof (/** @type {any} */ (r)?.missing) === 'string';
}

/**
 * Why a request failed, in the few words a status line has room for. A `cause` carries
 * the half of a fetch failure that names the actual problem (DNS, refused, timed out).
 * @param {any} err @returns {string}
 */
export function why(err) {
  const message = err?.message ?? String(err);
  const cause = err?.cause?.message;
  return cause ? `${message} (${cause})` : message;
}

/**
 * One call to a hosted store, retried **once** on a network error or a 5xx.
 *
 * The retry replays the identical request rather than recomposing it. That matters for
 * the concept store, which is append-only and derives a row id from the record: a caller
 * that recovered by re-running would stamp a fresh `savedAt`, change the id, and write a
 * second version instead of replaying the first.
 *
 * Never throws — every outcome is a value, because a hook's whole contract is one line
 * and exit 0.
 *
 * @param {Store} store
 * @param {string} path Path and query, beginning with a slash.
 * @param {{ method?: string, body?: unknown }} [init]
 * @returns {Promise<{ ok: true, status: number, data: any } | { ok: false, reason: string }>}
 */
export async function request(store, path, init = {}) {
  const method = init.method ?? 'GET';
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(`${store.origin}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${store.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        if (response.status >= 500 && attempt === 1) continue;
        const detail = await response.text().catch(() => '');
        const short = detail.trim().replace(/\s+/g, ' ').slice(0, 200);
        return { ok: false, reason: `${response.status}${short ? ` ${short}` : ''}` };
      }
      const text = await response.text();
      /** @type {any} */
      let data = null;
      try {
        data = text.trim() ? JSON.parse(text) : null;
      } catch {
        // A 2xx that is not JSON is still a success; the caller reads the status.
      }
      return { ok: true, status: response.status, data };
    } catch (err) {
      if (attempt === 1) continue;
      return { ok: false, reason: why(err) };
    }
  }
  // Unreachable: both attempts either return or fall into the catch.
  return { ok: false, reason: 'no attempt completed' };
}

/**
 * Say the one thing this hook has to say, and exit 0.
 *
 * **Every hook here exits 0, always.** An unreachable store costs the call and nothing
 * else — the run that invoked the hook continues and reports the cause in one line — so a
 * non-zero exit would turn a stated skip into a stop.
 *
 * @param {string} line The single status line.
 * @param {string} [payload] Data to print after it, on success only.
 */
export function say(line, payload) {
  process.stdout.write(payload === undefined ? `${line}\n` : `${line}\n${payload}\n`);
  process.exitCode = 0;
}

/**
 * Run a hook body, turning any unforeseen failure into a stated skip rather than a crash.
 * The same policy `lib/io.mjs` sets for the workflow gates, with the difference that a
 * caller here is owed a line: silence would read as a store that answered.
 * @param {string} verb The hook's negative prefix, e.g. `not saved`.
 * @param {() => Promise<void>} body
 */
export async function guard(verb, body) {
  try {
    await body();
  } catch (err) {
    say(`${verb}: ${why(err)}`);
  }
}
