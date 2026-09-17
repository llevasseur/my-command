// The sweep's two guarantees are the ones worth pinning: it recognises the sessions this
// repo opens, and it refuses to touch anything else. Both are decided by pure functions
// over a `ps` listing, so they are tested against recorded output rather than live daemons.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MINUTES, etimeSeconds, isOurs, parsePs, sessionName, slug } from './browser.mjs';

const NODE = '/Users/x/.nvm/versions/node/v26.3.0/bin/node';
const DAEMON =
  '/Users/x/.nvm/versions/node/v26.3.0/lib/node_modules/@playwright/cli/node_modules/playwright-core/lib/entry/cliDaemon.js';

/** @param {number} pid @param {string} etime @param {string} session */
const row = (pid, etime, session) =>
  `${pid.toString().padStart(6)} ${'1'.padStart(6)} ${etime} ${NODE} ${DAEMON} ${session}`;

test('a session name is derived from the branch and the round', () => {
  assert.equal(sessionName('fix/playwright-daemon-leak', 1), 'mc-fix-playwright-daemon-leak-r1');
  assert.equal(sessionName('feat/A_B', 12), 'mc-feat-a-b-r12');
  // Same inputs, same name: that is what lets a later sweep recognise a dead run's session.
  assert.equal(sessionName('main', 3), sessionName('main', 3));
});

test('a slug stays addressable however the branch was spelled', () => {
  assert.equal(slug('a'.repeat(80)).length, 32);
  assert.equal(slug('///'), 'nobranch');
  // A cap landing mid-separator must not leave a trailing dash the pattern would reject.
  assert.ok(isOurs(sessionName(`${'a'.repeat(32)}/b`, 1)));
});

test('only this scheme is ours', () => {
  for (const name of ['mc-main-r1', 'mc-fix-a-b-r12']) assert.equal(isOurs(name), true);
  // Every ad-hoc name measured in the leak, plus the two a human most likely drives.
  for (const name of ['verify', 'verify2', 'verify4', 'nexusverify', 'hb', 'default', 'admin', 'md5', 'nexus', 'warmv'])
    assert.equal(isOurs(name), false);
  // Near-misses: a prefix collision and a missing round are both somebody else's session.
  for (const name of ['mcmain-r1', 'mc-main', 'mc-main-rX', 'x-mc-main-r1']) assert.equal(isOurs(name), false);
});

test('elapsed time parses in every shape ps prints', () => {
  assert.equal(etimeSeconds('01:30'), 90);
  assert.equal(etimeSeconds('23:02:12'), 82932);
  assert.equal(etimeSeconds(' 02-03:31:55 '), 185515);
  assert.equal(etimeSeconds('garbage'), null);
});

test('a ps listing yields each daemon with its session and age', () => {
  const { daemons } = parsePs([row(31192, '23:02:12', 'verify4'), row(97636, '01-00:16:18', 'mc-main-r2')].join('\n'));
  assert.deepEqual(
    daemons.map((d) => [d.session, d.ageSeconds]),
    [
      ['verify4', 82932],
      ['mc-main-r2', 87378],
    ],
  );
});

test('a listing with no daemon in it yields none', () => {
  const { daemons } = parsePs('     1      0 02-05:29:16 /sbin/launchd\n   327      1 02-05:28:48 /usr/libexec/logd');
  assert.deepEqual(daemons, []);
});

test('an unreadable age counts as brand new, so a sweep never reaps on a guess', () => {
  const { daemons } = parsePs(row(4, 'not-a-time', 'mc-main-r1'));
  assert.equal(daemons[0].ageSeconds, 0);
  assert.ok(daemons[0].ageSeconds < DEFAULT_MINUTES * 60);
});

test("the child map reaches a daemon's whole Chrome tree", () => {
  const { children } = parsePs(
    [
      row(500, '01:00', 'mc-main-r1'),
      '   501    500 00:59 /Applications/Chromium.app/Contents/MacOS/Chromium --type=renderer',
    ].join('\n'),
  );
  assert.deepEqual(children.get(500), [501]);
});
