// The `/task --jev` runtime surface.
//
// Four properties carry this unit and each is asserted rather than described: no site is wired
// and none acts, a run that is not recording sends nothing, the per-run cap is its own number
// rather than the process-wide one, and `--dry-run` prints what the live path would post
// through the very function the live path posts.
//
// The byte-identical claim — a `/task` run under the flag reaching the same outcome as one
// without it, across all nine failure modes — lives in `judge-runtime.test.mjs` beside the
// modes table it is asserted against.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { buildRequest, ENDPOINT } from './jev.mjs';
import {
  actingSites,
  DEFAULT_RUN_TOKEN_CAP,
  dryRun,
  judgeRun,
  RUN_CAP_VAR,
  records,
  reportLines,
  runBudget,
  SITES,
  START_COMMAND,
} from './judge-run.mjs';
import { DEFAULT_TOKEN_CAP } from './judge-runtime.mjs';

/** A placeholder, never a real credential: it only has to be non-empty to pass the key check. */
const FAKE_KEY = 'not-a-real-key';

/** An environment carrying a key and nothing else that matters here. */
const keyed = () => ({ TYPESAFE_API_KEY: FAKE_KEY });

/** A recorder URL. Nothing connects to it — every test here injects its own fetch. */
const RECORDER = 'http://127.0.0.1:1/jev-record';

/** One question, which is all any of these tests needs to ask. */
const QUESTIONS = { KEEP: { type: /** @type {const} */ ('noul'), instructions: 'Did this run go well?' } };

/** A site shaped as the follow-up units will ship them, acting on nothing. */
const SITE = { id: 'step-2/verify', set: 'verify-regression', version: null, acts: false, questions: QUESTIONS };

/** A fetch that fails the test if anything calls it. @type {typeof globalThis.fetch} */
const refuse = () => {
  throw new Error('a network call was made on a path that must make none');
};

/** A fetch answering with `body` at 200. @param {unknown} body */
function answers(body) {
  /** @type {typeof globalThis.fetch} */
  const impl = async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return impl;
}

/** @type {string[]} */
const made = [];

after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/**
 * Run `body` with the shadow keep pointed at a throwaway directory, and put the environment
 * back however it ends. Awaited rather than returned, for the reason the sibling file gives: a
 * `finally` firing on the promise being returned restores the variable while the work it was
 * set for is still going, and the record then lands in a developer's home directory.
 * @param {() => unknown} body
 */
async function withKeep(body) {
  const root = mkdtempSync(join(tmpdir(), 'mct-task-judge-'));
  made.push(root);
  const previous = process.env.MY_COMMAND_JUDGE_DIR;
  process.env.MY_COMMAND_JUDGE_DIR = root;
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.MY_COMMAND_JUDGE_DIR;
    else process.env.MY_COMMAND_JUDGE_DIR = previous;
  }
}

test('no site is wired in this unit, and none of them acts', () => {
  // ADR 0008 holds that nothing acts on a Jev answer, and this unit promotes nothing. The
  // list is empty, so there is not yet anything that *could* be promoted.
  assert.deepEqual([...SITES], []);
  assert.deepEqual(actingSites(), []);

  // The mechanism is per set rather than per flag, so it has to be able to say yes — the
  // claim is that no shipped site does, not that the door is welded shut.
  assert.deepEqual(actingSites([SITE]), []);
  assert.deepEqual(
    actingSites([SITE, { ...SITE, id: 'promoted', acts: true }]).map((site) => site.id),
    ['promoted'],
    'promotion must remain expressible per set, so one set can act later while --jev does not',
  );

  // And every site the module itself ships declares false, whatever else is true of it.
  for (const site of SITES) assert.equal(site.acts, false, `${site.id} ships able to act`);
});

test('a run that is not recording sends nothing, because an unrecorded answer is no corpus', async () => {
  for (const endpoint of [undefined, '', '   ', ENDPOINT]) {
    const run = await judgeRun({
      state: 'x',
      sites: [SITE],
      endpoint,
      env: keyed(),
      optIn: true,
      fetchImpl: refuse,
    });
    assert.equal(run.asked, false, `${endpoint ?? 'absent'}: a call was made without a recorder`);
    assert.equal(run.reason, 'not-recorded');
    assert.equal(run.recorded, false);
    assert.equal(run.acted, false);
  }

  // Pointed at the live endpoint is *not* recording, which is the case worth naming: it is the
  // one that looks configured and writes nothing down.
  assert.equal(records(ENDPOINT), false);
  assert.equal(records(RECORDER), true);
});

