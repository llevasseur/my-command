// `concepts` — the hosted concept store, read and written from one place.
//
// It lives here rather than inlined in /lookup, /teach and /learn because
// `Bash(my-command-tools:*)` is allowlisted in src/hooks/settings-fragment.json and an
// inlined `node -e` heredoc is not — the PreToolUse gate refuses that shape in a worktree.
//
// Every subcommand prints ONE status line and always exits 0: an unreachable store is a
// stated skip, never a stop.
import { readFileSync } from 'node:fs';
import { str } from '../lib/flags.mjs';

export const usage = `concepts <lookup|save|count> [--record-file <path>] [--json]

Read and write the hosted concept store. Every subcommand prints one status line on
stdout and always exits 0 — an unreachable store costs the check and nothing else, so a
caller reads the line and carries on rather than stopping the run.

  concepts lookup <term> [--field <field>] [--limit <n>]
      The three-outcome gate. Prints one of:
        term hit: <term> [<field>]     followed by \`sentence: <the stored sentence>\`
        field hit: <n> neighbour(s), no term hit    followed by one \`- term [field] sentence\` per row
        miss: <why>                    the corpus holds no concept, or the store was not read
      An exact term match is compared trimmed and case-insensitively, wherever the row was
      found. A result that merely mentions the query is a neighbour, never a term hit.

  concepts save [--record-file <path>]
      Reads the record as JSON — from the file when --record-file is given, otherwise from
      stdin — so no field ever reaches a command line and no shell quoting can corrupt a
      sentence containing quotes, backslashes, or newlines. --record-file is the form to
      reach for: write the file with the \`Write\` tool and pass its path, with no shell in
      between, the way \`commit --message-file\` and \`pr --body-file\` already work.
      Required: term, sentence, field, skills. Optional: notes, tips, sources,
      surfacedSkills — each omitted entirely when empty, never written as "" or [].
      \`savedAt\` is stamped here. Prints \`saved: <status>\` or \`not saved: <cause>\`.

  concepts count <term> <skill>
      Re-reads the stored record, appends <skill> to \`skills\`, carries notes, tips,
      sources and surfacedSkills forward unchanged, and POSTs it as a new version — the
      store is append-only and reads resolve the newest version, so a version written
      without them would lose them for every later reader. \`find-skills\` is never
      recorded. Prints \`counted: <status> — <skill> on <term>\` or \`not counted: <cause>\`.

  --json  Print the structured payload instead of the human line.

The address and the credential are read from the environment inside this process:
IDEAS_URL / IDEAS_TOKEN, with CONCEPTS_URL / CONCEPTS_TOKEN accepted as fallbacks, since
ideas and concepts are one dataset behind one Worker and one token. The token is never
accepted as an argument or a flag, never echoed, and never written to a file.`;

/** Rows carried by a lookup when no --limit is given. */
const DEFAULT_LIMIT = 10;

/**
 * The store's address and credential, read from the environment and nowhere else. An unset
 * variable is reported by the name the docs tell a caller to export.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ok: true, root: string, token: string} | {ok: false, unset: string}}
 */
function store(env = process.env) {
  const base = env.IDEAS_URL || env.CONCEPTS_URL;
  const token = env.IDEAS_TOKEN || env.CONCEPTS_TOKEN;
  if (!base) return { ok: false, unset: 'CONCEPTS_URL' };
  if (!token) return { ok: false, unset: 'CONCEPTS_TOKEN' };
  return { ok: true, root: base.replace(/\/+$/, ''), token };
}

/**
 * A network failure's message with the cause fetch wraps underneath it — `fetch failed`
 * alone names nothing a reader can act on.
 * @param {unknown} err @returns {string}
 */
function why(err) {
  if (!(err instanceof Error)) return String(err);
  const cause = /** @type {{message?: string} | undefined} */ (err.cause);
  return err.message + (cause?.message ? ` (${cause.message})` : '');
}

/**
 * One GET against the store, retried once on a 5xx or a network error. A 404 is not a
 * failure — it is the probe saying the corpus holds nothing under that key.
 * @param {string} root @param {string} token @param {string} path
 * @returns {Promise<{body?: any, missing?: true, error?: string}>}
 */
async function get(root, token, path) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(root + path, { headers: { authorization: `Bearer ${token}` } });
      if (res.status === 404) return { missing: true };
      if (!res.ok) {
        if (res.status >= 500 && attempt === 1) continue;
        return { error: `${res.status} ${(await res.text()).trim().slice(0, 120)}` };
      }
      return { body: await res.json() };
    } catch (err) {
      if (attempt === 1) continue;
      return { error: why(err) };
    }
  }
  return { error: 'the store did not answer' };
}

/**
 * POST one record, retried once on a 5xx or a network error. The retry reuses the same
 * record: the row id is a ULID derived from it, so replaying an identical body returns 200
 * instead of writing a second version.
 * @param {string} root @param {string} token @param {Record<string, unknown>} rec
 * @returns {Promise<{status: number, body: string} | {error: string}>}
 */
