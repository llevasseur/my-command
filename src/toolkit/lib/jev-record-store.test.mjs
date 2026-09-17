// The one promise this store makes that nothing else can make for it: a record never carries
// the API key. Everything else here — the layout, the version, the session name — exists so
// two downstream readers can parse the keep, so each is asserted rather than described.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import {
  KEEP_VAR,
  keepRoot,
  listSessions,
  openSession,
  RECORD_VERSION,
  REDACTED,
  readSession,
  recordName,
  redactHeaders,
  redactText,
  redactValue,
  secretsFrom,
  sessionDir,
  sessionName,
  writeRecord,
} from './jev-record-store.mjs';

/** @type {string[]} */
const made = [];
const realKeep = process.env[KEEP_VAR];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
  if (realKeep === undefined) delete process.env[KEEP_VAR];
  else process.env[KEEP_VAR] = realKeep;
});

/** Point the device-wide keep at a throwaway directory. @returns {string} */
function keepAt() {
  const root = mkdtempSync(join(tmpdir(), 'mct-jev-record-'));
  made.push(root);
  process.env[KEEP_VAR] = root;
  return root;
}

/** A session name fixed in time, so a test never depends on the clock. @returns {string} */
function fixedName() {
  return sessionName(new Date('2026-09-17T14:30:12Z'), () => 0.42);
}

test('the keep is outside any checkout and redirectable for tests', () => {
  const root = keepAt();
  assert.equal(keepRoot(), root);
  delete process.env[KEEP_VAR];
  assert.match(keepRoot(), /\.my-command[/\\]jev-record$/);
});

test('a session name sorts by time and cannot collide within a second', () => {
  const at = new Date('2026-09-17T14:30:12.500Z');
  const first = sessionName(at, () => 0.1);
  const second = sessionName(at, () => 0.9);
  assert.match(first, /^20260917T143012-[a-z0-9]{6}$/);
  assert.notEqual(first, second);
  assert.ok(sessionName(new Date('2026-09-17T14:30:13Z'), () => 0.1) > first);
});

test('a session name that is not one cannot join its way out of the keep', () => {
  keepAt();
  assert.throws(() => sessionDir('../../etc'), /is not a session name/);
  assert.throws(() => sessionDir('notasession'), /is not a session name/);
});

test('records are named so a directory listing is the call order', () => {
  assert.equal(recordName(1), '000001.json');
  assert.equal(recordName(125), '000125.json');
  assert.deepEqual([recordName(10), recordName(2)].sort(), ['000002.json', '000010.json']);
});

test('a short value is not treated as a secret, and Bearer is scrubbed with the key', () => {
  assert.deepEqual(secretsFrom([undefined, 'ab']), []);
  const secrets = secretsFrom(['Bearer sk-live-abcdef123456']);
  assert.ok(secrets.includes('Bearer sk-live-abcdef123456'));
  assert.ok(secrets.includes('sk-live-abcdef123456'));
});

test('a credential header is blanked by name and every other header is still scanned', () => {
  const secrets = secretsFrom(['sk-live-abcdef123456']);
  const headers = redactHeaders(
    {
      Authorization: 'Bearer sk-live-abcdef123456',
      'X-Api-Key': 'sk-live-abcdef123456',
      'X-Trace': 'run sk-live-abcdef123456 finished',
      'content-type': 'application/json',
    },
    secrets,
  );
  assert.equal(headers.authorization, REDACTED);
  assert.equal(headers['x-api-key'], REDACTED);
  assert.equal(headers['x-trace'], `run ${REDACTED} finished`);
  assert.equal(headers['content-type'], 'application/json');
});

test('a key echoed inside a 401 body is redacted at any depth, structure intact', () => {
  const secrets = secretsFrom(['sk-live-abcdef123456']);
  const redacted = redactValue(
    {
      error: { message: 'key sk-live-abcdef123456 was refused', codes: [401, 'sk-live-abcdef123456'] },
      retry: false,
      count: 3,
    },
    secrets,
  );
  assert.ok(!JSON.stringify(redacted).includes('sk-live-abcdef123456'));
  assert.deepEqual(redacted, {
    error: { message: `key ${REDACTED} was refused`, codes: [401, REDACTED] },
    // Only string leaves change: a reader parses the same shape it would have parsed.
    retry: false,
    count: 3,
  });
});

test('a key carrying regex metacharacters is still redacted', () => {
  const key = 'sk-a+b*c(d)[e]|f.g';
  assert.equal(redactText(`before ${key} after`, secretsFrom([key])), `before ${REDACTED} after`);
});

test('a session round-trips: header, records in call order, and nothing else claimed', () => {
  const root = keepAt();
  const name = fixedName();
  const dir = openSession(name, { endpoint: 'https://example.invalid/v1', port: 8787 });

  assert.equal(dir, join(root, name));
  assert.ok(existsSync(join(dir, 'session.json')));
  writeRecord(dir, 1, { v: RECORD_VERSION, id: 1, session: name });
  writeRecord(dir, 2, { v: RECORD_VERSION, id: 2, session: name });

  const read = readSession(name);
  assert.equal(read.session?.v, RECORD_VERSION);
  assert.equal(read.session?.endpoint, 'https://example.invalid/v1');
  assert.deepEqual(
    read.records.map((record) => record.id),
    [1, 2],
  );
  assert.deepEqual(listSessions(), [name]);
});

test('a half-written record reads as absent rather than failing the whole session', () => {
  keepAt();
  const name = fixedName();
  const dir = openSession(name, {});
  writeRecord(dir, 1, { id: 1 });
  // What a proxy killed mid-write leaves behind.
  writeFileSync(join(dir, recordName(2)), '{"id": 2');

  const read = readSession(name);
  assert.deepEqual(
    read.records.map((record) => record.id),
    [1],
  );
});

test('a session nobody opened reads as empty rather than throwing', () => {
  keepAt();
  const read = readSession(fixedName());
  assert.equal(read.session, null);
  assert.deepEqual(read.records, []);
  assert.deepEqual(listSessions(), []);
});