test('the run report names the recorder in its refusal, so the fix is in the line', () => {
  const lines = reportLines({
    acted: false,
    gate: { capable: true, optedIn: true, enabled: true, silent: false, reason: null },
    asked: false,
    recorded: false,
    endpoint: null,
    reason: 'not-recorded',
    silent: false,
    sites: [],
    budget: { cap: DEFAULT_RUN_TOKEN_CAP, spent: 0 },
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Nothing acted\./);
  assert.ok(lines[0].includes(START_COMMAND), 'the refusal must name the command that fixes it');
});

test('the per-run cap is its own number, not the process-wide one', () => {
  // The point of a second cap: a process may carry many runs, and the number a person
  // authorises is a run's.
  assert.ok(DEFAULT_RUN_TOKEN_CAP < DEFAULT_TOKEN_CAP, 'a per-run cap that matched the process one would buy nothing');
  assert.equal(runBudget({}).cap, DEFAULT_RUN_TOKEN_CAP);
  assert.equal(runBudget({}).spent, 0);

  assert.equal(runBudget({ [RUN_CAP_VAR]: '900' }).cap, 900);
  // Zero is the spelling that asks for no cap, and it is asked for rather than fallen into.
  assert.equal(runBudget({ [RUN_CAP_VAR]: '0' }).cap, Number.POSITIVE_INFINITY);
  // Anything unreadable is the conservative default, never an uncapped run.
  for (const bad of ['', '  ', 'lots', '-1', 'NaN']) {
    assert.equal(runBudget({ [RUN_CAP_VAR]: bad }).cap, DEFAULT_RUN_TOKEN_CAP, `${bad} must not uncap a run`);
  }
});

test('a run charges its own budget and stops at its own cap', async () => {
  await withKeep(async () => {
    const budget = runBudget({ [RUN_CAP_VAR]: '20' });
    const impl = answers({
      answers: { KEEP: { type: 'noul', noul: 0.95 } },
      usage: { input_tokens: 20, output_tokens: 5 },
    });

    const first = await judgeRun({
      state: 'x',
      sites: [SITE],
      endpoint: RECORDER,
      env: keyed(),
      optIn: true,
      budget,
      fetchImpl: impl,
    });
    assert.equal(first.sites[0].reason, null);
    assert.equal(budget.spent, 25);

    // 25 of 20 spent, so the next run's site is refused before it is composed. The cap is
    // checked, never enforced mid-flight: a response that overshoots is paid for and stops
    // what comes after it.
    const second = await judgeRun({
      state: 'x',
      sites: [SITE],
      endpoint: RECORDER,
      env: keyed(),
      optIn: true,
      budget,
      fetchImpl: refuse,
    });
    assert.equal(second.sites[0].reason, 'spend-cap');
    assert.equal(second.acted, false);
  });
});

test('--dry-run prints the live body through the live builder, and is ungated', () => {
  // Ungated deliberately: ADR 0009 makes the dry run how a human reads what leaves the device
  // before it leaves, and requiring the opt-in to read what the opt-in would send inverts that.
  const printed = dryRun({ state: 'the run so far', sites: [SITE], endpoint: RECORDER });

  assert.equal(printed.endpoint, RECORDER);
  assert.equal(printed.recorded, true);
  // Both hosts, because with a recorder in front the body reaches localhost and ends up
  // somewhere else, and printing only the first would understate the egress.
  assert.equal(printed.upstream, ENDPOINT);

  // The same function the live path composes with, so the two cannot drift into printing one
  // thing and sending another.
  assert.deepEqual(printed.sites[0].body, buildRequest('the run so far', QUESTIONS));
  assert.equal(printed.sites[0].acts, false);

  // No key, no opt-in, and still a full body: nothing about the dry run reads the gates.
  const bare = dryRun({ state: 'x', sites: [SITE] });
  assert.equal(bare.endpoint, ENDPOINT);
  assert.equal(bare.recorded, false);
  assert.deepEqual(bare.sites[0].body, buildRequest('x', QUESTIONS));

  // With no sites wired there is nothing to print, which is this unit's actual state.
  assert.deepEqual(dryRun({ state: 'x' }).sites, []);
});

test('an asked run writes the answers into the report beside what the run did, and acts on none', async () => {
  await withKeep(async () => {
    const did = { branch: 'feat/x', verdict: 'green' };
    const run = await judgeRun({
      state: 'the run so far',
      sites: [SITE],
      endpoint: RECORDER,
      existing: did,
      env: keyed(),
      optIn: true,
      fetchImpl: answers({
        answers: { KEEP: { type: 'noul', noul: 0.93 } },
        usage: { input_tokens: 4, output_tokens: 1 },
      }),
    });

    assert.equal(run.acted, false, 'nothing may act while ADR 0008 stands');
    assert.equal(run.asked, true);
    assert.equal(run.recorded, true);
    assert.deepEqual(run.sites[0].answers.KEEP, { type: 'noul', noul: 0.93 });
    // The record is what makes the corpus: the answer is on disk beside what the run did.
    assert.ok(run.sites[0].recordedAt !== null, 'an answer that was not written down is no corpus');

    const lines = reportLines(run);
    assert.ok(
      lines.some((line) => line.includes('KEEP=0.93')),
      'the answer must reach the report',
    );
    assert.ok(
      lines.every((line) => !line.includes('feat/x')),
      'the report lines carry the answers; what the run did is the caller’s own section',
    );
    assert.match(lines[0], /Nothing acted\./);
  });
});

test('a run with no sites asks nothing and says so', async () => {
  const run = await judgeRun({ state: 'x', endpoint: RECORDER, env: keyed(), optIn: true, fetchImpl: refuse });
  assert.equal(run.asked, false);
  assert.equal(run.reason, 'no-sites');
  assert.equal(run.acted, false);
  assert.deepEqual(run.sites, []);
  assert.match(reportLines(run)[0], /no question sites are wired yet/);
});
