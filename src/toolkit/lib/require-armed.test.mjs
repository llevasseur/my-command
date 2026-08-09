// The arming gate, exercised through the CLI entry point rather than around it: what
// matters is the exit code a workflow command actually sees.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { install } from '../../hooks/install-hooks.mjs';
import { main } from '../cli.mjs';
import { armingEscape, GATED_VERBS } from './require-armed.mjs';

const REPO_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

/** @type {string[]} */
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A device whose Claude config lives somewhere disposable. @returns {string} */
function device() {
  const dir = mkdtempSync(join(tmpdir(), 'mcra-'));
  made.push(dir);
  return dir;
}

/**
 * Run the CLI with a chosen environment, swallowing its JSON so the test output stays the
 * assertions. Returns the exit code and what it printed.
 * @param {string[]} argv @param {Record<string, string | undefined>} env
 * @returns {{code: number, out: string}}
 */
function cli(argv, env) {
  const previous = { ...process.env };
  let out = '';
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (/** @type {any} */ chunk) => {
    out += chunk;
    return true;
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return { code: main(argv), out };
  } finally {
    process.stdout.write = write;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
}

/**
 * A `state` call that can only fail at the gate. `--base HEAD` is what makes it so: CI
 * checks out a PR merge ref with no `origin/<default>` to resolve, and `state` refuses to
 * invent a base it does not have — so without it, a passed gate still exits 1 here.
 */
const RUNS = ['state', '--cwd', REPO_ROOT, '--compact', '--base', 'HEAD'];

const unarmedEnv = () => ({
  CLAUDE_CONFIG_DIR: device(),
  MY_COMMAND_HOOKS: undefined,
  MY_COMMAND_REQUIRE_HOOKS: undefined,
  CODEX_HOME: join(device(), 'codex'),
});

test('a gated verb exits non-zero on a device whose gates are not armed', () => {
  const { code, out } = cli(['state', '--cwd', REPO_ROOT, '--compact'], unarmedEnv());

  assert.equal(code, 1);
  const answer = JSON.parse(out);
  assert.equal(answer.armed, false);
  assert.match(answer.error, /gates are not armed/);
  // The refusal has to carry the fix and the way out, or it is a wall rather than a gate.
  assert.equal(typeof answer.arm, 'string');
  assert.match(answer.escape, /MY_COMMAND_REQUIRE_HOOKS=0/);
  // The verb never ran: no state payload came back with the error.
  assert.equal(answer.branch, undefined);
});

test('every gated verb refuses, and an ungated one still answers', () => {
  for (const verb of GATED_VERBS) {
    const { code, out } = cli([verb, '--cwd', REPO_ROOT, '--compact'], unarmedEnv());
    assert.equal(code, 1, `${verb} should refuse`);
    // Assert the refusal, not merely the exit code: a verb that failed for its own reasons
    // exits 1 too, and would make this pass while the gate did nothing.
    assert.equal(JSON.parse(out).armed, false, `${verb} should refuse at the gate`);
  }
  // `doctor` is how a stuck device finds out what to run, so it can never be gated.
  assert.equal(cli(['doctor', '--compact'], unarmedEnv()).code, 0);
});

test('a gated verb exits zero once the gates are registered', () => {
  const dir = device();
  install({ hooksDir: join(dir, 'my-command', 'hooks'), settingsPath: join(dir, 'settings.json'), uninstall: false });

  const { code, out } = cli(RUNS, {
    CLAUDE_CONFIG_DIR: dir,
    MY_COMMAND_HOOKS: undefined,
    MY_COMMAND_REQUIRE_HOOKS: undefined,
    CODEX_HOME: join(device(), 'codex'),
  });

  assert.equal(code, 0);
  // The verb ran for real: its own payload came back, not the gate's refusal.
  const answer = JSON.parse(out);
  assert.equal(typeof answer.root, 'string');
  assert.equal(answer.error, undefined);
});

test('each escape is explicit, and none of them is the default', () => {
  assert.equal(armingEscape({}, {}), null);
  assert.equal(armingEscape({}, { MY_COMMAND_REQUIRE_HOOKS: '1' }), null);
  assert.equal(armingEscape({ unarmed: true }, {}), '--unarmed');
  assert.equal(armingEscape({}, { MY_COMMAND_REQUIRE_HOOKS: '0' }), 'MY_COMMAND_REQUIRE_HOOKS=0');
  assert.equal(armingEscape({}, { MY_COMMAND_HOOKS: 'off' }), 'MY_COMMAND_HOOKS=0');
});

test('the escapes let a hook-less environment through', () => {
  for (const [argv, env] of /** @type {[string[], Record<string, string | undefined>][]} */ ([
    [[...RUNS, '--unarmed'], {}],
    [RUNS, { MY_COMMAND_REQUIRE_HOOKS: '0' }],
    [RUNS, { MY_COMMAND_HOOKS: '0' }],
  ])) {
    const { code, out } = cli(argv, { ...unarmedEnv(), ...env });
    assert.equal(code, 0, `${argv.join(' ')} ${JSON.stringify(env)} → ${out}`);
  }
});
