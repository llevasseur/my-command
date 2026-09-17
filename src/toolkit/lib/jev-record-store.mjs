// Where a recorded Jev exchange lands, and what is scrubbed out of it on the way.
//
// The Jev client in `jev.mjs` never throws and answers every failure with an empty answer
// map, by explicit design in `docs/adrs/0013-the-eval-bar-is-pre-registered.md`. That makes a
// refused key, a rejected body and a model that answered 7 of 125 questions indistinguishable
// at the call site: all three arrive as "no answers". This module owns the other half of the
// fix — a place outside the client where the whole exchange is written down, and a redaction
// pass that runs before anything is written.
//
// **The API key is never written to disk, by any path.** `package.json` ships `src`, so a key
// committed here is a key published to npm, and a record is the one artifact in this campaign
// whose whole purpose is to preserve what crossed the wire verbatim. Two passes stop it:
// `redactHeaders` blanks every header that carries a credential by name, and `redactValue`
// walks the decoded body replacing any literal occurrence of a known secret — which is what
// catches an endpoint that echoes the rejected key back inside a 401 body.
//
// Records land under `~/.my-command/jev-record/`, beside the `shots/` and `judge/` keeps and
// outside any checkout, for the reason
// `docs/adrs/0009-conversation-derived-state-leaves-the-device.md` gives for the shadow store:
// a record that cannot be reached from a working tree cannot be committed by accident.
//
// Zero runtime dependencies: `node:fs`, `node:os` and `node:path`, nothing else. ADR 0013
// makes that a condition of this layer existing at all rather than a preference.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where the key lives. The environment, and nowhere else. */
export const KEY_VAR = 'TYPESAFE_API_KEY';

/** Redirects the record keep, exactly as `MY_COMMAND_SHOTS_DIR` redirects the screenshots one. */
export const KEEP_VAR = 'MY_COMMAND_JEV_RECORD_DIR';

/**
 * The on-disk format's version, carried on every record and every session file.
 *
 * It is a number on the record rather than a convention in prose because two downstream
 * readers parse these files — an eval harness in this repo and an ingest pass in another —
 * and the one in another repository cannot be changed in the same commit as the format.
 */
export const RECORD_VERSION = 1;

/** What a redacted value reads as. A fixed string, so a reader can detect one. */
export const REDACTED = '<redacted>';

/** Headers whose value is a credential whatever it contains. Blanked by name, before any scan. */
const SENSITIVE_HEADER = /^(authorization|proxy-authorization|x-api-key|api-key|cookie|set-cookie)$/i;

/** A session directory's name: sortable to the second, plus enough entropy to never collide. */
const SESSION_NAME = /^[0-9]{8}T[0-9]{6}-[a-z0-9]{6}$/;

/** How wide a record's sequence number is zero-padded. Six keeps a session sorted lexically. */
const SEQUENCE_WIDTH = 6;

/**
 * The keep's root — the device-wide directory every session lands under.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function keepRoot(env = process.env) {
  const override = env[KEEP_VAR];
  return override !== undefined && override !== '' ? override : join(homedir(), '.my-command', 'jev-record');
}

/**
 * A fresh session name. Sortable first so `readdirSync().sort()` is newest-last with no
 * stat call, and suffixed so two proxies started in the same second cannot claim one name.
 * @param {Date} [now]
 * @param {() => number} [random]
 * @returns {string}
 */
export function sessionName(now = new Date(), random = Math.random) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '');
  const suffix = Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');
  return `${stamp}-${suffix}`;
}

/**
 * Where one session's files live. The name is checked rather than trusted: it reaches this
 * from a `--session` flag, and an unconstrained one joins its way out of the keep.
 * @param {string} name
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function sessionDir(name, env = process.env) {
  if (!SESSION_NAME.test(name)) throw new Error(`\`${name}\` is not a session name`);
  return join(keepRoot(env), name);
}

/**
 * One exchange's filename within a session. Zero-padded so the directory listing is the
 * call order, which is the only ordering an ingest pass gets for free.
 * @param {number} sequence
 * @returns {string}
 */
export function recordName(sequence) {
  return `${String(sequence).padStart(SEQUENCE_WIDTH, '0')}.json`;
}

/**
 * Whether a decoded JSON value is a record of named fields, as against an array or a scalar.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && Object(value) === value && !Array.isArray(value);
}

/**
 * The secrets to scrub, as literal strings. The environment's key plus anything the caller
 * pulled off an inbound header, since a caller may forward a key this process never held.
 * @param {(string | undefined)[]} candidates
 * @returns {string[]}
 */
