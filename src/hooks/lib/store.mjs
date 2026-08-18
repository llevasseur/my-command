// The hosted ideas ledger, reached the same way from every hook that touches it. The
// concept store sits behind the same Worker but is reached through
// `my-command-tools concepts`, which is why only the ledger is addressed here.
//
// **Credentials come from `process.env` and go nowhere else.** They are read per call
// rather than captured at import, never accepted as an argument or a flag, and never
// printed, written to a file, or put in a status line. A URL is never printed either — a
// configured address can carry one in its query string.

/** How long a hook waits on the store before giving up on an attempt. */
const TIMEOUT_MS = 15000;

/** @typedef {{ origin: string, token: string }} Store */
/** @typedef {{ missing: string }} Unresolved */

/**
 * The address of the ledger, or the name of the variable that is missing.
 *
 * `CONCEPTS_URL`/`CONCEPTS_TOKEN` are the documented fallback, because ideas and concepts
 * are one dataset behind one Worker — a device configured for concepts is already
 * configured for ideas. `IDEAS_*` wins where both are set, so the two can be split later
 * without a migration.
 *
 * @returns {Store | Unresolved}
 */
export function resolve() {
  const suffix = ' (CONCEPTS_URL and CONCEPTS_TOKEN are accepted as fallbacks)';
  const origin = (process.env.IDEAS_URL ?? process.env.CONCEPTS_URL)?.trim();
  const token = (process.env.IDEAS_TOKEN ?? process.env.CONCEPTS_TOKEN)?.trim();
  if (!origin) return { missing: `IDEAS_URL is not set${suffix}` };
  if (!token) return { missing: `IDEAS_TOKEN is not set${suffix}` };
  return { origin: origin.replace(/\/+$/, ''), token };
}

/**
 * True when this resolution failed. `resolve()` is the only thing that makes one, so the
 * question is which of the two it returned — not what any field happens to hold.
 * @param {Store | Unresolved} r @returns {r is Unresolved}
 */
export function unresolved(r) {
  return 'missing' in r;
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
 * One call to the ledger, retried **once** on a network error or a 5xx.
 *
 * The retry replays the identical request rather than recomposing it. The ledger is an
 * append-only event log, so a recomposed retry appends a second event rather than
 * replaying the first — which is also why a caller must never recover by re-running.
 *
 * Never throws — every outcome is a value.
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
      /** @type {Record<string, string>} */
      const headers = { authorization: `Bearer ${store.token}` };
      /** @type {RequestInit} */
      const sent = { method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) };
      if (body !== undefined) {
        headers['content-type'] = 'application/json';
        sent.body = body;
      }
      const response = await fetch(`${store.origin}${path}`, sent);
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
 * **Every hook here exits 0, always.** A non-zero exit would turn an unreachable store
 * from a stated skip into a stop.
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
 * Unlike the workflow gates in `lib/io.mjs`, a caller here is owed a line: silence would
 * read as a store that answered.
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
