// Each deterministic gate, against a transcript written line by line, so what the verb
// answers is proven rather than asserted about. The two gates it does not answer are tested
// just as hard: reporting `unknown` is the behaviour ADR 0007 asks for, not a gap.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { flagsFrom } from '../lib/flags.mjs';
import { run as trim } from './trim.mjs';

/** @type {string[]} */
const made = [];

after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'mct-trim-'));
  made.push(dir);
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  git(['add', 'a.txt']);
  git(['commit', '-qm', 'init']);
  return { dir, git };
}

/** @param {string} cwd @param {Record<string, string | true | string[]>} flags */
const ctx = (cwd, flags = {}) =>
  /** @type {never} */ ({ verb: 'trim', cwd, positionals: [], flags: flagsFrom({ base: 'HEAD', ...flags }) });

let clock = Date.parse('2026-09-16T10:00:00.000Z');
/** Each record a minute after the last, so turn order and a compaction boundary are readable. */
function tick() {
  clock += 60_000;
  return new Date(clock).toISOString();
}

/**
 * One assistant turn: an id shared by its blocks, and a tool call per entry. `bg` marks a
 * backgrounded call, which the transcript reader judges live until a completion notice.
 * @param {string} id
 * @param {{name: string, id: string, input?: Record<string, any>}[]} calls
 * @param {string} [said]
 */
function turn(id, calls, said) {
  /** @type {Record<string, any>[]} */
  const content = calls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.input ?? {} }));
  if (said) content.unshift({ type: 'text', text: said });
  return { type: 'assistant', uuid: `u-${id}`, timestamp: tick(), message: { id, content } };
}

/**
 * The harness handing results back for calls already made.
 * @param {{id: string, failed?: boolean}[]} given
 */
function results(given) {
  return {
    type: 'user',
    uuid: `r-${given.map((r) => r.id).join('-')}`,
    timestamp: tick(),
    message: {
      content: given.map((r) => ({ type: 'tool_result', tool_use_id: r.id, is_error: r.failed === true })),
    },
  };
}

/** A real user prompt, which breaks any run of turns before it. */
function prompt(text = 'do the thing') {
  return { type: 'user', uuid: `p-${clock}`, timestamp: tick(), message: { content: [{ type: 'text', text }] } };
}

/**
 * A completion notice for a backgrounded call, which is what ends a watch.
 * @param {string} id
 */
function notice(id) {
  return {
    type: 'user',
    uuid: `n-${id}`,
    timestamp: tick(),
    message: {
      content: [{ type: 'text', text: `<task-notification><tool-use-id>${id}</tool-use-id></task-notification>` }],
    },
  };
}

/** The boundary a compaction leaves behind, which is where C3 starts counting. */
function compaction() {
  return {
    type: 'user',
    uuid: `c-${clock}`,
    timestamp: tick(),
    isCompactSummary: true,
    message: { content: [{ type: 'text', text: 'This session is being continued from a previous conversation.' }] },
  };
}

