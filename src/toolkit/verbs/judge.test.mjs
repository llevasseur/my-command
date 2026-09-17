// `judge` verb tests.
//
// Two properties carry the weight here and both are asserted rather than described.
//
// The first is that `--dry-run` makes no network call. It is proven with a `fetch` that throws
// the moment it is touched, so a dry run that reached the network fails the test instead of
// passing it quietly. On its own that proof is weak — a dry run that composed nothing at all
// would also never call fetch — so it is paired with an assertion that the body printed by the
// dry run is byte-identical to the body the live call puts on the wire. Together they say the
// thing ADR 0009 actually needs: what a human reads under `--dry-run` is what would leave.
//
// The second is failing open. A missing key, a refused key and a malformed response each have
// to end in a result that says no answer was obtained and an exit code of 0, and exit codes
// only exist in a real process — so those run the CLI end to end rather than calling `run`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { flagsFrom } from '../lib/flags.mjs';
import { ENDPOINT } from '../lib/jev.mjs';
import { run as judge } from './judge.mjs';

const CLI = fileURLToPath(new URL('../cli.mjs', import.meta.url));

/** A placeholder, never a real credential: it only has to be non-empty to get past the key check. */
const FAKE_KEY = 'not-a-real-key';

/** @type {string[]} */
const made = [];

after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway directory holding a state file, and that file's path. @param {string} body */
function stateFile(body) {
  const dir = mkdtempSync(join(tmpdir(), 'mct-judge-'));
  made.push(dir);
  const path = join(dir, 'state.json');
  writeFileSync(path, body);
  return { dir, path };
}

/** @param {string[]} positionals @param {Record<string, string | true | string[]>} flags */
const ctx = (positionals = [], flags = {}) =>
  /** @type {never} */ ({ verb: 'judge', cwd: process.cwd(), positionals, flags: flagsFrom(flags) });

/** A fetch that fails the test if anything calls it. @type {typeof globalThis.fetch} */
const refuse = () => {
  throw new Error('a network call was made on a path that must make none');
};

/**
 * A fetch that records what it was handed and answers with `body`.
 * @param {Record<string, unknown>} body @param {number} [status]
 */
function recorder(body, status = 200) {
  /** @type {{url: string, init: RequestInit}[]} */
  const calls = [];
  /** @type {typeof globalThis.fetch} */
  const impl = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { impl, calls };
}

/**
 * Run the CLI for real and report what the process did.
 * @param {string[]} args @param {boolean} withKey @param {Record<string, string>} [extra]
 */
