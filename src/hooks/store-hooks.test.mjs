// The ideas hooks, exercised against a real HTTP server on a loopback port.
//
// Each hook is checked on the three outcomes a caller has to tell apart, because the
// caller reads a **line** rather than an exit status: the success line, the line for an
// unset variable, and the line for an error status. A hook that exits non-zero, or prints
// nothing on a failure, turns an unreachable store into a stopped run.
//
// The hooks are run by path rather than through `node`, so the executable bit is part of
// what every case asserts. They are also run **asynchronously**: the store answers on this
// process's event loop, so a synchronous child process would block the very server it is
// waiting on.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const exec = promisify(execFile);

/** Every hook a command calls. `install-hooks`, `pre-tool-use` and `stop` are not these. */
const HOOKS = ['ideas-read.mjs', 'ideas-add.mjs', 'ideas-claim.mjs', 'ideas-mark.mjs'];

/** The variables a hook reads. Cleared for every run so the device's own never leak in. */
const ADDRESS = ['CONCEPTS_URL', 'CONCEPTS_TOKEN', 'IDEAS_URL', 'IDEAS_TOKEN'];

const TOKEN = 'test-token-never-printed';

/** @type {import('node:http').Server[]} */
const servers = [];
/** @type {string[]} */
const dirs = [];
after(async () => {
  for (const server of servers) await new Promise((done) => server.close(done));
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * Stand up a store on a loopback port. `answer` decides the status and payload per request,
 * and every request is recorded so a test can assert what was sent.
 * @param {(req: import('node:http').IncomingMessage, body: any) => [number, any]} answer
 */
async function store(answer) {
  /** @type {{ method: string, url: string, auth?: string, body: any }[]} */
  const seen = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      seen.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization, body });
      const [status, payload] = answer(req, body);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload ?? {}));
    });
  });
  servers.push(server);
  await new Promise((ready) => {
    server.listen({ port: 0, host: '127.0.0.1' }, () => ready(undefined));
  });
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return { origin: `http://127.0.0.1:${port}`, seen };
}

/** Answer every request with one status and one payload. @param {number} status @param {any} [payload] */
function always(status, payload) {
  return () => /** @type {[number, any]} */ ([status, payload]);
}

/**
 * Run a hook the way a command does, with the device's own store variables removed.
 * @param {string} script @param {string[]} args @param {Record<string, string>} [env]
 * @returns {Promise<string>}
 */
async function run(script, args, env = {}) {
  const clean = { ...process.env };
  for (const name of ADDRESS) delete clean[name];
  const { stdout } = await exec(join(HERE, script), args, { encoding: 'utf8', env: { ...clean, ...env } });
  return stdout;
}

/** The status line of a run — the only line a caller reads as the outcome. */
async function first(/** @type {Parameters<typeof run>} */ ...args) {
  return (await run(...args)).split('\n')[0];
}

/** A concepts store at `origin`. @param {string} origin */
function concepts(origin) {
  return { CONCEPTS_URL: origin, CONCEPTS_TOKEN: TOKEN };
}

/** An ideas store at `origin`. @param {string} origin */
function ideas(origin) {
  return { IDEAS_URL: origin, IDEAS_TOKEN: TOKEN };
}

/** A disposable directory. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'mcs-'));
  dirs.push(dir);
  return dir;
}

/** Write the proposals file `ideas-add` takes a path to. @param {any[]} proposals */
function proposalsFile(proposals) {
  const path = join(scratch(), 'proposals.json');
  writeFileSync(path, JSON.stringify(proposals));
  return path;
}

test('every ideas hook is executable, so a command can call it by path', () => {
  for (const hook of HOOKS) {
    assert.equal(statSync(join(HERE, hook)).mode & 0o111, 0o111, `${hook} is not executable`);
  }
});

test('ideas-read: a read reports the count and prints the ledger after it', async () => {
  const rows = { ideas: [{ slug: 'a' }, { slug: 'b' }] };
  const { origin, seen } = await store(always(200, rows));
  const out = await run('ideas-read.mjs', ['--available', '--repo', 'llevasseur/my-command'], ideas(origin));
  assert.equal(out.split('\n')[0], 'read: 200 (2 ideas)');
  assert.deepEqual(JSON.parse(out.split('\n')[1]), rows);
  assert.equal(seen[0].url, '/api/ideas?available=true&repo=llevasseur%2Fmy-command');
});

test('ideas-read: an unset variable names the ideas pair and its documented fallback', async () => {
  const line = await first('ideas-read.mjs', []);
  assert.match(line, /^not read: IDEAS_URL is not set/);
  assert.match(line, /CONCEPTS_URL and CONCEPTS_TOKEN are accepted as fallbacks/);
});

test('ideas-read: the concepts pair is accepted as the documented fallback', async () => {
  const { origin } = await store(always(200, { ideas: [{ slug: 'a' }] }));
  assert.equal(await first('ideas-read.mjs', [], concepts(origin)), 'read: 200 (1 idea)');
});

test('ideas-read: an error status is reported with its short reason', async () => {
  const { origin } = await store(always(401, { error: 'unauthorized' }));
  assert.match(await first('ideas-read.mjs', [], ideas(origin)), /^not read: 401\b/);
});

const PROPOSAL = {
  slug: 'a-new-idea',
  title: 'A new idea',
  rationale: '- what it is',
  evidence: [],
  repo: 'o/r',
  area: 'commands',
};