/** @param {string} dir @param {Record<string, any>[]} records @returns {string} */
function transcript(dir, records) {
  const path = join(dir, `transcript-${records.length}-${clock}.jsonl`);
  writeFileSync(path, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return path;
}

/** A read-only probe and a mutation, named once so the tests read by intent. */
const PROBE = { name: 'Bash', input: { command: 'ls -la' } };
const MUTATION = { name: 'Bash', input: { command: 'rm -rf build' } };

test('C1 is Y when the last settled turn returned cleanly and nothing is watching', async () => {
  const { dir } = repo();
  const path = transcript(dir, [
    prompt(),
    turn('m1', [{ ...PROBE, id: 't1' }]),
    results([{ id: 't1' }]),
    turn('m2', [{ ...MUTATION, id: 't2' }]),
    results([{ id: 't2' }]),
  ]);

  const r = await trim(ctx(dir, { transcript: path }));
  assert.equal(r.gates.C1.answer, 'Y');
  assert.equal(r.gates.C1.unreturned, 0);
  assert.equal(r.gates.C1.errored, 0);
  assert.equal(r.gates.C1.liveWatches, 0);
});

test('C1 is N when the last settled turn carried a call that came back an error', async () => {
  const { dir } = repo();
  const path = transcript(dir, [
    prompt(),
    turn('m1', [{ ...PROBE, id: 't1' }]),
    results([{ id: 't1' }]),
    turn('m2', [{ ...MUTATION, id: 't2' }]),
    results([{ id: 't2', failed: true }]),
  ]);

  const r = await trim(ctx(dir, { transcript: path }));
  assert.equal(r.gates.C1.answer, 'N');
  assert.equal(r.gates.C1.errored, 1);
});

test('C1 is N while a watch this session armed is still running', async () => {
  const { dir } = repo();
  const watching = { name: 'Bash', input: { command: 'tail -f run.log', run_in_background: true } };
  const path = transcript(dir, [
    prompt(),
    turn('m1', [{ ...watching, id: 'w1' }]),
    results([{ id: 'w1' }]),
    turn('m2', [{ ...PROBE, id: 't2' }]),
    results([{ id: 't2' }]),
  ]);

  const r = await trim(ctx(dir, { transcript: path }));
  assert.equal(r.gates.C1.liveWatches, 1);
  assert.equal(r.gates.C1.answer, 'N');
  // The notice that the backgrounded command exited is what ends the watch.
  const ended = transcript(dir, [
    prompt(),
    turn('m1', [{ ...watching, id: 'w1' }]),
    results([{ id: 'w1' }]),
    notice('w1'),
    turn('m2', [{ ...PROBE, id: 't2' }]),
    results([{ id: 't2' }]),
  ]);
  const after_ = await trim(ctx(dir, { transcript: ended }));
  assert.equal(after_.gates.C1.liveWatches, 0);
  assert.equal(after_.gates.C1.answer, 'Y');
});

test('C1 excludes the in-flight turn this verb is itself being called from', async () => {
  const { dir } = repo();
  // The shape every real run has: the assistant message carrying this very call is written
  // before any of its results are, so the whole final turn reads as unreturned. Counting it
  // would make C1 answer N on every invocation, about itself.
  const path = transcript(dir, [
    prompt(),
    turn('m1', [{ ...PROBE, id: 't1' }]),
    results([{ id: 't1' }]),
    turn('m2', [{ name: 'Bash', input: { command: 'my-command-tools trim' }, id: 't2' }]),
  ]);

  const r = await trim(ctx(dir, { transcript: path }));
  assert.equal(r.transcript.inFlightTurns, 1);
  assert.equal(r.gates.C1.answer, 'Y');
  assert.equal(r.gates.C1.unreturned, 0);
});

test('C3 counts only the turns since the last compaction boundary', async () => {
  const { dir } = repo();
  const path = transcript(dir, [
    prompt(),
    turn('m1', [{ ...MUTATION, id: 't1' }]),
    results([{ id: 't1' }]),
    compaction(),
    turn('m2', [{ ...PROBE, id: 't2' }]),
    results([{ id: 't2' }]),
  ]);

  const r = await trim(ctx(dir, { transcript: path }));
  // The only acting turn is on the far side of the boundary, so nothing counts after it.
  assert.equal(r.gates.C3.actingTurns, 0);
  assert.equal(r.gates.C3.since, 'compaction');
  // A clean tree and no acting turn since the boundary is the one way this answers N.
  assert.equal(r.repo.hasWork, false);
  assert.equal(r.gates.C3.answer, 'N');
});

test('C3 is Y when a turn since the boundary did something that is not read-only', async () => {
  const { dir } = repo();
  const path = transcript(dir, [
    prompt(),
    compaction(),
    turn('m1', [{ ...PROBE, id: 't1' }]),
    results([{ id: 't1' }]),
    turn('m2', [{ ...MUTATION, id: 't2' }]),
    results([{ id: 't2' }]),
  ]);

  const r = await trim(ctx(dir, { transcript: path }));
  assert.equal(r.gates.C3.actingTurns, 1);
  assert.equal(r.gates.C3.answer, 'Y');
});

test('C3 falls back to the working tree when the session was never compacted', async () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  writeFileSync(join(dir, 'a.txt'), 'two\n');
  const path = transcript(dir, [prompt(), turn('m1', [{ ...PROBE, id: 't1' }]), results([{ id: 't1' }])]);

  const r = await trim(ctx(dir, { transcript: path }));
  assert.equal(r.gates.C3.since, 'session start');
  // No acting turn at all, but the tree carries work, and work on disk is progress.
  assert.equal(r.gates.C3.actingTurns, 0);
  assert.equal(r.repo.hasWork, true);
  assert.equal(r.gates.C3.answer, 'Y');
});