function cli(args, withKey = false, extra = {}) {
  const env = { ...process.env };
  // Both gates start from a known-off position, so a value exported in the developer's own
  // shell cannot decide what these tests prove.
  delete env.TYPESAFE_API_KEY;
  delete env.MY_COMMAND_JUDGE;
  if (withKey) env.TYPESAFE_API_KEY = FAKE_KEY;
  Object.assign(env, extra);
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env, stdio: 'pipe' });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = /** @type {{status: number, stdout: string, stderr: string}} */ (err);
    return { code: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

test('--dry-run composes the request and makes no network call', async () => {
  const { path } = stateFile('{"turns": 12, "precis": "the run is mid-edit"}');

  const r = /** @type {Record<string, any>} */ (
    await judge(ctx([], { set: 'trim', 'state-file': path, 'dry-run': true }), refuse)
  );

  assert.equal(r.dryRun, true);
  assert.equal(r.sent, false);
  assert.equal(r.set, 'trim');
  assert.equal(r.kind, 'noul');
  // The state went in as JSON, not as a string of JSON.
  assert.deepEqual(r.request.state, { turns: 12, precis: 'the run is mid-edit' });
  assert.equal(r.request.model, 'jev-latest');
  // Every question in the set, keyed by its own id.
  assert.deepEqual(Object.keys(r.request.questions).sort(), [
    'C1_MID_SEQUENCE',
    'C2_RECOVERABLE',
    'N1_NEGATIVE_EVIDENCE',
    'N3_VERIFIED',
  ]);
  assert.equal(r.questions, 4);
  // The claim and the reading of its poles both reach the endpoint.
  const asked = r.request.questions.C2_RECOVERABLE;
  assert.equal(asked.type, 'noul');
  assert.match(asked.instructions, /A replacement summary can preserve the original goal/);
  assert.match(asked.instructions, /1\.0 means a replacement summary preserves all of it/);
  // Nothing in the printed body is the credential.
  assert.doesNotMatch(JSON.stringify(r), new RegExp(FAKE_KEY));
});

test('the dry-run body is byte-identical to what the live call sends', async () => {
  const { path } = stateFile('{"comment": "// bump i", "code": "i += 1;"}');
  const { impl, calls } = recorder({ answers: {}, usage: { input_tokens: 1, output_tokens: 1 } });

  const dry = /** @type {Record<string, any>} */ (
    await judge(ctx([], { set: 'clean-comment', 'state-file': path, 'dry-run': true }), refuse)
  );

  const previous = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = FAKE_KEY;
  try {
    await judge(ctx([], { set: 'clean-comment', 'state-file': path, judge: true }), impl);
  } finally {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
  }

  assert.equal(calls.length, 1);
  // The whole point of --dry-run as a first-class path: the printed body and the sent body are
  // one value through one function, so reading the first tells you the second.
  assert.equal(calls[0].init.body, JSON.stringify(dry.request));
  assert.equal(dry.requestBytes, Buffer.byteLength(String(calls[0].init.body)));
  // The key travels as a header and never as part of the body.
  const headers = /** @type {Record<string, string>} */ (calls[0].init.headers);
  assert.equal(headers.Authorization, `Bearer ${FAKE_KEY}`);
  assert.doesNotMatch(String(calls[0].init.body), new RegExp(FAKE_KEY));
});

test('a choice set becomes one question whose criteria are the options', async () => {
  const { path } = stateFile('a comment and the code beside it');

  const r = /** @type {Record<string, any>} */ (
    await judge(ctx([], { set: 'clean-comment', 'state-file': path, 'dry-run': true }), refuse)
  );

  assert.equal(r.kind, 'choice');
  assert.equal(r.questions, 1);
  const asked = r.request.questions['clean-comment'];
  assert.equal(asked.type, 'choice');
  assert.match(asked.instructions, /What should \/clean do to this comment\?/);
  assert.deepEqual(Object.keys(asked.criteria).sort(), ['delete', 'keep', 'tighten']);
  for (const rubric of Object.values(asked.criteria)) assert.notEqual(rubric, null);
  // Prose that is not JSON travels as the string it is.
  assert.equal(r.request.state, 'a comment and the code beside it');
  assert.equal(r.state.form, 'text');
});

test('-n is the short spelling of --dry-run even though the parser leaves it a positional', async () => {
  const { path } = stateFile('{"x": 1}');
  const r = /** @type {Record<string, any>} */ (await judge(ctx(['-n'], { set: 'trim', 'state-file': path }), refuse));
  assert.equal(r.dryRun, true);
  assert.equal(r.sent, false);
});

test('every set restates that it acts on nothing', async () => {
  const { path } = stateFile('{"x": 1}');
  for (const set of ['trim', 'clean-comment', 'dispatch-route', 'verify-regression', 'bash-shape']) {
    const r = /** @type {Record<string, any>} */ (
      await judge(ctx([], { set, 'state-file': path, 'dry-run': true }), refuse)
    );
    assert.equal(r.acts, false, `${set} reports acting`);
    assert.deepEqual(r.wiredInto, [], `${set} reports being wired into something`);
    assert.ok(r.questions > 0, `${set} composed no questions`);
  }
});

test('an answered noul carries the confidence its value implies', async () => {
  const { path } = stateFile('{"x": 1}');
  const { impl } = recorder({
    answers: { IS_REGRESSION: { type: 'noul', noul: 0.95 } },
    usage: { input_tokens: 10, output_tokens: 2 },
  });

  const previous = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = FAKE_KEY;
  /** @type {Record<string, any>} */
  let r;
  try {
    r = /** @type {Record<string, any>} */ (
      await judge(ctx([], { set: 'verify-regression', 'state-file': path, judge: true }), impl)
    );
  } finally {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
  }

  assert.equal(r.ok, true);
  assert.equal(r.sent, true);
  assert.equal(r.answered, 1);
  // 0.95 is 0.45 from the middle, so it is inside ADR 0013's band. Asserted with a tolerance:
  // the value is a float and its last bit is not what this test is about.
  assert.ok(Math.abs(r.answers.IS_REGRESSION.confidence - 0.9) < 1e-9);
  assert.equal(r.answers.IS_REGRESSION.highConfidence, true);
  assert.deepEqual(r.usage, { input_tokens: 10, output_tokens: 2 });
});

test('a malformed response answers nothing rather than throwing', async () => {
  const { path } = stateFile('{"x": 1}');
  const { impl } = recorder({ nothing: 'that is not an answers map' });

  const previous = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = FAKE_KEY;
  /** @type {Record<string, any>} */
  let r;
  try {
    r = /** @type {Record<string, any>} */ (
      await judge(ctx([], { set: 'trim', 'state-file': path, judge: true }), impl)
    );
  } finally {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
  }

  assert.equal(r.ok, false);
  assert.equal(r.reason, 'malformed');
  assert.equal(r.answered, 0);
  assert.match(r.note, /never change a run’s outcome/);
});

test('usage errors name what was wrong and never reach the network', async () => {
  const { path } = stateFile('{"x": 1}');
  const { dir } = stateFile('{"x": 1}');

  await assert.rejects(() => judge(ctx([], { 'state-file': path }), refuse), /needs --set/);
  await assert.rejects(() => judge(ctx([], { set: 'trim' }), refuse), /needs --state-file/);
  await assert.rejects(() => judge(ctx([], { set: 'nope', 'state-file': path }), refuse), /no question set named/);
  // A name that would otherwise be joined onto a path and read any JSON on the device.
  await assert.rejects(
    () => judge(ctx([], { set: '../../../etc/hosts', 'state-file': path }), refuse),
    /must be a lowercase slug/,
  );
  await assert.rejects(
    () => judge(ctx([], { set: 'trim', 'state-file': join(dir, 'absent.json') }), refuse),
    /could not be read/,
  );

  const empty = join(dir, 'empty.json');
  writeFileSync(empty, '   \n');
  await assert.rejects(() => judge(ctx([], { set: 'trim', 'state-file': empty }), refuse), /is empty/);
});

test('a usage error carries exit code 2 and still prints JSON on stdout', () => {
  const { path } = stateFile('{"x": 1}');
  const r = cli(['judge', '--set', 'nope', '--state-file', path]);
  assert.equal(r.code, 2);
  assert.equal(r.stderr, '');
  const printed = JSON.parse(r.stdout);
  assert.match(printed.error, /no question set named/);
  assert.ok(printed.available.includes('trim'));
});

test('a missing key exits 0 with a no-answer result rather than erroring', () => {
  const { path } = stateFile('{"x": 1}');
  const r = cli(['judge', '--set', 'trim', '--state-file', path]);

  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  const printed = JSON.parse(r.stdout);
  assert.equal(printed.ok, false);
  assert.equal(printed.reason, 'no-key');
  assert.equal(printed.answered, 0);
  // Called directly, it says so plainly rather than staying silent.
  assert.match(printed.note, /TYPESAFE_API_KEY is not set/);
});

test('the dry run prints parseable JSON on stdout and nothing else', () => {
  const { path } = stateFile('{"x": 1}');
  const r = cli(['judge', '--set', 'trim', '--state-file', path, '--dry-run']);

  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  const printed = JSON.parse(r.stdout);
  assert.equal(printed.dryRun, true);
  assert.equal(printed.sent, false);
  assert.equal(printed.request.model, 'jev-latest');
});

test('judge is registered, and its help is prose rather than JSON', () => {
  assert.match(cli(['help']).stdout, /^ {2}judge$/m);

  const help = cli(['judge', '--help']);
  assert.equal(help.code, 0);
  assert.throws(() => JSON.parse(help.stdout), 'the help is JSON, not prose');
  assert.match(help.stdout, /--dry-run, -n/);
  // The egress is stated in the help itself, not only in the ADR it points at.
  assert.match(help.stdout, /sends the state file's contents to TypeSafe/);
  assert.match(help.stdout, /wired into no command/);
  // Both gates, and the default, are in the help rather than only in the code.
  assert.match(help.stdout, /Two gates, and the default is off/);
  assert.match(help.stdout, /MY_COMMAND_JUDGE=1/);
  // And the thing a later change would be tempted to get wrong.
  assert.match(help.stdout, /Nothing acting is what makes this safe, not shadow mode/);
});

test('the default is off with a key present, and says so rather than sending', () => {
  const { path } = stateFile('{"x": 1}');
  const r = cli(['judge', '--set', 'trim', '--state-file', path], true);

  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  const printed = JSON.parse(r.stdout);
  assert.equal(printed.sent, false, 'a key alone must not send anything');
  assert.equal(printed.reason, 'not-opted-in');
  assert.equal(printed.gate.capable, true);
  assert.equal(printed.gate.optedIn, false);
  assert.equal(printed.gate.enabled, false);
  assert.equal(printed.acted, false);
  assert.match(printed.note, /The default is off with a key present/);
});

test('only an opt-in value switches the environment gate on', () => {
  const { path } = stateFile('{"x": 1}');
  const args = ['judge', '--set', 'trim', '--state-file', path];

  // Off by any value that is not an opt-in, which is the reversed polarity of the hooks
  // disarm. Run end to end, because the exit code is part of what is being claimed.
  for (const off of ['0', 'off', 'no', 'false']) {
    const r = cli(args, true, { MY_COMMAND_JUDGE: off });
    assert.equal(r.code, 0);
    const printed = JSON.parse(r.stdout);
    assert.equal(printed.sent, false, `MY_COMMAND_JUDGE=${off} must not switch the layer on`);
    assert.equal(printed.reason, 'not-opted-in');
  }
});

test('the environment opt-in switches the layer on, exactly as --judge does', async () => {
  const { path } = stateFile('{"x": 1}');
  // In process with an injected fetch rather than through the CLI: the gate being on is the
  // one state in which a real request would leave this machine, so no test puts it there.
  const { impl, calls } = recorder({
    answers: { N3_VERIFIED: { type: 'noul', noul: 0.97 } },
    usage: { input_tokens: 3, output_tokens: 1 },
  });

  const previousKey = process.env.TYPESAFE_API_KEY;
  const previousOptIn = process.env.MY_COMMAND_JUDGE;
  process.env.TYPESAFE_API_KEY = FAKE_KEY;
  process.env.MY_COMMAND_JUDGE = '1';
  /** @type {Record<string, any>} */
  let r;
  try {
    r = /** @type {Record<string, any>} */ (await judge(ctx([], { set: 'trim', 'state-file': path }), impl));
  } finally {
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
    if (previousOptIn === undefined) delete process.env.MY_COMMAND_JUDGE;
    else process.env.MY_COMMAND_JUDGE = previousOptIn;
  }

  assert.equal(r.gate.enabled, true, 'the environment alone is a valid opt-in');
  assert.equal(r.sent, true);
  assert.equal(calls.length, 1);
  assert.equal(r.endpoint, ENDPOINT);
  assert.equal(r.acted, false);
});

test('no key means no send and no mention of the layer, whatever else was asked for', () => {
  const { path } = stateFile('{"x": 1}');
  // Opted in every way there is, and still silent, because capability is the other gate.
  const r = cli(['judge', '--set', 'trim', '--state-file', path, '--judge'], false, { MY_COMMAND_JUDGE: '1' });

  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  const printed = JSON.parse(r.stdout);
  assert.equal(printed.sent, false);
  assert.equal(printed.reason, 'no-key');
  assert.equal(printed.gate.silent, true, 'with no key a caller must say nothing at all');
  assert.equal(printed.endpoint, null, 'nothing was sent, so nothing has a destination');
});

test('the dry run names the host the data would go to', () => {
  const { path } = stateFile('{"x": 1}');
  // Ungated on purpose: reading what would be sent must not require opting in to send it.
  const r = cli(['judge', '--set', 'trim', '--state-file', path, '--dry-run']);

  assert.equal(r.code, 0);
  const printed = JSON.parse(r.stdout);
  assert.equal(printed.sent, false);
  assert.equal(printed.endpoint, ENDPOINT);
  assert.match(printed.endpoint, /^https:\/\/api\.typesafe\.ai\//);
  // The note points at the field rather than leaving a reader to find it.
  assert.match(printed.note, /`endpoint` is where it would go/);
});

test('--shadow records outside the checkout and puts nothing in the repository', async () => {
  const { path } = stateFile('{"comment": "// bump i"}');
  const { path: baseline } = stateFile('{"verdict": "delete"}');
  const root = mkdtempSync(join(tmpdir(), 'mct-judge-keep-'));
  made.push(root);

  const { impl } = recorder({
    answers: { 'clean-comment': { type: 'choice', choice: 'keep', probabilities: { keep: 0.9 }, confidence: 0.9 } },
    usage: { input_tokens: 5, output_tokens: 1 },
  });

  const previousKey = process.env.TYPESAFE_API_KEY;
  const previousKeep = process.env.MY_COMMAND_JUDGE_DIR;
  process.env.TYPESAFE_API_KEY = FAKE_KEY;
  process.env.MY_COMMAND_JUDGE_DIR = root;
  /** @type {Record<string, any>} */
  let r;
  try {
    r = /** @type {Record<string, any>} */ (
      await judge(ctx([], { set: 'clean-comment', 'state-file': path, judge: true, shadow: true, baseline }), impl)
    );
  } finally {
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
    if (previousKeep === undefined) delete process.env.MY_COMMAND_JUDGE_DIR;
    else process.env.MY_COMMAND_JUDGE_DIR = previousKeep;
  }

  assert.equal(r.acted, false, 'a shadow run acts on neither answer');
  assert.ok(String(r.shadowRecord).startsWith(root), 'the record went to the redirected keep');

  const written = JSON.parse(readFileSync(String(r.shadowRecord), 'utf8'));
  assert.equal(written.acted, false);
  // Both answers: the layer's, and the one the path already in place gave.
  assert.deepEqual(written.existing, { verdict: 'delete' });
  assert.equal(written.judge.answers['clean-comment'].choice, 'keep');
  assert.doesNotMatch(readFileSync(String(r.shadowRecord), 'utf8'), new RegExp(FAKE_KEY));
});
