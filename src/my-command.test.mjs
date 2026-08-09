// The wizard's hooks step. Its whole reason to exist is the negative case it closes: the
// gate bundle shipped complete, and every device installed with `npx @llevasseur/my-command`
// still reported `hooks.armed: false`, because the wizard installed the commands and the
// toolkit and nothing else. So these tests assert the two halves that make a gate real —
// executable scripts on the device, and a registration in the settings file the harness
// reads — never against the real ~/.claude.
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUILT = join(REPO_ROOT, 'dist', 'my-command.js');
assert.ok(existsSync(BUILT), `${BUILT} is missing — run \`pnpm build\` before \`pnpm test\``);
const { installHooks } = await import(BUILT);

/** @type {string[]} */
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway `<config>/my-command` root, shaped exactly like deviceRoot() returns. */
function scratchRoot() {
  const config = mkdtempSync(join(tmpdir(), 'mcw-'));
  made.push(config);
  const root = join(config, 'my-command');
  mkdirSync(root, { recursive: true });
  return { root, settingsPath: join(config, 'settings.json') };
}

/** @param {string} path */
function readSettings(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Every hook command the settings file registers, flattened across events. */
function commandsIn(/** @type {Record<string, any>} */ settings) {
  return Object.values(settings.hooks ?? {}).flatMap((list) =>
    (Array.isArray(list) ? list : []).flatMap((entry) => (entry.hooks ?? []).map((h) => h.command)),
  );
}

test('installs the hook scripts executable and registers them in settings.json', async () => {
  const { root, settingsPath } = scratchRoot();

  const result = await installHooks(root, settingsPath);

  assert.equal(result.installed, true, result.reason);
  assert.equal(result.hooksDir, join(root, 'hooks'));
  assert.equal(result.symlinked, false);

  // The harness executes these directly, so a lost mode bit turns the gate off silently.
  for (const script of ['pre-tool-use.mjs', 'stop.mjs', 'install-hooks.mjs']) {
    const path = join(root, 'hooks', script);
    assert.ok(existsSync(path), `${script} did not land on the device`);
    assert.ok(statSync(path).mode & 0o111, `${script} landed without its executable bit`);
  }

  // The fragment is what install-hooks.mjs merges from; the lib is what the scripts import.
  assert.ok(existsSync(join(root, 'hooks', 'settings-fragment.json')));
  assert.ok(existsSync(join(root, 'hooks', 'lib', 'io.mjs')));

  // Tests belong to CI, not the device — the same rule the toolkit install applies.
  assert.ok(!existsSync(join(root, 'hooks', 'hooks.test.mjs')));

  // The other half: a script the settings file does not name is a file nobody executes.
  const settings = readSettings(settingsPath);
  assert.deepEqual(Object.keys(settings.hooks).sort(), ['PreToolUse', 'Stop']);
  assert.deepEqual(commandsIn(settings).sort(), [
    join(root, 'hooks', 'pre-tool-use.mjs'),
    join(root, 'hooks', 'stop.mjs'),
  ]);
  assert.equal(result.registered, 2);

  // The read-only allowlist ships with the gates: routine probes that stop to ask are what
  // push a run toward composing the one big chained command the classifier then refuses.
  assert.ok(settings.permissions.allow.includes('Bash(my-command-tools:*)'));
  assert.ok(result.allowAdded > 0);
});

test('re-running replaces its own entries and leaves foreign hooks and settings alone', async () => {
  const { root, settingsPath } = scratchRoot();
  const foreign = '~/.claude/hooks/block-env.sh';
  writeFileSync(
    settingsPath,
    JSON.stringify({
      model: 'opus',
      permissions: { allow: ['Bash(ls:*)'], deny: ['Bash(rm:*)'] },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: foreign }] }] },
    }),
  );

  await installHooks(root, settingsPath);
  const second = await installHooks(root, settingsPath);
  assert.equal(second.installed, true, second.reason);

  const settings = readSettings(settingsPath);
  const ours = commandsIn(settings).filter((c) => c.startsWith(root));
  assert.equal(ours.length, 2, 'a re-run stacked a second copy of the same gates');

  // A hook the user registered independently, and every unrelated setting, survive.
  assert.ok(commandsIn(settings).includes(foreign));
  assert.equal(settings.model, 'opus');
  assert.deepEqual(settings.permissions.deny, ['Bash(rm:*)']);
  assert.ok(settings.permissions.allow.includes('Bash(ls:*)'));
  // Additive and deduped: the allowlist is not widened twice by a second run.
  assert.equal(new Set(settings.permissions.allow).size, settings.permissions.allow.length);
});

test('a hooks directory symlinked into a checkout is registered, never copied over', async () => {
  const { root, settingsPath } = scratchRoot();
  const checkout = join(REPO_ROOT, 'src', 'hooks');
  symlinkSync(checkout, join(root, 'hooks'));

  const result = await installHooks(root, settingsPath);

  assert.equal(result.installed, true, result.reason);
  assert.equal(result.symlinked, true);
  // Writing through the link would have written into the clone, and copying skips the tests
  // — so the test file still being there is the proof nothing was copied over it.
  assert.ok(lstatSync(join(root, 'hooks')).isSymbolicLink());
  assert.ok(existsSync(join(checkout, 'hooks.test.mjs')));
  assert.equal(commandsIn(readSettings(settingsPath)).length, 2);
});

test('a missing hook bundle reports itself instead of throwing', async () => {
  const { root, settingsPath } = scratchRoot();
  // installHooks resolves its payload from the package it ships in, so the only way to see
  // the failure path here is to make the write fail: a file where the directory must go.
  writeFileSync(join(root, 'hooks'), 'not a directory\n');

  const result = await installHooks(root, settingsPath);

  assert.equal(result.installed, false);
  assert.ok(result.reason, 'a failure must say why, not just report false');
  assert.ok(!existsSync(settingsPath), 'a failed hooks install must not write settings.json');
});