export function secretsFrom(candidates) {
  /** @type {string[]} */
  const secrets = [];
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const trimmed = candidate.trim();
    // A one- or two-character "secret" would redact ordinary prose. A real key is far longer,
    // so a short one is treated as no secret rather than as a scrubbing pattern.
    if (trimmed.length < 8) continue;
    // `Bearer <key>` arrives whole off a header; the key itself is the part worth matching,
    // because a body echoing it will not echo the scheme with it.
    const bare = trimmed.replace(/^Bearer\s+/i, '');
    for (const value of [trimmed, bare]) if (value.length >= 8 && !secrets.includes(value)) secrets.push(value);
  }
  return secrets;
}

/**
 * One string with every known secret removed.
 * @param {string} text
 * @param {readonly string[]} secrets
 * @returns {string}
 */
export function redactText(text, secrets) {
  let out = text;
  // `split`/`join` rather than a built regex: a key is arbitrary bytes and could carry regex
  // metacharacters, and a mis-escaped pattern is a key that silently fails to be redacted.
  for (const secret of secrets) if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  return out;
}

/**
 * A decoded JSON value with every known secret removed, at any depth.
 *
 * Structure is preserved exactly — only string leaves change — so a redacted body is still
 * the shape the endpoint sent and an ingest pass reads it with no special case.
 * @param {unknown} value
 * @param {readonly string[]} secrets
 * @returns {unknown}
 */
export function redactValue(value, secrets) {
  if (secrets.length === 0) return value;
  if (String(value) === value) return redactText(/** @type {string} */ (value), secrets);
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, secrets));
  if (isRecord(value)) {
    /** @type {Record<string, unknown>} */
    const out = {};
    // Keys are redacted too: a body keyed by the credential is rare and is still a leak.
    for (const [key, entry] of Object.entries(value)) out[redactText(key, secrets)] = redactValue(entry, secrets);
    return out;
  }
  return value;
}

/**
 * Headers safe to write down: a credential header is blanked by name, and every surviving
 * value is still scanned, because a key can arrive on a header nobody thought to name.
 * @param {Record<string, string>} headers
 * @param {readonly string[]} secrets
 * @returns {Record<string, string>}
 */
export function redactHeaders(headers, secrets) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name.toLowerCase()] = SENSITIVE_HEADER.test(name) ? REDACTED : redactText(value, secrets);
  }
  return out;
}

/**
 * Open a session: create its directory and write the header file every record in it refers
 * back to. Returns the directory, so a caller never composes the path itself.
 * @param {string} name
 * @param {Record<string, unknown>} head What this session is: endpoint, proxy url, pid.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function openSession(name, head, env = process.env) {
  const dir = sessionDir(name, env);
  mkdirSync(dir, { recursive: true });
  writeSession(dir, { v: RECORD_VERSION, session: name, ...head });
  return dir;
}

/**
 * Write (or rewrite) a session's header file. Rewriting is ordinary: the port is known only
 * once the server is listening, and the record count only once it stops.
 * @param {string} dir
 * @param {Record<string, unknown>} head
 * @returns {string}
 */
export function writeSession(dir, head) {
  const path = join(dir, 'session.json');
  writeFileSync(path, `${JSON.stringify(head, null, 2)}\n`);
  return path;
}

/**
 * Write one exchange. The record arrives already redacted — this function does not scrub,
 * so that there is exactly one place where scrubbing is decided and it is upstream of every
 * writer rather than beside one of them.
 * @param {string} dir
 * @param {number} sequence
 * @param {Record<string, unknown>} record
 * @returns {string}
 */
export function writeRecord(dir, sequence, record) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, recordName(sequence));
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

/**
 * A JSON file read back, or null when it is missing or unreadable. Unreadable answers the
 * same as absent on purpose: a reader of this keep is reporting, and a half-written record
 * from a killed proxy is not a reason to fail the report.
 * @param {string} path
 * @returns {Record<string, unknown> | null}
 */
function readJson(path) {
  try {
    const decoded = JSON.parse(readFileSync(path, 'utf8'));
    return isRecord(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Every session in the keep, oldest first — which the name format makes a plain sort.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function listSessions(env = process.env) {
  try {
    return readdirSync(keepRoot(env))
      .filter((name) => SESSION_NAME.test(name))
      .sort();
  } catch {
    return [];
  }
}

/**
 * One session read back whole: its header and every record in it, in call order.
 * @param {string} name
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{name: string, dir: string, session: Record<string, unknown> | null,
 *   records: Record<string, unknown>[]}}
 */
export function readSession(name, env = process.env) {
  const dir = sessionDir(name, env);
  /** @type {string[]} */
  let names = [];
  try {
    names = readdirSync(dir)
      .filter((entry) => /^[0-9]{6}\.json$/.test(entry))
      .sort();
  } catch {
    // A session directory that is gone reads as one with no records, not as a failure.
  }
  /** @type {Record<string, unknown>[]} */
  const records = [];
  for (const entry of names) {
    const record = readJson(join(dir, entry));
    if (record !== null) records.push(record);
  }
  return { name, dir, session: readJson(join(dir, 'session.json')), records };
}