test('N1 is Y when an identical probe was re-issued with nothing in between', async () => {
  const { dir } = repo();
  const path = transcript(dir, [
    prompt(),
    turn('m1', [{ ...PROBE, id: 't1' }]),
    results([{ id: 't1' }]),
    turn('m2', [{ ...PROBE, id: 't2' }]),
    results([{ id: 't2' }]),
  ]);

  const r = await trim(ctx(dir, { transcript: path }));
  assert.equal(r.gates.N1.answer, 'Y');
  assert.deepEqual(r.gates.N1.repeatedProbes, ['ls -la']);
});

test('N1 does not call a re-check after a mutation a repeat', async () => {
  const { dir } = repo();
  const path = transcript(dir, [
    prompt(),
    turn('m1', [{ ...PROBE, id: 't1' }]),
    results([{ id: 't1' }]),
    turn('m2', [{ ...MUTATION, id: 't2' }]),
    results([{ id: 't2' }]),
    turn('m3', [{ ...PROBE, id: 't3' }]),
    results([{ id: 't3' }]),
  ]);

  const r = await trim(ctx(dir, { transcript: path }));
  assert.deepEqual(r.gates.N1.repeatedProbes, []);
  assert.equal(r.gates.N1.answer, 'N');
});

test("N1 is not blinded by this verb's own invocation sitting in the way", async () => {
  const { dir } = repo();
  // `read-only.mjs` does not list this verb, so without the self-call exclusion its own call
  // reads as a mutation, ends the backward walk, and hides the repeat behind it.
  const path = transcript(dir, [
    prompt(),
    turn('m1', [{ ...PROBE, id: 't1' }]),
    results([{ id: 't1' }]),
    turn('m2', [{ ...PROBE, id: 't2' }]),
    results([{ id: 't2' }]),
    turn('m3', [{ name: 'Bash', input: { command: 'my-command-tools trim --compact' }, id: 't3' }]),
    results([{ id: 't3' }]),
  ]);

  const r = await trim(ctx(dir, { transcript: path }));
  assert.deepEqual(r.gates.N1.repeatedProbes, ['ls -la']);
  assert.equal(r.gates.N1.answer, 'Y');
});

test('N1 counts consecutive failing turns and calls two of them cycling', async () => {
  const { dir } = repo();
  const one = transcript(dir, [
    prompt(),
    turn('m1', [{ ...MUTATION, id: 't1' }]),
    results([{ id: 't1', failed: true }]),
  ]);
  const first = await trim(ctx(dir, { transcript: one }));
  assert.equal(first.gates.N1.consecutiveFailingTurns, 1);
  assert.equal(first.gates.N1.answer, 'N');

  const two = transcript(dir, [
    prompt(),
    turn('m1', [{ ...MUTATION, id: 't1' }]),
    results([{ id: 't1', failed: true }]),
    turn('m2', [{ name: 'Bash', input: { command: 'rm -rf dist' }, id: 't2' }]),
    results([{ id: 't2', failed: true }]),
  ]);
  const second = await trim(ctx(dir, { transcript: two }));
  assert.equal(second.gates.N1.consecutiveFailingTurns, 2);
  assert.equal(second.gates.N1.answer, 'Y');
});

