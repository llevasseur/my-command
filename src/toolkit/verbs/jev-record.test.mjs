// The verb end to end, through the real CLI: start a detached proxy, drive the real `ask()`
// through it, stop it, and read what it wrote.
//
// The library tests assert what a record contains. This asserts the part only a spawned
// process can show — that `start` prints a URL which already works, that `stop` lets the proxy
// write its closing session file, and that `read` reports the exchange without opening it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ask } from '../lib/jev.mjs';
import { KEEP_VAR } from '../lib/jev-record-store.mjs';

const CLI = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const KEY = 'sk-live-0123456789abcdef';

/** @type {string[]} */
const made = [];
/** @type {(() => Promise<void>)[]} */
const shutdowns = [];
after(async () => {
  for (const shutdown of shutdowns) await shutdown();
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/**
 * Run the CLI as a child, with the keep pointed at a throwaway directory and the key in the
 * environment — which is the only place the proxy is allowed to read it from.
 * @param {string} keep
 * @param {string[]} args
 * @returns {Record<string, unknown>}
 */
function cli(keep, args) {
  const out = execFileSync(process.execPath, [CLI, 'jev-record', ...args], {
    encoding: 'utf8',
    env: { ...process.env, [KEEP_VAR]: keep, TYPESAFE_API_KEY: KEY },
  });
  return JSON.parse(out);
}

test('start, record, stop, read — the whole loop, with the key nowhere on disk', async () => {
  const keep = mkdtempSync(join(tmpdir(), 'mct-jev-verb-'));
  made.push(keep);

  const api = createServer((req, res) => {
    /** @type {Buffer[]} */
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          answers: { q1: { type: 'noul', noul: 0.91 } },
          usage: { input_tokens: 120, output_tokens: 8 },
        }),
      );
    });
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', () => resolve(undefined)));
  const apiPort = Number(/** @type {{port?: number}} */ (api.address())?.port);
  shutdowns.push(
    () =>
      new Promise((resolve) => {
        api.close(() => resolve(undefined));
        api.closeAllConnections?.();
      }),
  );

  // `--idle` bounds the child, so a failing assertion below cannot leave a proxy running.
  const started = cli(keep, ['start', '--endpoint', `http://127.0.0.1:${apiPort}`, '--idle', '30']);
  assert.equal(started.pass, true, `start failed: ${started.reason ?? ''}`);
  assert.match(String(started.url), /^http:\/\/127\.0\.0\.1:\d+$/);
  const session = String(started.session);

  const result = await ask({
    state: 'a state',
    questions: { q1: { type: 'noul', instructions: 'a claim' }, q2: { type: 'noul', instructions: 'another' } },
    key: KEY,
    endpoint: String(started.url),
  });
  assert.equal(result.ok, true);
  assert.equal(Object.keys(result.answers).length, 1);

  const stopped = cli(keep, ['stop', '--session', session]);
  assert.equal(stopped.already, false);

  const read = cli(keep, ['read', '--session', session]);
  assert.equal(read.recorded, 1);
  assert.equal(read.asked, 2);
  assert.equal(read.answered, 1);
  const [summary] = /** @type {Record<string, unknown>[]} */ (read.records);
  assert.equal(summary.status, 200);
  assert.equal(summary.ok, true);
  assert.equal(summary.unanswered, 1);
  assert.deepEqual(summary.usage, { input_tokens: 120, output_tokens: 8 });

  const full = cli(keep, ['read', '--session', session, '--full']);
  const [record] = /** @type {Record<string, unknown>[]} */ (full.records);
  assert.equal(record.v, 1);
  assert.ok(!JSON.stringify(full).includes(KEY), 'no field the reader prints may contain the key');
});

test('read with no recorded session says so as a usage error rather than an empty answer', () => {
  const keep = mkdtempSync(join(tmpdir(), 'mct-jev-verb-'));
  made.push(keep);
  assert.throws(() => cli(keep, ['read']), /Command failed/);
});

test('an unknown subcommand is a usage error', () => {
  const keep = mkdtempSync(join(tmpdir(), 'mct-jev-verb-'));
  made.push(keep);
  assert.throws(() => cli(keep, ['frobnicate']), /Command failed/);
});
