// `app start|stop` against a throwaway repo running a real server, because the two things
// that matter here are only true at runtime: the port is read back out of the startup log
// rather than assumed from PORT, and stopping twice is not an error.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { flagsFrom } from '../lib/flags.mjs';
import { run as app, portFromLog, runContract } from './app.mjs';

/** @type {string[]} */
const made = [];

after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'mct-app-'));
  made.push(dir);
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q', '-b', 'main']);
  const appDir = join(dir, '.app-records');
  mkdirSync(appDir, { recursive: true });
  process.env.MY_COMMAND_APP_DIR = appDir;
  return dir;
}

/** @param {string} cwd @param {string[]} positionals @param {Record<string, string | true | string[]>} flags */
const ctx = (cwd, positionals = [], flags = {}) =>
  /** @type {never} */ ({ verb: 'app', cwd, positionals, flags: flagsFrom(flags) });

/**
 * A server that binds port 0 and announces the port it actually got. Deliberately not the
 * PORT it was handed: that is the case `start` has to survive, and a server that obeyed PORT
 * would let a broken log parse still pass.
 * @param {string} dir
 */
function writeServer(dir) {
  writeFileSync(
    join(dir, 'server.mjs'),
    [
      "import { createServer } from 'node:http';",
      "const s = createServer((_req, res) => { res.writeHead(200); res.end('ok'); });",
      "s.listen(0, '127.0.0.1', () => console.log(`ready at http://localhost:${s.address().port}/`));",
      '',
    ].join('\n'),
  );
}

test('portFromLog reads the bound port out of a startup line', () => {
  const dir = repo();
  const log = join(dir, 'boot.log');
  writeFileSync(log, 'vite v7\n  ➜  Local:   http://localhost:5199/\n');
  assert.equal(portFromLog(log), 5199);
  writeFileSync(log, 'no url here\n');
  assert.equal(portFromLog(log), null);
});

test('a repo with no bootstrap script declares no run contract', () => {
  assert.equal(runContract(repo()), null);
});

test('start boots the app, reports the port the log announced, and stop is idempotent', async () => {
  const dir = repo();
  writeServer(dir);

  const started = await app(ctx(dir, ['start'], { boot: 'node server.mjs', timeout: '30' }));
  assert.equal(started.healthy, true, `boot was not healthy: ${JSON.stringify(started)}`);
  assert.ok(Number(started.pid) > 0, `no pid recorded: ${JSON.stringify(started)}`);
  // The log's port, not the PORT the spawn requested — the server bound 0 and said so.
  assert.equal(started.port, portFromLog(String(started.log)));
  assert.equal(started.url, `http://localhost:${started.port}`);
  assert.equal(started.bootSource, 'flag');
  assert.equal(started.contract, 'detected');

  const stopped = await app(ctx(dir, ['stop']));
  assert.equal(stopped.already, false);
  assert.ok(/** @type {number[]} */ (stopped.stopped).includes(/** @type {number} */ (started.pid)));

  const again = await app(ctx(dir, ['stop']));
  assert.equal(again.already, true);
  assert.deepEqual(again.stopped, []);
});

test('start reports an unhealthy boot instead of hanging on it', async () => {
  const dir = repo();
  const started = await app(ctx(dir, ['start'], { boot: 'exit 1', timeout: '20' }));
  assert.equal(started.healthy, false);
  assert.ok(String(started.reason).includes('did not answer'));
  await app(ctx(dir, ['stop']));
});

/**
 * A repo whose run contract declares health on :3000 and whose server binds the PORT it is
 * handed, exactly. Nothing in its log names a different port, so only rebasing the contract's
 * health at the start points the probe at the server.
 * @param {string} dir @param {boolean} announce whether the server logs its URL
 */
function writeStrictRepo(dir, announce) {
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  const contract = JSON.stringify({ boot: 'node server.mjs', health: 'http://127.0.0.1:3000/api/health' });
  writeFileSync(
    join(dir, 'scripts', 'bootstrap-worktree.sh'),
    `#!/usr/bin/env bash\nif [ "$1" = "--print-verify-contract" ]; then echo '${contract}'; fi\n`,
  );
  writeFileSync(
    join(dir, 'server.mjs'),
    [
      "import { createServer } from 'node:http';",
      'const port = Number(process.env.PORT);',
      "const s = createServer((req, res) => { res.writeHead(req.url === '/api/health' ? 200 : 404); res.end(); });",
      `s.listen(port, '127.0.0.1', () => { ${announce ? 'console.log(`Local: http://localhost:${port}/`);' : ''} });`,
      '',
    ].join('\n'),
  );
}

for (const announce of [true, false]) {
  test(`start rebases a contract health URL to the requested port (server ${announce ? 'logs it' : 'logs nothing'})`, async () => {
    const dir = repo();
    writeStrictRepo(dir, announce);
    const net = await import('node:net');
    const port = await new Promise((resolve) => {
      const s = net.createServer().listen(0, '127.0.0.1', () => {
        const p = /** @type {import('node:net').AddressInfo} */ (s.address()).port;
        s.close(() => resolve(p));
      });
    });
    assert.notEqual(port, 3000);

    const started = await app(ctx(dir, ['start'], { port: String(port), timeout: '20' }));
    try {
      assert.equal(started.contract, 'declared');
      assert.equal(started.health, `http://127.0.0.1:${port}/api/health`);
      assert.equal(started.port, port);
      assert.equal(started.healthy, true, `boot was not healthy: ${JSON.stringify(started)}`);
    } finally {
      await app(ctx(dir, ['stop']));
    }
  });
}

test('an explicit --health wins over the contract untouched', async () => {
  const dir = repo();
  writeStrictRepo(dir, false);
  const given = 'http://127.0.0.1:1/never';
  const started = await app(ctx(dir, ['start'], { health: given, timeout: '2' }));
  try {
    assert.equal(started.health, given);
    assert.equal(started.healthy, false);
  } finally {
    await app(ctx(dir, ['stop']));
  }
});

test('start refuses a repo with nothing to boot', async () => {
  const dir = repo();
  await assert.rejects(() => app(ctx(dir, ['start'])), /no boot command/);
});
