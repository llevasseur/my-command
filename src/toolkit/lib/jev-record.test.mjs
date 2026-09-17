// What the proxy has to prove, and can only prove against a real socket: that a record
// distinguishes the cases the Jev client collapses.
//
// The client never throws and answers every failure with an empty answer map, so a 401, a 422,
// a dead endpoint and a model that answered 7 of 125 questions are one observation at the call
// site. Each test below drives `ask()` — the real one, unmodified — through the proxy and
// asserts that the client still sees exactly what it always saw, while the record beside it
// tells the four apart.
//
// The upstream is a loopback `node:http` server, so nothing here reaches a third party and the
// bytes asserted on are the bytes that actually crossed a socket.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { ask } from './jev.mjs';
import { buildRecord, forwardHeaders, HEALTH_PATH, startProxy } from './jev-record.mjs';
import { KEEP_VAR, openSession, REDACTED, readSession, secretsFrom, sessionName } from './jev-record-store.mjs';

/** A key shaped like a real one, long enough that the store treats it as a secret. */
const KEY = 'sk-live-0123456789abcdef';

/** @type {string[]} */
const made = [];
/** @type {(() => Promise<void>)[]} */
const shutdowns = [];
const realKeep = process.env[KEEP_VAR];
after(async () => {
  for (const shutdown of shutdowns) await shutdown();
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
  if (realKeep === undefined) delete process.env[KEEP_VAR];
  else process.env[KEEP_VAR] = realKeep;
});

/** A throwaway keep for one test. @returns {string} */
function keepAt() {
  const root = mkdtempSync(join(tmpdir(), 'mct-jev-proxy-'));
  made.push(root);
  process.env[KEEP_VAR] = root;
  return root;
}

/**
 * A loopback upstream that answers however the test says, and records what it was sent.
 * @param {(body: string, headers: import('node:http').IncomingHttpHeaders) =>
 *   {status: number, body: string, contentType?: string}} answer
 * @returns {Promise<{url: string, seen: {authorization: string | undefined, body: string}[]}>}
 */
