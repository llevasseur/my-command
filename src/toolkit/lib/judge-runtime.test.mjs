// Runtime surface tests.
//
// Three properties carry this ticket and all three are asserted rather than described.
//
// The first is the two gates. A key present means the layer *can* run; an explicit
// per-invocation opt-in means it *does*; and the default with a key present is off. The
// no-key case is checked for silence as well as for refusal, because ADR 0009's promise is
// that a user who never opted in never learns the layer exists — an error message would break
// that as surely as a request would.
//
// The second is failing open at all nine modes. Each one runs a caller twice — once with the
// layer wired in and once with no layer at all — and asserts the two produce byte-identical
// output. That is a stronger statement than "it did not throw": it is the claim a command
// integrating this layer actually needs, which is that its own behaviour is unchanged.
//
// The third is that nothing lands in a repository. The shadow store is exercised for real
// against a redirected keep root, and the checkout is checked for strays afterwards.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createBudget } from './jev.mjs';
import {
  ABSTENTION_FLOOR,
  budgetFrom,
  confidenceOf,
  consult,
  DEFAULT_TOKEN_CAP,
  DESTRUCTIVE_FLOOR,
  FAILURE_MODES,
  gate,
  keepDirFor,
  keepRoot,
  meetsFloor,
  recordShadow,
} from './judge-runtime.mjs';

/** A placeholder, never a real credential: it only has to be non-empty to get past the key check. */
const FAKE_KEY = 'not-a-real-key';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** @type {string[]} */
const made = [];

after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway keep root, so no test writes into a developer's home directory. */
function keep() {
  const dir = mkdtempSync(join(tmpdir(), 'mct-judge-keep-'));
  made.push(dir);
  return dir;
}

/**
 * Run `body` with `MY_COMMAND_JUDGE_DIR` pointed at a throwaway directory, and put the
 * environment back however it ends. The override is the module's own, so this exercises the
 * real store rather than a stand-in for it.
 *
 * It awaits `body` rather than returning its promise: a `finally` that fires on the promise
 * being *returned* restores the variable while the work it was set for is still going, and the
 * record then lands in the developer's own home directory — which is the one outcome the
 * override exists to prevent.
 * @param {(root: string) => unknown} body
 */
async function withKeep(body) {
  const root = keep();
  const previous = process.env.MY_COMMAND_JUDGE_DIR;
  process.env.MY_COMMAND_JUDGE_DIR = root;
  try {
    return await body(root);
  } finally {
    if (previous === undefined) delete process.env.MY_COMMAND_JUDGE_DIR;
    else process.env.MY_COMMAND_JUDGE_DIR = previous;
  }
}

/** An environment carrying a key and nothing else that matters here. */
const keyed = () => ({ TYPESAFE_API_KEY: FAKE_KEY });

/** One noul question, which is all any of these tests needs to ask. */
const QUESTIONS = { KEEP: { type: /** @type {const} */ ('noul'), instructions: 'Is this comment worth keeping?' } };

/** A fetch answering with `body` at `status`. @param {unknown} body @param {number} [status] */
function answers(body, status = 200) {
  /** @type {typeof globalThis.fetch} */
  const impl = async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  return impl;
}

/** A fetch that throws the way an aborted request does. @param {string} name */
function throws(name) {
  /** @type {typeof globalThis.fetch} */
  const impl = async () => {
    const error = new Error('the request ran out of time');
    error.name = name;
    throw error;
  };
  return impl;
}

/** A fetch that fails the test if anything calls it. @type {typeof globalThis.fetch} */
const refuse = () => {
  throw new Error('a network call was made on a path that must make none');
};