async function post(root, token, rec) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${root}/api/concepts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(rec),
      });
      const body = (await res.text()).trim().slice(0, 200);
      if (res.ok) return { status: res.status, body };
      if (res.status >= 500 && attempt === 1) continue;
      return { status: res.status, body };
    } catch (err) {
      if (attempt === 1) continue;
      return { error: why(err) };
    }
  }
  return { error: 'the store did not answer' };
}

/** @param {unknown} a @param {unknown} b */
const same = (a, b) =>
  String(a ?? '')
    .trim()
    .toLowerCase() ===
  String(b ?? '')
    .trim()
    .toLowerCase();

/** `find-skills` is the finder, never an applied skill — filtered out, not rejected. */
const FINDER = 'find-skills';

/**
 * @param {string} term @param {string | undefined} field @param {number} limit
 * @returns {Promise<Result>}
 */
async function lookup(term, field, limit) {
  const env = store();
  if (!env.ok) {
    return miss(`${env.unset} is not set, so the corpus was not read`, { unset: env.unset });
  }
  const { root, token } = env;
  /** @param {string} e */
  const unreachable = (e) => miss(`the store answered ${e}, so the corpus was not read`, { cause: e });
  const q = encodeURIComponent(term);

  const exact = await get(root, token, `/api/concepts/concept?term=${q}`);
  if (exact.error) return unreachable(exact.error);
  if (exact.body?.concept) return hit(exact.body.concept, (exact.body.versions || []).length);

  /** @type {Map<string, any>} */
  const neighbours = new Map();
  const found = await get(root, token, `/api/concepts/search?q=${q}&limit=${limit}`);
  if (found.error) return unreachable(found.error);
  for (const c of found.body?.results || []) {
    // An exact match reached through search is still a term hit; a row that merely mentions
    // the query is a neighbour.
    if (same(c.term, term)) return hit(c, 1);
    neighbours.set(c.term, c);
  }

  if (field) {
    const near = await get(root, token, `/api/concepts?field=${encodeURIComponent(field)}&limit=${limit}`);
    if (near.error) return unreachable(near.error);
    for (const c of near.body?.concepts || []) {
      if (same(c.term, term)) return hit(c, 1);
      neighbours.set(c.term, c);
    }
  }

  const rows = [...neighbours.values()].slice(0, limit);
  if (rows.length === 0) return miss(`the corpus holds no concept for ${JSON.stringify(term)}`, {});
  return {
    subcommand: 'lookup',
    outcome: 'field hit',
    lines: [
      `field hit: ${rows.length} neighbour(s), no term hit`,
      ...rows.map((c) => `- ${c.term} [${c.field ?? 'no field'}] ${c.sentence}`),
    ],
    concept: null,
    neighbours: rows,
    cause: null,
  };
}

/**
 * @param {string} reason @param {{unset?: string, cause?: string}} detail
 * @returns {Result}
 */
function miss(reason, detail) {
  return {
    subcommand: 'lookup',
    outcome: 'miss',
    lines: [`miss: ${reason}`],
    concept: null,
    neighbours: [],
    cause: detail.unset ?? detail.cause ?? null,
  };
}

/** @param {any} c @param {number} versions @returns {Result} */
function hit(c, versions) {
  return {
    subcommand: 'lookup',
    outcome: 'term hit',
    lines: [
      `term hit: ${c.term} [${c.field ?? 'no field'}]${versions > 1 ? ` (${versions} versions, newest shown)` : ''}`,
      `sentence: ${c.sentence}`,
    ],
    concept: c,
    neighbours: [],
    cause: null,
  };
}

/**
 * @typedef {object} Result
 * @property {string} subcommand
 * @property {string} outcome
 * @property {string[]} lines
 * @property {any} [concept]
 * @property {any[]} [neighbours]
 * @property {string | null} cause
 */

/**
 * The record arrives as JSON from a file or on stdin, never as arguments, so no field ever
 * reaches a command line.
 * @param {string} [path] the --record-file path, or undefined to read stdin
 * @returns {{record: Record<string, any>} | {error: string}}
 */
