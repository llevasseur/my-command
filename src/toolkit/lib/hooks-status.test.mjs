// The check that says whether the gates are armed. Its whole value is the negative case:
// the gates shipped, were pulled, and never executed, and nothing on the device said so.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { install } from '../../hooks/install-hooks.mjs';
import { hooksStatus } from './hooks-status.mjs';

const REPO_HOOKS = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'hooks');

/** @type {string[]} */
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'mcs-'));
  made.push(dir);
  return dir;
}

/** A device root with the real fragment and a settings file, wired however the test wants. */
function device() {
  const dir = scratch();
  const hooksSrc = join(dir, 'checkout', 'src', 'hooks');
  mkdirSync(hooksSrc, { recursive: true });
  // The real fragment, so the check is held to what actually ships.
  copyFileSync(join(REPO_HOOKS, 'settings-fragment.json'), join(hooksSrc, 'settings-fragment.json'));
  for (const script of ['pre-tool-use.mjs', 'stop.mjs']) writeFileSync(join(hooksSrc, script), '// stub\n');
  // A clone install: the fix is the installer script, and it only exists in a checkout.
  mkdirSync(join(dir, 'checkout', 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'checkout', 'scripts', 'install-personal.sh'), '# stub\n');
  const hooksDir = join(dir, 'claude', 'my-command', 'hooks');
  mkdirSync(dirname(hooksDir), { recursive: true });
  return {
    hooksSrc,
    hooksDir,
    settingsPath: join(dir, 'claude', 'settings.json'),
    fragmentPath: join(hooksSrc, 'settings-fragment.json'),
  };
}

/**
 * A wizard-installed device: the scripts were copied to `<config>/my-command/hooks` and the
 * toolkit runs from beside them, so hooksDir *is* hooksSrc and there is no checkout anywhere.
 */
function wizardDevice() {
  const dir = scratch();
  const hooksDir = join(dir, 'claude', 'my-command', 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  copyFileSync(join(REPO_HOOKS, 'settings-fragment.json'), join(hooksDir, 'settings-fragment.json'));
  for (const script of ['pre-tool-use.mjs', 'stop.mjs', 'install-hooks.mjs']) {
    writeFileSync(join(hooksDir, script), '// stub\n');
  }
  return {
    hooksSrc: hooksDir,
    hooksDir,
    settingsPath: join(dir, 'claude', 'settings.json'),
    fragmentPath: join(hooksDir, 'settings-fragment.json'),
  };
}

test('unregistered gates report armed: false, name what is missing, and give the fix', () => {
  const d = device();
  // A settings file with a foreign hook and nothing of ours — the recorded device state.
  writeFileSync(
    d.settingsPath,
    JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: '~/.claude/hooks/block-env.sh' }] }],
      },
    }),
  );

  const status = hooksStatus(d);
  assert.equal(status.armed, false);
  assert.equal(status.gates.length, 2);
  assert.equal(
    status.gates.every((/** @type {{registered: boolean}} */ g) => g.registered === false),
    true,
  );
  assert.equal(status.missing.length, 2);
  assert.match(status.missing.join(' '), /PreToolUse.*pre-tool-use\.mjs/s);
  assert.match(status.reason, /files nobody executes/);
  assert.match(status.hint, /install-personal\.sh/);
  // The link is absent too, which is the other half of the same failure.
  assert.equal(status.link.kind, 'missing');
  assert.equal(status.link.pointsAtCheckout, false);
});

test('a missing settings file is armed: false rather than an error', () => {
  const d = device();
  const status = hooksStatus(d);
  assert.equal(status.armed, false);
  assert.equal(status.settingsReadable, true);
});

test('unparseable settings is reported as such, not as registered', () => {
  const d = device();
  writeFileSync(d.settingsPath, '{ not json');
  const status = hooksStatus(d);
  assert.equal(status.armed, false);
  assert.equal(status.settingsReadable, false);
  assert.match(status.reason, /not valid JSON/);
});

test('the installer’s own output reads back as armed, with the link pointing at the checkout', () => {
  const d = device();
  install({ hooksDir: d.hooksDir, settingsPath: d.settingsPath, uninstall: false });
  symlinkSync(d.hooksSrc, d.hooksDir);

  const status = hooksStatus(d);
  assert.equal(status.armed, true);
  assert.deepEqual(status.missing, []);
  assert.equal(status.link.kind, 'symlink');
  assert.equal(status.link.pointsAtCheckout, true);
  assert.equal(status.reason, null);
  assert.equal(status.hint, null);
});

test('a stale real directory is armed but flagged as not tracking the checkout', () => {
  const d = device();
  install({ hooksDir: d.hooksDir, settingsPath: d.settingsPath, uninstall: false });
  mkdirSync(d.hooksDir, { recursive: true });

  const status = hooksStatus(d);
  assert.equal(status.armed, true);
  assert.equal(status.link.kind, 'directory');
  assert.equal(status.link.pointsAtCheckout, false);
  assert.match(status.reason, /does not point at/);
  assert.match(status.hint, /install-personal\.sh/);
});

// The hint used to be a hardcoded `bash <…>/scripts/install-personal.sh`. That script only
// exists inside a git checkout, so the device the wizard installs — the one most users have —
// was told to run a path that is not there. The fix has to follow the install surface.
test('a wizard-installed device is told to re-run the merge it actually has', () => {
  const d = wizardDevice();

  const status = hooksStatus(d);
  assert.equal(status.armed, false);
  assert.equal(status.hint, `node ${join(d.hooksDir, 'install-hooks.mjs')}`);
  assert.doesNotMatch(status.hint, /install-personal\.sh/);
});

test('copied-in-place gates read as current, not as a stale copy git pull cannot update', () => {
  const d = wizardDevice();
  install({ hooksDir: d.hooksDir, settingsPath: d.settingsPath, uninstall: false });

  const status = hooksStatus(d);
  assert.equal(status.armed, true);
  // Not a symlink, and correct anyway: the wizard copies rather than links on purpose.
  assert.equal(status.link.pointsAtCheckout, false);
  assert.equal(status.reason, null);
  assert.equal(status.hint, null);
});

test('no hook bundle anywhere points at the wizard rather than at a missing script', () => {
  const d = wizardDevice();
  rmSync(join(d.hooksDir, 'install-hooks.mjs'));

  assert.equal(hooksStatus(d).hint, 'npx @llevasseur/my-command');
});

test('uninstalling drops back to armed: false', () => {
  const d = device();
  install({ hooksDir: d.hooksDir, settingsPath: d.settingsPath, uninstall: false });
  install({ hooksDir: d.hooksDir, settingsPath: d.settingsPath, uninstall: true });
  assert.equal(hooksStatus(d).armed, false);
});