test('the two gates are separate questions, and the default is off with a key present', () => {
  // No key: the layer cannot run, and — the half ADR 0009 turns on — the caller says nothing.
  const none = gate({ env: {}, optIn: false });
  assert.equal(none.capable, false);
  assert.equal(none.enabled, false);
  assert.equal(none.silent, true, 'with no key a caller must not even mention the layer');
  assert.equal(none.reason, 'no-key');

  // A key present is capability, not consent. This is the default, and it is off.
  const capable = gate({ env: keyed(), optIn: false });
  assert.equal(capable.capable, true);
  assert.equal(capable.optedIn, false);
  assert.equal(capable.enabled, false, 'the default is off even with a key present');
  assert.equal(capable.reason, 'not-opted-in');
  assert.equal(capable.silent, false);

  // Both gates, by flag and by environment.
  assert.equal(gate({ env: keyed(), optIn: true }).enabled, true);
  assert.equal(gate({ env: { ...keyed(), MY_COMMAND_JUDGE: '1' } }).enabled, true);
  for (const on of ['1', 'on', 'true', 'yes', 'YES', ' 1 ']) {
    assert.equal(gate({ env: { ...keyed(), MY_COMMAND_JUDGE: on } }).enabled, true, `${on} should opt in`);
  }

  // The opt-in is the mirror of the MY_COMMAND_HOOKS=0 disarm, so anything that is not an
  // opt-in leaves the layer off rather than guessing at an intention.
  for (const off of ['0', 'off', 'false', 'no', '', 'yes please', 'maybe']) {
    assert.equal(gate({ env: { ...keyed(), MY_COMMAND_JUDGE: off } }).enabled, false, `${off} should not opt in`);
  }

  // No key wins outright: an opt-in cannot conjure a capability, and the case stays silent.
  const optedInWithoutKey = gate({ env: { MY_COMMAND_JUDGE: '1' }, optIn: true });
  assert.equal(optedInWithoutKey.enabled, false);
  assert.equal(optedInWithoutKey.silent, true);
  assert.equal(optedInWithoutKey.reason, 'no-key');
});

test('a gated-off consult sends nothing at all', async () => {
  for (const env of [{}, keyed(), { MY_COMMAND_JUDGE: '1' }]) {
    const report = await consult({ state: 'x', questions: QUESTIONS, set: 'trim', env, fetchImpl: refuse });
    assert.equal(report.gate.enabled, false);
    assert.equal(report.asked, false, 'a gate that is off must not reach the network');
    assert.equal(report.acted, false);
    assert.deepEqual(report.answers, {});
  }
});

test('a noul threshold reuses the client’s exported band rather than a second definition', () => {
  // A noul carries no confidence field, so its confidence is its own distance from the middle,
  // doubled. 0.5 is a coin toss and reads as nothing at all.
  assert.equal(confidenceOf({ type: 'noul', noul: 0.5 }), 0);
  assert.ok(Math.abs(confidenceOf({ type: 'noul', noul: 0.95 }) - 0.9) < 1e-9);
  assert.ok(Math.abs(confidenceOf({ type: 'noul', noul: 0.05 }) - 0.9) < 1e-9);
  // A choice and a score report one directly.
  assert.equal(confidenceOf({ type: 'choice', choice: 'keep', probabilities: { keep: 1 }, confidence: 0.7 }), 0.7);

  assert.equal(meetsFloor({ type: 'noul', noul: 0.5 }), false);
  assert.equal(meetsFloor({ type: 'noul', noul: 0.75 }, ABSTENTION_FLOOR), true);
  // Per-action, not per-system: the same answer clears the global floor and not the
  // destructive one, which is the whole reason the two numbers are separate.
  assert.equal(meetsFloor({ type: 'noul', noul: 0.75 }, DESTRUCTIVE_FLOOR), false);
  assert.equal(meetsFloor({ type: 'noul', noul: 0.98 }, DESTRUCTIVE_FLOOR), true);
  assert.ok(DESTRUCTIVE_FLOOR > ABSTENTION_FLOOR, 'destructive actions must demand more, never less');
});

