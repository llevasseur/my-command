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
import { portFromLog, run as app, runContract } from './app.mjs';

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
  assert.ok(typeof started.pid === 'number' && started.pid > 0);
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

test('start refuses a repo with nothing to boot', async () => {
  const dir = repo();
  await assert.rejects(() => app(ctx(dir, ['start'])), /no boot command/);
});