test('N2 is Y while a dispatched agent has not reported back, and N once it has', async () => {
  const { dir } = repo();
  const dispatch = { name: 'Agent', input: { run_in_background: false, prompt: 'go' } };
  const out = transcript(dir, [prompt(), turn('m1', [{ ...dispatch, id: 'a1' }])]);
  const open = await trim(ctx(dir, { transcript: out }));
  assert.equal(open.gates.N2.openAgents, 1);
  assert.equal(open.gates.N2.answer, 'Y');

  const back = transcript(dir, [prompt(), turn('m1', [{ ...dispatch, id: 'a1' }]), results([{ id: 'a1' }])]);
  const done = await trim(ctx(dir, { transcript: back }));
  assert.equal(done.gates.N2.openAgents, 0);
  assert.equal(done.gates.N2.answer, 'N');
});

test('N2 is Y on an unmerged path even with a transcript that shows nothing pending', async () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/theirs']);
  writeFileSync(join(dir, 'a.txt'), 'theirs\n');
  git(['commit', '-qam', 'theirs']);
  git(['checkout', '-q', 'main']);
  writeFileSync(join(dir, 'a.txt'), 'ours\n');
  git(['commit', '-qam', 'ours']);
  try {
    git(['merge', 'feat/theirs']);
  } catch {
    // The conflict is the point of the fixture.
  }

  const path = transcript(dir, [prompt(), turn('m1', [{ ...PROBE, id: 't1' }]), results([{ id: 't1' }])]);
  const r = await trim(ctx(dir, { transcript: path }));
  assert.deepEqual(r.repo.unmerged, ['a.txt']);
  assert.equal(r.gates.N2.answer, 'Y');
});

test('the two gates this verb does not answer come back unknown, and it prints no verdict', async () => {
  const { dir } = repo();
  const path = transcript(dir, [prompt(), turn('m1', [{ ...PROBE, id: 't1' }]), results([{ id: 't1' }])]);

  const r = await trim(ctx(dir, { transcript: path }));
  assert.equal(r.gates.C2.answer, 'unknown');
  assert.equal(r.gates.N3.answer, 'unknown');
  assert.match(r.gates.C2.why, /judgement/);
  assert.match(r.gates.N3.why, /judgement/);
  // Six gates decide TRIM against CONTINUE and two are not answered here, so there is no
  // verdict to print — null as a value, rather than a key nobody notices is missing.
  assert.equal(r.verdict, null);
  // The clauses inside the gates it does answer are reported as unanswered too.
  assert.equal(r.gates.C1.partial, true);
  assert.match(r.gates.C1.residual, /mid-tool-sequence/);
  assert.equal(r.gates.N1.partial, true);
  assert.match(r.gates.N1.residual, /negative evidence/);
});

test('a transcript it cannot read leaves the repository halves answering anyway', async () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  writeFileSync(join(dir, 'a.txt'), 'changed\n');

  const r = await trim(ctx(dir, { transcript: join(dir, 'no-such-transcript.jsonl') }));
  assert.equal(r.transcript.read, false);
  assert.match(String(r.transcript.reason), /no readable records/);
  assert.equal(r.gates.C1.answer, 'unknown');
  assert.equal(r.gates.N1.answer, 'unknown');
  // C3 and N2 keep the half that git answers, rather than going dark with the transcript.
  assert.equal(r.gates.C3.answer, 'Y');
  assert.equal(r.repo.hasWork, true);
  assert.equal(r.gates.N2.answer, 'unknown');
  assert.deepEqual(r.repo.unmerged, []);
});