test('the spend cap is on by default, conservative, and switched off only by asking', () => {
  assert.equal(budgetFrom({}).cap, DEFAULT_TOKEN_CAP);
  assert.equal(budgetFrom({ MY_COMMAND_JUDGE_TOKEN_CAP: '500' }).cap, 500);
  assert.equal(budgetFrom({ MY_COMMAND_JUDGE_TOKEN_CAP: '0' }).cap, Number.POSITIVE_INFINITY);
  // Nonsense falls back to the conservative default rather than to no cap.
  assert.equal(budgetFrom({ MY_COMMAND_JUDGE_TOKEN_CAP: 'lots' }).cap, DEFAULT_TOKEN_CAP);
  assert.equal(budgetFrom({ MY_COMMAND_JUDGE_TOKEN_CAP: '-5' }).cap, DEFAULT_TOKEN_CAP);
});

test('a run charges its budget from the usage that came back, and stops at the cap', async () => {
  const budget = createBudget(20);
  const impl = answers({
    answers: { KEEP: { type: 'noul', noul: 0.95 } },
    usage: { input_tokens: 20, output_tokens: 5 },
  });

  const first = await consult({
    state: 'x',
    questions: QUESTIONS,
    set: 'trim',
    env: keyed(),
    optIn: true,
    budget,
    fetchImpl: impl,
  });
  assert.equal(first.reason, null);
  assert.equal(budget.spent, 25);

  // 25 of 20 spent, so the next call is refused before it is composed — and the caller sees
  // the same nothing every other failure gives it. The cap is checked, never enforced
  // mid-flight: a response that overshoots is paid for and stops the run after it.
  const second = await consult({
    state: 'x',
    questions: QUESTIONS,
    set: 'trim',
    env: keyed(),
    optIn: true,
    budget,
    fetchImpl: refuse,
  });
  assert.equal(second.reason, 'spend-cap');
  assert.equal(second.acted, false);
  assert.deepEqual(second.answers, {});
});