async function upstream(answer) {
  /** @type {{authorization: string | undefined, body: string}[]} */
  const seen = [];
  const server = createServer((req, res) => {
    /** @type {Buffer[]} */
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      seen.push({ authorization: /** @type {string | undefined} */ (req.headers.authorization), body });
      const reply = answer(body, req.headers);
      res.writeHead(reply.status, { 'content-type': reply.contentType ?? 'application/json' });
      res.end(reply.body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const port = Number(/** @type {{port?: number}} */ (server.address())?.port);
  shutdowns.push(
    () =>
      new Promise((resolve) => {
        server.close(() => resolve(undefined));
        server.closeAllConnections?.();
      }),
  );
  return { url: `http://127.0.0.1:${port}`, seen };
}

/**
 * A proxy in its own fresh session, pointed at `endpoint`.
 * @param {string} endpoint
 * @param {string | undefined} [key]
 * @returns {Promise<{url: string, session: string, dir: string, close: () => Promise<void>}>}
 */
async function proxyTo(endpoint, key = KEY) {
  keepAt();
  const session = sessionName();
  const dir = openSession(session, { endpoint });
  const proxy = await startProxy({ dir, session, endpoint, key });
  shutdowns.push(proxy.close);
  return { url: proxy.url, session, dir, close: proxy.close };
}

/** A question map of `count` nouls, keyed q1..qN. @param {number} count */
function questions(count) {
  /** @type {Record<string, {type: 'noul', instructions: string}>} */
  const map = {};
  for (let i = 1; i <= count; i++) map[`q${i}`] = { type: 'noul', instructions: `claim ${i}` };
  return map;
}

/**
 * A field path into a decoded record.
 *
 * These tests assert on JSON that arrived as `unknown`, and reaching into it field by field
 * would need a cast at every level. One cast here, in a helper that answers `undefined` for
 * any path that does not exist, is the whole of it.
 * @param {unknown} value
 * @param {string} path
 * @returns {unknown}
 */
function at(value, path) {
  let current = value;
  for (const key of path.split('.')) {
    if (current === null || Object(current) !== current) return undefined;
    // Safe: the guard above establishes `current` is an object, and an absent key reads as
    // undefined, which is exactly what this returns for a path that does not exist.
    current = /** @type {Record<string, unknown>} */ (current)[key];
  }
  return current;
}

/**
 * The same reading, for a field that should be an array. An empty list for anything else, so a
 * `.length` assertion fails on the count rather than on the access.
 * @param {unknown} value
 * @param {string} path
 * @returns {unknown[]}
 */
function list(value, path) {
  const found = at(value, path);
  return Array.isArray(found) ? found : [];
}

/** Every byte the session wrote. @param {string} dir @returns {string} */
function bytesOf(dir) {
  return readdirSync(dir)
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n');
}

test('a call that answered 7 of 125 is distinguishable from one that answered all 125', async () => {
  const api = await upstream(() => ({
    status: 200,
    body: JSON.stringify({
      answers: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [`q${n}`, { type: 'noul', noul: 0.95 }])),
      usage: { input_tokens: 4321, output_tokens: 96 },
    }),
  }));
  const proxy = await proxyTo(api.url);

  const result = await ask({ state: 'a state', questions: questions(125), key: KEY, endpoint: proxy.url });
  assert.equal(result.ok, true);
  assert.equal(Object.keys(result.answers).length, 7);

  const [record] = readSession(proxy.session).records;
  assert.equal(at(record, 'request.questionCount'), 125);
  assert.equal(at(record, 'response.answerCount'), 7);
  assert.equal(list(record, 'response.unansweredIds').length, 118);
  assert.equal(list(record, 'response.unansweredIds').includes('q8'), true);
  assert.deepEqual(at(record, 'response.usage'), { input_tokens: 4321, output_tokens: 96 });
  assert.equal(at(record, 'response.status'), 200);
  assert.equal(at(record, 'response.ok'), true);
  // The maps themselves, not only the counts: a reader that distrusts the arithmetic can
  // recount from the record.
  assert.equal(list(record, 'request.questionIds').length, 125);
  assert.equal(list(record, 'response.answeredIds').length, 7);
});

test('a 401 the client turned into an empty answer map is visible in the record', async () => {
  const api = await upstream(() => ({
    status: 401,
    body: JSON.stringify({ error: { message: `the key ${KEY} was refused`, type: 'authentication_error' } }),
  }));
  const proxy = await proxyTo(api.url);

  const result = await ask({ state: 's', questions: questions(3), key: KEY, endpoint: proxy.url });
  // Exactly what it would have said against the real endpoint: nothing.
  assert.deepEqual(result.answers, {});
  assert.equal(result.reason, 'bad-key');

  const [record] = readSession(proxy.session).records;
  assert.equal(at(record, 'response.status'), 401);
  assert.equal(at(record, 'response.ok'), false);
  assert.equal(at(record, 'response.answerCount'), 0);
  assert.equal(list(record, 'response.unansweredIds').length, 3);
  assert.equal(at(record, 'response.body.error.type'), 'authentication_error');
  // The key the endpoint echoed back is gone; the sentence around it is not.
  assert.equal(at(record, 'response.body.error.message'), `the key ${REDACTED} was refused`);
});

test('a 422 keeps the field the endpoint named, where an empty answer map would not', async () => {
  const api = await upstream(() => ({
    status: 422,
    body: JSON.stringify({ error: { field: 'questions.q2.instructions', message: 'must be text' } }),
  }));
  const proxy = await proxyTo(api.url);

  const result = await ask({ state: 's', questions: questions(2), key: KEY, endpoint: proxy.url });
  assert.deepEqual(result.answers, {});
  assert.equal(result.reason, 'validation');

  const [record] = readSession(proxy.session).records;
  assert.equal(at(record, 'response.status'), 422);
  assert.equal(at(record, 'response.body.error.field'), 'questions.q2.instructions');
});

test('an error body that is prose rather than JSON is kept as text', async () => {
  const api = await upstream(() => ({ status: 500, body: 'upstream exploded', contentType: 'text/plain' }));
  const proxy = await proxyTo(api.url);

  await ask({ state: 's', questions: questions(1), key: KEY, endpoint: proxy.url });
  const [record] = readSession(proxy.session).records;
  assert.equal(at(record, 'response.status'), 500);
  assert.equal(at(record, 'response.body'), null);
  assert.equal(at(record, 'response.bodyText'), 'upstream exploded');
});

test('an endpoint that never answered records status null and an error, not a fabricated reply', async () => {
  // A port nothing is listening on: the one case where no HTTP response exists to relay.
  const proxy = await proxyTo('http://127.0.0.1:1/v1/systemone');

  const result = await ask({ state: 's', questions: questions(1), key: KEY, endpoint: proxy.url });
  assert.deepEqual(result.answers, {});

  const [record] = readSession(proxy.session).records;
  assert.equal(at(record, 'response.status'), null);
  assert.equal(at(record, 'response.ok'), false);
  assert.equal(at(record, 'response.answers'), null);
  assert.ok(at(record, 'response.error') !== null);
  assert.equal(String(at(record, 'response.error.message')).length > 0, true);
});

test('the key is forwarded upstream and appears in no file the session wrote', async () => {
  const api = await upstream(() => ({ status: 200, body: JSON.stringify({ answers: {} }) }));
  const proxy = await proxyTo(api.url);

  // The caller sends no Authorization of its own — the proxy is what holds the key.
  await fetch(proxy.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state: `state mentioning ${KEY}`, model: 'jev-latest', questions: questions(1) }),
  });

  assert.equal(api.seen[0].authorization, `Bearer ${KEY}`);
  const written = bytesOf(proxy.dir);
  assert.ok(!written.includes(KEY), 'no file the session wrote may contain the key');
  assert.ok(written.includes(REDACTED));
});