function recordFrom(path) {
  const source = path ? `the record file ${JSON.stringify(path)}` : 'stdin';
  const empty = path
    ? `${source} is empty — write the JSON record to it first`
    : 'no record arrived on stdin — pipe the JSON record in, or pass --record-file <path>';
  let raw;
  try {
    raw = readFileSync(path ?? 0, 'utf8');
  } catch (err) {
    if (path) return { error: `${source} could not be read (${err instanceof Error ? err.message : String(err)})` };
    return { error: empty };
  }
  if (!raw.trim()) return { error: empty };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: `the record on ${source} is not a JSON object` };
    }
    return { record: parsed };
  } catch (err) {
    return {
      error: `the record on ${source} is not valid JSON (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

/**
 * A list field, normalised and stripped of the finder. Accepts an array or the
 * newline-separated string the old snippet took, so a caller can hand over either.
 * @param {unknown} v @returns {string[]}
 */
function listOf(v) {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [];
  return raw.map((s) => String(s).trim()).filter((s) => s && s !== FINDER);
}

/**
 * @param {string} outcome @param {string} line @param {Record<string, unknown>} [extra]
 * @returns {Result}
 */
const say = (outcome, line, extra = {}) => ({ subcommand: '', outcome, lines: [line], cause: null, ...extra });

/**
 * @param {string} [recordFile]
 * @returns {Promise<Result>}
 */
async function save(recordFile) {
  /** @param {string} cause */
  const no = (cause) => say('not saved', `not saved: ${cause}`, { subcommand: 'save', cause });

  const env = store();
  if (!env.ok) return no(`${env.unset} is not set`);

  const given = recordFrom(recordFile);
  if ('error' in given) return no(given.error);
  const input = given.record;

  for (const key of ['term', 'sentence', 'field']) {
    if (!String(input[key] ?? '').trim()) return no(`the record is missing ${key}`);
  }

  /** @type {Record<string, unknown>} */
  const rec = {
    term: String(input.term).trim(),
    sentence: String(input.sentence),
    field: String(input.field).trim(),
    skills: listOf(input.skills),
    // A fresh timestamp on every save is what makes a re-teach a new version rather than a
    // silent overwrite of the old one.
    savedAt: new Date().toISOString(),
  };
  // An optional field is omitted entirely when empty — never "" and never []. The detail
  // page distinguishes absent from empty.
  const notes = String(input.notes ?? '').trim();
  if (notes) rec.notes = notes;
  for (const key of ['tips', 'sources', 'surfacedSkills']) {
    const values = listOf(input[key]);
    if (values.length) rec[key] = values;
  }

  const res = await post(env.root, env.token, rec);
  if ('error' in res) return no(res.error);
  if (res.status < 400) {
    const line = `saved: ${res.status}${res.status === 200 ? ' (already stored)' : ' (new)'}`;
    return say('saved', line, { subcommand: 'save', status: res.status, term: rec.term });
  }
  return no(`${res.status} ${res.body}`);
}

/**
 * @param {string} term @param {string} skill
 * @returns {Promise<Result>}
 */
async function count(term, skill) {
  /** @param {string} cause */
  const no = (cause) => say('not counted', `not counted: ${cause}`, { subcommand: 'count', cause });

  const env = store();
  if (!env.ok) return no(`${env.unset} is not set`);
  if (skill === FINDER) return no('find-skills is never recorded as an applied skill');

  const { root, token } = env;
  let stored;
  try {
    const res = await fetch(`${root}/api/concepts/concept?term=${encodeURIComponent(term)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return no(`the store answered ${res.status} for ${JSON.stringify(term)}`);
    stored = /** @type {any} */ (await res.json()).concept;
  } catch (err) {
    return no(why(err));
  }
  if (!stored) return no(`the corpus holds no concept for ${JSON.stringify(term)}`);

  /** @type {Record<string, unknown>} */
  const rec = {
    term: stored.term,
    sentence: stored.sentence,
    field: stored.field,
    skills: [...(stored.skills || []), skill].filter((s) => s !== FINDER),
    savedAt: new Date().toISOString(),
  };
  // Carried forward unchanged: reads resolve the newest version, so a version written
  // without them loses them for every later reader.
  for (const key of ['notes', 'tips', 'sources', 'surfacedSkills']) {
    const v = stored[key];
    if (typeof v === 'string' ? v.trim() : Array.isArray(v) && v.length) rec[key] = v;
  }

  const res = await post(root, token, rec);
  if ('error' in res) return no(res.error);
  if (res.status < 400) {
    return say('counted', `counted: ${res.status} — ${skill} on ${rec.term}`, {
      subcommand: 'count',
      status: res.status,
      term: rec.term,
      skill,
    });
  }
  return no(`${res.status} ${res.body}`);
}

/**
 * The human status line every caller reads; `--json` asks the CLI for the payload instead.
 * @param {Result} result @returns {string}
 */
export function line(result) {
  return result.lines.join('\n');
}

/**
 * @param {import('../cli.mjs').Ctx} ctx
 * @returns {Promise<Result>}
 */
export function run(ctx) {
  const [sub, ...rest] = ctx.positionals;

  if (sub === 'lookup') {
    const term = rest.join(' ').trim();
    if (!term) return Promise.resolve(miss('no term was given, so the corpus was not read', {}));
    const given = Number(str(ctx.flags.limit));
    const limit = Number.isFinite(given) && given > 0 ? given : DEFAULT_LIMIT;
    return lookup(term, str(ctx.flags.field), limit);
  }

  if (sub === 'save') return save(str(ctx.flags['record-file']));

  if (sub === 'count') {
    const [term, skill] = rest;
    if (!term || !skill) {
      return Promise.resolve(
        say('not counted', 'not counted: a term and a skill are both required', { subcommand: 'count' }),
      );
    }
    return count(term, skill);
  }

  // Even an unknown subcommand answers on the one-line contract.
  return Promise.resolve(
    say('unknown', `miss: unknown subcommand ${JSON.stringify(sub ?? '')} — expected lookup, save, or count`, {
      subcommand: String(sub ?? ''),
    }),
  );
}