// The nine ways this layer declines. Each is a fetch (or an environment) that produces exactly
// that mode, paired with the reason `consult` must report for it.
/** @type {{mode: string, env: Record<string, string>, fetchImpl: typeof globalThis.fetch, budget?: import('./jev.mjs').JevBudget}[]} */
const MODES = [
  { mode: 'no-key', env: {}, fetchImpl: refuse },
  { mode: 'bad-key', env: keyed(), fetchImpl: answers({ error: 'nope' }, 401) },
  { mode: 'validation', env: keyed(), fetchImpl: answers({ error: { message: 'bad body' } }, 422) },
  { mode: 'rate-limited', env: keyed(), fetchImpl: answers({}, 429) },
  { mode: 'overloaded', env: keyed(), fetchImpl: answers({}, 529) },
  { mode: 'timeout', env: keyed(), fetchImpl: throws('TimeoutError') },
  { mode: 'malformed', env: keyed(), fetchImpl: answers({ nothing: 'that is not an answers map' }) },
  {
    mode: 'below-threshold',
    env: keyed(),
    // An answer that arrived and said nothing: 0.5 is exactly a coin toss.
    fetchImpl: answers({
      answers: { KEEP: { type: 'noul', noul: 0.5 } },
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  },
  { mode: 'spend-cap', env: keyed(), fetchImpl: refuse, budget: createBudget(0) },
];

/**
 * A caller as it is today: one decision, computed on this device, with no layer anywhere near
 * it. This is the control every layered run below is compared against.
 * @param {string} comment
 */
function decideWithoutLayer(comment) {
  return { verdict: comment.includes('TODO') ? 'keep' : 'delete', comment, chars: comment.length };
}

/**
 * The same caller with the layer wired in as far as ADR 0008 allows: it asks, it may record,
 * and then it computes its decision from the same line of code as the control.
 *
 * The `acted` branch is what makes this a test rather than a tautology. `consult` fixes that
 * field at `false` on every path, so the branch is unreachable — and the assertion that the
 * two callers agree byte for byte is the assertion that it stayed unreachable.
 * @param {string} comment @param {Record<string, unknown>} options
 */
async function decideWithLayer(comment, options) {
  const report = await consult({ state: comment, questions: QUESTIONS, set: 'clean-comment', ...options });
  const decision = report.acted
    ? { verdict: 'the layer changed this', comment, chars: comment.length }
    : decideWithoutLayer(comment);
  return { ...decision, report };
}

test('all nine failure modes leave the caller’s behaviour identical to the no-layer path', async () => {
  const seen = new Set();

  for (const { mode, env, fetchImpl, budget } of MODES) {
    for (const comment of ['// TODO: fix the off-by-one', '// bump i']) {
      const control = decideWithoutLayer(comment);
      const { report, ...layered } = await decideWithLayer(comment, {
        env,
        optIn: true,
        fetchImpl,
        budget,
        // Retries are asserted elsewhere; here they would only make the test wait.
        maxRetries: 0,
        sleep: async () => {},
      });

      assert.equal(report.reason, mode, `${mode}: consult reported ${report.reason}`);
      assert.equal(report.acted, false, `${mode}: something acted on a Jev answer`);
      assert.deepEqual(report.answers, {}, `${mode}: an answer reached the caller`);
      // The claim that matters: same bytes out, layer or no layer.
      assert.equal(
        JSON.stringify(layered),
        JSON.stringify(control),
        `${mode}: the layered caller behaved differently from the no-layer path`,
      );
      seen.add(mode);
    }
  }

  // Every mode the module names is covered, so a tenth added later fails here rather than
  // shipping untested.
  assert.deepEqual([...seen].sort(), [...FAILURE_MODES].sort());
});

test('consult never throws, whatever the transport does', async () => {
  for (const impl of [throws('AbortError'), throws('TypeError'), refuse]) {
    const report = await consult({
      state: 'x',
      questions: QUESTIONS,
      set: 'trim',
      env: keyed(),
      optIn: true,
      fetchImpl: impl,
      maxRetries: 0,
      sleep: async () => {},
    });
    assert.equal(report.acted, false);
    assert.ok(report.reason !== null, 'a failure must name itself');
  }
});

test('the keep root is redirected by its env override and sits outside any checkout', async () => {
  await withKeep((root) => {
    assert.equal(keepRoot(), root);
    assert.equal(keepDirFor('clean-comment'), join(root, 'clean-comment'));
  });
  // Unset, it is the device-wide keep beside the screenshots one — never a working tree.
  const previous = process.env.MY_COMMAND_JUDGE_DIR;
  delete process.env.MY_COMMAND_JUDGE_DIR;
  try {
    assert.match(keepRoot(), /\.my-command\/judge$/);
    assert.ok(!keepRoot().startsWith(REPO_ROOT), 'the keep must never sit inside the checkout');
  } finally {
    if (previous !== undefined) process.env.MY_COMMAND_JUDGE_DIR = previous;
  }
});

test('two records taken in the same instant are two files, not one overwritten', async () => {
  await withKeep((root) => {
    const now = Date.UTC(2026, 8, 17, 12, 0, 0);
    const record = {
      set: 'trim',
      version: '1.0.0',
      acted: /** @type {false} */ (false),
      existing: null,
      judge: {},
      recordedAt: '',
    };
    const first = recordShadow(record, now);
    const second = recordShadow(record, now);
    assert.notEqual(first.file, second.file);
    assert.equal(readdirSync(join(root, 'trim')).length, 2);
  });
});

test('a shadow run records both answers, acts on neither, and leaves the repository alone', async () => {
  await withKeep(async (root) => {
    const impl = answers({
      answers: { KEEP: { type: 'noul', noul: 0.95 } },
      usage: { input_tokens: 12, output_tokens: 3 },
    });

    const report = await consult({
      state: { comment: '// bump i', code: 'i += 1;' },
      questions: QUESTIONS,
      set: 'clean-comment',
      version: '1.0.0',
      // What the path already in place decided. Recorded beside the layer's answer; neither
      // is applied to anything.
      existing: { verdict: 'delete', by: 'the rubric in src/commands/clean.md' },
      shadow: true,
      env: keyed(),
      optIn: true,
      fetchImpl: impl,
    });

    assert.equal(report.acted, false);
    assert.equal(report.reason, null);
    assert.ok(report.recordedAt, 'a shadow run must leave a record');

    const written = JSON.parse(readFileSync(String(report.recordedAt), 'utf8'));
    assert.equal(written.set, 'clean-comment');
    assert.equal(written.acted, false, 'every record restates that nothing acted');
    // Both answers, side by side. That pairing is the whole content of a shadow record.
    assert.deepEqual(written.existing, { verdict: 'delete', by: 'the rubric in src/commands/clean.md' });
    assert.equal(written.judge.answers.KEEP.noul, 0.95);
    assert.equal(written.judge.floor, ABSTENTION_FLOOR);
    // The credential is never part of a record.
    assert.doesNotMatch(readFileSync(String(report.recordedAt), 'utf8'), new RegExp(FAKE_KEY));

    // It landed in the keep, which is outside every checkout.
    assert.ok(String(report.recordedAt).startsWith(root));
    assert.ok(!String(report.recordedAt).startsWith(REPO_ROOT));
  });

  // Nothing from a shadow run reached the working tree. Asked of git itself rather than
  // inferred from the path, because the path is the thing under test.
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' });
  for (const line of status.split('\n').filter(Boolean)) {
    assert.doesNotMatch(line, /\.my-command\//, `a shadow run left something in the checkout: ${line}`);
  }
  assert.ok(!existsSync(join(REPO_ROOT, '.my-command', 'judge')), 'no judge keep inside the checkout');
});

test('a failed ask is recorded too, because what the layer could not answer is evidence', async () => {
  await withKeep(async () => {
    const report = await consult({
      state: 'x',
      questions: QUESTIONS,
      set: 'trim',
      existing: { verdict: 'continue' },
      shadow: true,
      env: keyed(),
      optIn: true,
      fetchImpl: answers({}, 401),
    });

    assert.equal(report.reason, 'bad-key');
    assert.equal(report.acted, false);
    const written = JSON.parse(readFileSync(String(report.recordedAt), 'utf8'));
    assert.equal(written.judge.reason, 'bad-key');
    assert.deepEqual(written.judge.answers, {});
    assert.equal(written.acted, false);
  });
});

test('a gated-off run writes no record at all', async () => {
  await withKeep(async (root) => {
    const report = await consult({
      state: 'x',
      questions: QUESTIONS,
      set: 'trim',
      shadow: true,
      env: keyed(),
      optIn: false,
      fetchImpl: refuse,
    });
    assert.equal(report.recordedAt, null);
    assert.equal(existsSync(join(root, 'trim')), false, 'a run that never happened records nothing');
  });
});

test('an answer below the floor is kept apart from one above it', async () => {
  const impl = answers({
    answers: { KEEP: { type: 'noul', noul: 0.55 }, DROP: { type: 'noul', noul: 0.99 } },
    usage: { input_tokens: 4, output_tokens: 2 },
  });
  const report = await consult({
    state: 'x',
    questions: QUESTIONS,
    set: 'trim',
    env: keyed(),
    optIn: true,
    fetchImpl: impl,
  });

  // 0.55 is 0.1 from the middle, so its confidence is 0.2 and it clears nothing.
  assert.deepEqual(Object.keys(report.belowFloor), ['KEEP']);
  assert.deepEqual(Object.keys(report.answers), ['DROP']);
  assert.equal(report.reason, null);
  assert.equal(report.acted, false);
});
