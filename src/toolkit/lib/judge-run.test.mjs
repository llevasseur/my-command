// The `/task --jev` runtime surface.
//
// Four properties carry this unit and each is asserted rather than described: two sites are
// wired and neither acts, a run that is not recording sends nothing, the per-run cap is its own
// number rather than the process-wide one, and `--dry-run` prints what the live path would
// post through the very function the live path posts.
//
// The wired sites are `step-2.5/complexity` and `step-2.6/surface`, and the property that
// matters most about them is negative: with no key, a run under `--jev` adds **zero lines** to
// the report. That is asserted here on the wired list rather than on a hand-made one, because
// an empty `SITES` made the claim for free and a populated one does not.
//
// `step-2.5/complexity` builds its question map per changed file, so it is the first site whose
// questions are not a literal in the module. Two things follow and both are asserted: the
// expansion is keyed by path, so a recorded row pairs back to the file it was about, and a run
// with no changed files asks nothing rather than posting an empty map.
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
  changedFilesOf,
  complexityQuestions,
  DEFAULT_RUN_TOKEN_CAP,
  dryRun,
  judgeRun,
  questionsAt,
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

test('two sites are wired, in run order, and none of them acts', () => {
  // ADR 0008 holds that nothing acts on a Jev answer, and wiring a site promotes nothing.
  // The order is the order a run reaches them: the triage is asked before Step 2.6 boots.
  assert.deepEqual(
    SITES.map((site) => site.id),
    ['step-2.5/complexity', 'step-2.6/surface'],
  );
  assert.deepEqual(actingSites(), []);

  // ADR 0019: this site would decide a *skip*, so it is the last one that may ever be
  // promoted. Nothing enforces that ordering in code — this asserts the state it starts in.
  const [triage, surface] = SITES;
  assert.equal(surface.set, 'verify-surface');
  assert.equal(surface.acts, false);
  assert.deepEqual(Object.keys(surface.questions), ['REACHES_SERVED_SURFACE']);
  assert.equal(surface.questions.REACHES_SERVED_SURFACE.type, 'noul');

  // ADR 0020: the mirror image. Its answer would ADD a rework pass, so it could be promoted
  // soonest despite the worse label — and it ships `acts: false` exactly like the other.
  assert.equal(triage.set, 'complexity-triage');
  assert.equal(triage.acts, false);
  // Its questions are built per changed file, so the static map is empty by design and the
  // builder is what carries the questions. Asserting both stops a later refactor quietly
  // dropping the builder and shipping a site that asks nothing.
  assert.deepEqual(Object.keys(triage.questions), []);
  // Proven by asking rather than by inspecting the field: if a refactor dropped the builder,
  // `questionsAt` would fall back to that empty static map and this line would fail.
  assert.deepEqual(Object.keys(questionsAt(triage, { changedFiles: ['x.ts'] })), ['NEEDS_REWORK::x.ts']);

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

  // Against the wired list, the dry run prints the real sites — which is what a human reads
  // before authorising the first egress this campaign has ever had.
  const state = { changedFiles: ['src/a.ts', 'docs/b.md'] };
  const wired = dryRun({ state });
  assert.deepEqual(
    wired.sites.map((site) => site.id),
    ['step-2.5/complexity', 'step-2.6/surface'],
  );
  for (const site of wired.sites) assert.equal(site.acts, false, `${site.set} prints able to act`);

  // Each printed body is composed from what that site would actually ask, per-file expansion
  // included. A dry run that printed the empty static map would understate the egress it
  // exists to disclose, which is the one failure mode this assertion is for.
  assert.deepEqual(wired.sites[0].body, buildRequest(state, questionsAt(SITES[0], state)));
  assert.deepEqual(Object.keys(wired.sites[0].body.questions), ['NEEDS_REWORK::src/a.ts', 'NEEDS_REWORK::docs/b.md']);
  assert.deepEqual(wired.sites[1].body, buildRequest(state, SITES[1].questions));
});