test('ideas-add: a recorded proposal reports how many of how many landed', async () => {
  const { origin, seen } = await store(always(200, { added: ['a-new-idea'], refused: [], similar: [] }));
  const out = await run('ideas-add.mjs', [proposalsFile([PROPOSAL])], ideas(origin));
  assert.equal(out.split('\n')[0], 'added: 1 of 1');
  assert.deepEqual(seen[0].body, { ideas: [PROPOSAL] });
  assert.deepEqual(JSON.parse(out.split('\n')[1]).added, ['a-new-idea']);
});

test('ideas-add: an unset variable is named', async () => {
  assert.match(await first('ideas-add.mjs', [proposalsFile([PROPOSAL])]), /^not added: IDEAS_URL is not set/);
});

test('ideas-add: an error status is reported with its short reason', async () => {
  const { origin } = await store(always(400, { error: 'an entry cites nothing' }));
  const line = await first('ideas-add.mjs', [proposalsFile([PROPOSAL])], ideas(origin));
  assert.match(line, /^not added: 400\b/);
  assert.match(line, /cites nothing/);
});

test('ideas-claim: a taken idea names the slug and the holder', async () => {
  const { origin, seen } = await store(always(200, { claimed: ['a-new-idea'], refused: [], unknown: [] }));
  const line = await first('ideas-claim.mjs', ['a-new-idea', 'feat/a-new-idea'], ideas(origin));
  assert.equal(line, 'claimed: a-new-idea by feat/a-new-idea');
  assert.deepEqual(seen[0].body, { claims: [{ slug: 'a-new-idea', by: 'feat/a-new-idea' }] });
});

test('ideas-claim: a refusal by a live holder is an answer, not a success', async () => {
  const refused = [{ slug: 'a-new-idea', status: 'claimed', heldBy: 'feat/other', since: '2026-08-11T00:00:00.000Z' }];
  const { origin } = await store(always(200, { claimed: [], refused, unknown: [] }));
  const line = await first('ideas-claim.mjs', ['a-new-idea', 'feat/a-new-idea'], ideas(origin));
  assert.equal(line, 'not claimed: a-new-idea is claimed by feat/other since 2026-08-11T00:00:00.000Z');
});

test('ideas-claim: an unset variable is named', async () => {
  assert.match(await first('ideas-claim.mjs', ['a-new-idea', 'feat/x']), /^not claimed: IDEAS_URL is not set/);
});

test('ideas-claim: an error status is reported with its short reason', async () => {
  const { origin } = await store(always(401, { error: 'unauthorized' }));
  assert.match(await first('ideas-claim.mjs', ['a-new-idea', 'feat/x'], ideas(origin)), /^not claimed: 401\b/);
});

test('ideas-mark: a marked idea names the slug and its new status', async () => {
  const { origin, seen } = await store(always(200, { updated: ['a-new-idea'], unknown: [] }));
  const args = ['a-new-idea', 'shipped', 'https://github.com/o/r/pull/1'];
  assert.equal(await first('ideas-mark.mjs', args, ideas(origin)), 'marked: a-new-idea is shipped');
  assert.deepEqual(seen[0].body.marks, [{ slug: 'a-new-idea', status: 'shipped', note: args[2] }]);
});

test('ideas-mark: an unset variable is named', async () => {
  assert.match(await first('ideas-mark.mjs', ['a-new-idea', 'accepted']), /^not marked: IDEAS_URL is not set/);
});

test('ideas-mark: an error status is reported with its short reason', async () => {
  const { origin } = await store(always(404, { error: 'no such idea' }));
  assert.match(await first('ideas-mark.mjs', ['a-new-idea', 'accepted'], ideas(origin)), /^not marked: 404\b/);
});

test('ideas-mark: a status the ledger does not accept costs no round trip', async () => {
  const { origin, seen } = await store(always(200, { updated: ['a-new-idea'] }));
  const line = await first('ideas-mark.mjs', ['a-new-idea', 'done'], ideas(origin));
  assert.match(line, /^not marked: status must be one of /);
  assert.equal(seen.length, 0);
});

test('ideas-mark: a rejection with no reason is refused here rather than spent as a 400', async () => {
  const { origin, seen } = await store(always(200, { updated: ['a-new-idea'] }));
  const line = await first('ideas-mark.mjs', ['a-new-idea', 'rejected'], ideas(origin));
  assert.equal(line, 'not marked: a rejected mark needs a note saying why');
  assert.equal(seen.length, 0);
});

test('the token is sent as a bearer header and never printed', async () => {
  const { origin, seen } = await store(always(200, { ideas: [] }));
  const out = await run('ideas-read.mjs', [], ideas(origin));
  assert.equal(seen[0].auth, `Bearer ${TOKEN}`);
  assert.ok(!out.includes(TOKEN), 'the token reached stdout');
});

test('every hook exits 0 and prints a status line on an unreachable store', async () => {
  // Port 1 on loopback refuses instantly, so this is the network-error path rather than a
  // status. An unreachable store is a stated skip, so the exit code stays 0 throughout.
  const dead = 'http://127.0.0.1:1';
  /** @type {[string, string[], Record<string, string>, string][]} */
  const cases = [
    ['ideas-read.mjs', [], ideas(dead), 'not read: '],
    ['ideas-add.mjs', [proposalsFile([PROPOSAL])], ideas(dead), 'not added: '],
    ['ideas-claim.mjs', ['a', 'feat/x'], ideas(dead), 'not claimed: '],
    ['ideas-mark.mjs', ['a', 'accepted'], ideas(dead), 'not marked: '],
  ];
  for (const [script, args, env, prefix] of cases) {
    // exec rejects on a non-zero exit, so reaching the assertion is the exit-0 check.
    const line = await first(script, args, env);
    assert.ok(line.startsWith(prefix), `${script} printed ${JSON.stringify(line)}`);
    assert.ok(line.length > prefix.length, `${script} named no cause`);
  }
});
