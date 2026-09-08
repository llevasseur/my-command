// `doctor`'s Playwright probe: the probe order, that a missing binary is an answer rather
// than a throw, and that the time bound is real.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { boundedProbe, run as doctor, PLAYWRIGHT_INSTALL_HINT, PLAYWRIGHT_PROBES, playwright } from './doctor.mjs';

/**
 * A stub runner over a map of `cmd` to canned output, recording what it was asked.
 * @param {Record<string, string>} answers
 */
function stub(answers) {
  /** @type {string[][]} */
  const calls = [];
  /** @param {string} cmd @param {string[]} args */
  const runner = (cmd, args) => {
    calls.push([cmd, ...args]);
    const stdout = answers[cmd];
    return stdout === undefined ? { ok: false, stdout: '' } : { ok: true, stdout };
  };
  return { runner, calls };
}

test('the global CLI answers first and nothing else is probed', () => {
  const { runner, calls } = stub({ 'playwright-cli': 'Version 1.49.0\n', npx: '1.40.0\n' });
  assert.deepEqual(playwright(runner), { installed: true, version: '1.49.0', source: 'playwright-cli' });
  // The second probe must not run once the first resolved.
  assert.equal(calls.length, 1);
});

test('npx answers when the global CLI is absent', () => {
  const { runner, calls } = stub({ npx: '1.40.0\n' });
  assert.deepEqual(playwright(runner), { installed: true, version: '1.40.0', source: 'npx' });
  assert.equal(calls.length, 2);
});

test('neither probe resolving is a report, not a failure', () => {
  const { runner } = stub({});
  assert.deepEqual(playwright(runner), { installed: false, version: null, source: null });
});

test('a zero exit that printed no version keeps looking', () => {
  const { runner } = stub({ 'playwright-cli': '  \n', npx: '1.40.0\n' });
  assert.deepEqual(playwright(runner), { installed: true, version: '1.40.0', source: 'npx' });
});

test('the npx probe never installs', () => {
  const npx = PLAYWRIGHT_PROBES.find((p) => p.source === 'npx');
  assert.ok(npx, 'the npx probe is registered');
  assert.ok(npx.args.includes('--no-install'));
  // Every probe is a version read and nothing else.
  for (const p of PLAYWRIGHT_PROBES) assert.ok(p.args.includes('--version'));
  // The installer echoes the hint, so it must stay a single command.
  assert.ok(!PLAYWRIGHT_INSTALL_HINT.includes('\n'));
});

test('a missing binary is answered rather than thrown', () => {
  assert.deepEqual(boundedProbe('my-command-no-such-binary-xyz', ['--version']), { ok: false, stdout: '' });
});

test('a probe that would hang is abandoned at its bound', () => {
  const started = Date.now();
  const r = boundedProbe(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], 300);
  assert.equal(r.ok, false);
  // Generous headroom over the 300ms bound: the assertion is "bounded", not "prompt".
  assert.ok(Date.now() - started < 10_000, 'the probe returned well before the child would have');
});

test('the marketplace installer prints that command, and installs nothing', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const installer = readFileSync(join(repoRoot, 'scripts', 'install-marketplace-personal.sh'), 'utf8');
  // Pinned to the export so the two cannot drift apart.
  assert.ok(installer.includes(PLAYWRIGHT_INSTALL_HINT), 'the installer names the hint verbatim');
  // Every line mentioning Playwright must be a comment, the hint's own assignment, an
  // `echo`, or the non-installing `doctor` probe — never an install.
  for (const line of installer.split('\n')) {
    if (!/playwright/i.test(line)) continue;
    assert.ok(
      /^\s*#/.test(line) ||
        /^\s*PLAYWRIGHT_HINT=/.test(line) ||
        line.includes('echo') ||
        line.includes('playwright_state') ||
        /"playwright":/.test(line),
      `no line may install Playwright: ${line}`,
    );
  }
  // No browser download, in any wording.
  assert.doesNotMatch(installer, /playwright\s+install/);
});

test('doctor reports the playwright object on this device, whatever it holds', () => {
  const result = /** @type {{playwright: {installed: boolean, version: string | null, source: string | null}}} */ (
    doctor()
  );
  const { installed, version, source } = result.playwright;
  // The three fields agree either way: a probe that resolved names a version and itself,
  // one that did not nulls both.
  if (installed === true) {
    assert.ok(version !== null && version.length > 0, 'an installed Playwright names a version');
    assert.ok(
      PLAYWRIGHT_PROBES.some((p) => p.source === source),
      `source names a probe: ${source}`,
    );
  } else {
    assert.equal(installed, false);
    assert.equal(version, null);
    assert.equal(source, null);
  }
});