test('the triage expands one question per changed file, keyed by path', () => {
  // The per-file shape is the question. One answer over a whole diff would average a hard
  // change to one file together with a rename applied to nine others, and the key is what
  // lets a recorded row be paired back to the file it was about.
  const questions = complexityQuestions({ changedFiles: ['src/a.ts', 'src/b.ts'] });
  assert.deepEqual(Object.keys(questions), ['NEEDS_REWORK::src/a.ts', 'NEEDS_REWORK::src/b.ts']);
  for (const [key, question] of Object.entries(questions)) {
    assert.equal(question.type, 'noul');
    assert.ok(question.instructions.includes(key.replace('NEEDS_REWORK::', '')), `${key}: does not name its file`);
    assert.ok(question.instructions.includes('rework pass'), `${key}: does not ask the set's question`);
  }

  // The state is assembled by the command rather than by a schema, so anything that is not a
  // usable file list means no questions — never a throw inside a layer whose whole contract is
  // that it cannot change an outcome.
  for (const state of [
    'x',
    [],
    {},
    { changedFiles: null },
    { changedFiles: 'src/a.ts' },
    { changedFiles: ['', '  '] },
  ]) {
    assert.deepEqual(changedFilesOf(state), [], `${JSON.stringify(state)} must yield no files`);
    assert.deepEqual(complexityQuestions(state), {}, `${JSON.stringify(state)} must yield no questions`);
  }

  // And `questionsAt` is the one place the two kinds of site are reconciled, so nothing
  // downstream has to know which kind it is holding.
  assert.deepEqual(questionsAt(SITE, 'x'), QUESTIONS);
  assert.deepEqual(Object.keys(questionsAt(SITES[0], { changedFiles: ['a.ts'] })), ['NEEDS_REWORK::a.ts']);
});

test('a per-file site with no changed files asks nothing rather than posting an empty map', async () => {
  // Spending a call to be told nothing is the failure this guards. `refuse` proves no request
  // was composed at all, rather than one being composed and discarded.
  const run = await judgeRun({
    state: { changedFiles: [] },
    sites: [SITES[0]],
    endpoint: RECORDER,
    env: keyed(),
    optIn: true,
    fetchImpl: refuse,
  });

  assert.equal(run.asked, false);
  assert.equal(run.acted, false);
  assert.equal(run.sites[0].reason, 'no-questions');
  assert.deepEqual(run.sites[0].answers, {});
  assert.equal(run.sites[0].recordedAt, null, 'nothing was sent, so nothing was recorded');
});

test('with no key a --jev run sends nothing and adds zero lines to the report', async () => {
  // The byte-identical promise, asserted on the list that actually ships. An empty `SITES`
  // made this true for free; a wired one has to earn it, and this is where it is earned. The
  // state carries changed files on purpose, so the per-file site would have had real questions
  // to ask — the silence has to come from the gate, not from an empty expansion.
  assert.equal(SITES.length, 2, 'this test is only worth anything against a populated list');
  const run = await judgeRun({
    state: { changedFiles: ['src/a.ts', 'src/b.ts'] },
    endpoint: RECORDER,
    env: {},
    optIn: true,
    fetchImpl: refuse,
  });

  assert.equal(run.gate.enabled, false);
  assert.equal(run.silent, true, 'no key must be silent, not a warning');
  assert.equal(run.asked, false);
  assert.equal(run.acted, false);
  assert.deepEqual(run.sites, [], 'a silent run reports no site, even though two are wired');
  assert.deepEqual(reportLines(run), [], 'a no-key run must add zero lines to the report');

  // And the same with the opt-in absent as well, which is every run on this device today.
  const off = await judgeRun({ state: 'x', endpoint: RECORDER, env: {}, fetchImpl: refuse });
  assert.deepEqual(reportLines(off), []);
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
  // `sites: []` is explicit now that `SITES` carries one: the reason-reporting path is still
  // reachable and still has to say the right thing, but it is no longer the default state.
  const run = await judgeRun({
    state: 'x',
    sites: [],
    endpoint: RECORDER,
    env: keyed(),
    optIn: true,
    fetchImpl: refuse,
  });
  assert.equal(run.asked, false);
  assert.equal(run.reason, 'no-sites');
  assert.equal(run.acted, false);
  assert.deepEqual(run.sites, []);
  assert.match(reportLines(run)[0], /no question sites are wired yet/);
});