test('a caller that already holds a key keeps its own, rather than having one substituted', () => {
  const mine = 'Bearer sk-live-callers-own-key-here';
  assert.equal(forwardHeaders({ authorization: mine }, KEY).authorization, mine);
  assert.equal(forwardHeaders({}, KEY).authorization, `Bearer ${KEY}`);
  assert.equal(forwardHeaders({}, undefined).authorization, undefined);
  // Hop-by-hop headers describe this hop and must not be copied onward.
  assert.equal(forwardHeaders({ host: 'localhost:1', 'content-length': '9' }, KEY).host, undefined);
});

test('the health path answers about the proxy and records nothing', async () => {
  const api = await upstream(() => ({ status: 200, body: JSON.stringify({ answers: {} }) }));
  const proxy = await proxyTo(api.url);

  const health = await fetch(`${proxy.url}${HEALTH_PATH}`);
  assert.equal(health.status, 200);
  assert.equal(at(await health.json(), 'session'), proxy.session);
  assert.equal(readSession(proxy.session).records.length, 0);
  assert.equal(api.seen.length, 0);
});

test('the proxy relays the upstream status and body unchanged', async () => {
  const api = await upstream(() => ({ status: 418, body: JSON.stringify({ teapot: true }) }));
  const proxy = await proxyTo(api.url);

  const relayed = await fetch(proxy.url, { method: 'POST', body: JSON.stringify({ questions: {} }) });
  assert.equal(relayed.status, 418);
  assert.deepEqual(await relayed.json(), { teapot: true });
});

test('every exchange gets its own record, numbered in call order', async () => {
  const api = await upstream(() => ({ status: 200, body: JSON.stringify({ answers: {} }) }));
  const proxy = await proxyTo(api.url);

  for (const n of [1, 2, 3]) {
    await ask({ state: `state ${n}`, questions: questions(n), key: KEY, endpoint: proxy.url });
  }
  const { records } = readSession(proxy.session);
  assert.deepEqual(
    records.map((record) => record.id),
    [1, 2, 3],
  );
  assert.deepEqual(
    records.map((record) => at(record, 'request.questionCount')),
    [1, 2, 3],
  );
});

test('a record carries the version, the session, and both timestamps', () => {
  const record = buildRecord({
    sequence: 1,
    session: '20260917T143012-abc123',
    endpoint: 'https://api.typesafe.ai/v1/systemone',
    startedAt: Date.parse('2026-09-17T14:30:12.000Z'),
    endedAt: Date.parse('2026-09-17T14:30:14.500Z'),
    method: 'POST',
    path: '/',
    requestHeaders: { authorization: `Bearer ${KEY}` },
    requestText: JSON.stringify({ model: 'jev-latest', state: 's', questions: { a: { type: 'noul' } } }),
    status: 200,
    responseHeaders: { 'content-type': 'application/json' },
    responseText: JSON.stringify({ answers: { a: { type: 'noul', noul: 0.2 } } }),
    error: null,
    secrets: secretsFrom([KEY]),
  });

  assert.equal(at(record, 'v'), 1);
  assert.equal(at(record, 'id'), 1);
  assert.equal(at(record, 'session'), '20260917T143012-abc123');
  assert.equal(at(record, 'startedAt'), '2026-09-17T14:30:12.000Z');
  assert.equal(at(record, 'endedAt'), '2026-09-17T14:30:14.500Z');
  assert.equal(at(record, 'durationMs'), 2500);
  assert.equal(at(record, 'request.model'), 'jev-latest');
  assert.equal(at(record, 'request.headers.authorization'), REDACTED);
  assert.equal(at(record, 'response.usage'), null);
});
