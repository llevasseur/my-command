// The eval harness is networked and nondeterministic; this repository's gates are neither.
//
// Everything in the first block below asserts the harness CANNOT BE REACHED from a gate, and each
// assertion reads the real file rather than a restatement of it — `verify`'s own discovery rule
// out of `verify.mjs`, the test globs out of `package.json`, the jobs out of the workflow. A
// later edit that wires the eval into any of the three fails here.
//
// This file is itself deterministic and offline: it makes no network call, and importing the
// harness runs nothing, which is the guard it also checks.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SCRIPT = 'judge:eval';
const HARNESS = 'src/toolkit/eval/judge-eval.mjs';

/** @returns {Record<string, string>} */
function scripts() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return manifest.scripts;
}

test('the harness has a package.json script of its own', () => {
  assert.equal(scripts()[SCRIPT], `node ${HARNESS}`);
});

test('verify cannot discover the eval script', () => {
  // The discovery rule, lifted from the verb rather than described: the PREFERRED list plus every
  // script whose name starts with `check:`.
  const verb = readFileSync(join(ROOT, 'src/toolkit/verbs/verify.mjs'), 'utf8');
  const preferred = /const PREFERRED = \[([^\]]*)\]/.exec(verb);
  assert.ok(preferred, 'verify.mjs no longer declares PREFERRED — re-read its discovery rule');
  const names = [...preferred[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(names.length > 0);

  const discovered = [...names, ...Object.keys(scripts()).filter((s) => s.startsWith('check:'))];
  assert.ok(!discovered.includes(SCRIPT), `${SCRIPT} is discoverable by verify`);

  // And the rule itself is still the one asserted above, so a rewritten discovery cannot pass this
  // test by accident.
  assert.match(verb, /Object\.keys\(scripts\)\.filter\(\(s\) => s\.startsWith\('check:'\)\)/);
});

test('pnpm test cannot reach the harness', () => {
  const command = scripts().test;
  const globs = [...command.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(globs.length > 0, 'the test script no longer carries quoted globs');

  // `**/` spans directories, a lone `*` does not, and everything else is literal. Built by
  // scanning rather than by chained splits, so no placeholder character is needed and the
  // formatter has nothing to rewrite.
  const matches = (/** @type {string} */ glob, /** @type {string} */ path) => {
    let pattern = '';
    let i = 0;
    while (i < glob.length) {
      if (glob.startsWith('**/', i)) {
        pattern += '(?:.*/)?';
        i += 3;
        continue;
      }
      if (glob[i] === '*') {
        pattern += '[^/]*';
        i += 1;
        continue;
      }
      pattern += glob[i].replace(/[.+^${}()|[\]\\?]/, '\\$&');
      i += 1;
    }
    return new RegExp(`^${pattern}$`).test(path);
  };

  // The matcher is only trustworthy if it agrees with the globs on a file the suite really does
  // run, so it is checked against this very file before it is used to clear the harness.
  assert.ok(
    globs.some((g) => matches(g, 'src/toolkit/eval/judge-eval.test.mjs')),
    'the matcher does not match this test file, so its verdict on the harness means nothing',
  );
  for (const glob of globs) {
    assert.ok(!matches(glob, HARNESS), `${glob} matches the harness`);
  }
});

test('no CI workflow runs the eval', () => {
  const dir = join(ROOT, '.github/workflows');
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const yaml = readFileSync(join(dir, file), 'utf8');
    assert.ok(!yaml.includes(SCRIPT), `${file} references ${SCRIPT}`);
    assert.ok(!yaml.includes('judge-eval'), `${file} references the harness`);
  }
});

test('check-commands.sh does not run the eval', () => {
  const sh = readFileSync(join(ROOT, 'scripts/check-commands.sh'), 'utf8');
  assert.ok(!sh.includes(SCRIPT));
  assert.ok(!sh.includes('judge-eval'));
});

test('importing the harness runs nothing', async () => {
  // main() is guarded on argv[1]; under the test runner that is this file, not the harness.
  const mod = await import('./judge-eval.mjs');
  assert.ok(mod.runEval instanceof Function);
  assert.ok(mod.format instanceof Function);
});

// ---------------------------------------------------------------------------------------------
// The mirrored gate regex, and the arithmetic.
// ---------------------------------------------------------------------------------------------

test('the mirrored UNJUDGEABLE regex still matches the gate it copies', async () => {
  const { UNJUDGEABLE, UNJUDGEABLE_SOURCE } = await import('./subject-b.mjs');
  const source = readFileSync(join(ROOT, UNJUDGEABLE_SOURCE), 'utf8');
  const declared = /const UNJUDGEABLE = (\/.*\/);/.exec(source);
  assert.ok(declared, `${UNJUDGEABLE_SOURCE} no longer declares UNJUDGEABLE`);
  assert.equal(UNJUDGEABLE.source, new RegExp(declared[1].slice(1, -1)).source);
});

test('agreement splits by band and measures coverage against the whole corpus', async () => {
  const { agreement } = await import('./metrics.mjs');
  /** @param {string} e @param {string | null} a @param {number} c */
  const row = (e, a, c) => ({
    expected: e,
    actual: a,
    confidence: c,
    latencyMs: 10,
    inputTokens: 0,
    outputTokens: 0,
    displacedTokens: 0,
  });

  const got = agreement([row('keep', 'keep', 0.95), row('keep', 'delete', 0.95), row('keep', 'keep', 0.1)], 0.9);
  assert.equal(got.size, 3);
  assert.equal(got.reached, 2);
  assert.equal(got.atBand, 0.5);
  // Two of three rows reached the band, not two of two — an abstaining classifier must not report
  // full coverage.
  assert.equal(got.coverage, 2 / 3);
});

test('an unanswered row counts against coverage but not against agreement', async () => {
  const { agreement } = await import('./metrics.mjs');
  const got = agreement(
    [
      {
        expected: 'keep',
        actual: 'keep',
        confidence: 0.95,
        latencyMs: 1,
        inputTokens: 0,
        outputTokens: 0,
        displacedTokens: 0,
      },
      {
        expected: 'keep',
        actual: null,
        confidence: 0,
        latencyMs: 1,
        inputTokens: 0,
        outputTokens: 0,
        displacedTokens: 0,
      },
    ],
    0.9,
  );
  assert.equal(got.atBand, 1);
  assert.equal(got.coverage, 0.5);
  assert.equal(got.answered, 1);
});

test('percentile never invents a value nobody observed', async () => {
  const { percentile } = await import('./metrics.mjs');
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([5], 0.95), 5);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2);
  assert.equal(percentile([1, 2, 3, 4], 0.95), 4);
});

test('price is summed from returned usage and skips rows that carried none', async () => {
  const { price, priceRatio } = await import('./metrics.mjs');
  const got = price([
    { expected: 'k', actual: 'k', confidence: 1, latencyMs: 1, inputTokens: 100, outputTokens: 20, displacedTokens: 0 },
    { expected: 'k', actual: 'k', confidence: 1, latencyMs: 1, inputTokens: 0, outputTokens: 0, displacedTokens: 0 },
  ]);
  assert.equal(got.totalTokens, 120);
  assert.equal(got.counted, 1);
  // An unmeasured displaced pass yields no ratio rather than a divide-by-zero or a guess.
  assert.equal(priceRatio(120, 0), null);
  assert.equal(priceRatio(10, 100), 0.1);
});

// ---------------------------------------------------------------------------------------------
// The pre-registered bars.
// ---------------------------------------------------------------------------------------------

test('an unmeasured bar never reports a pass', async () => {
  const { scoreSubjectA, verdictOf } = await import('./bars.mjs');
  const bars = scoreSubjectA({
    labelledSize: 1911,
    baseline: 0.865,
    agreementAtBand: null,
    coverageAtBand: null,
    priceRatio: null,
    latencyP95Ms: null,
  });
  assert.ok(bars.every((b) => b.status === 'not-measured'));
  assert.equal(verdictOf(bars).verdict, 'incomplete');
});

test('Subject A abandons on a margin under 10 points even with high absolute agreement', async () => {
  const { scoreSubjectA, verdictOf } = await import('./bars.mjs');
  const bars = scoreSubjectA({
    labelledSize: 1911,
    baseline: 0.865,
    agreementAtBand: 0.93,
    coverageAtBand: 0.5,
    priceRatio: 0.05,
    latencyP95Ms: 1000,
  });
  const got = verdictOf(bars);
  assert.equal(got.verdict, 'abandon');
  assert.deepEqual(got.failing, ['A.agreement']);
});

test('Subject A passes only when every bar clears', async () => {
  const { scoreSubjectA, verdictOf } = await import('./bars.mjs');
  const bars = scoreSubjectA({
    labelledSize: 1911,
    baseline: 0.865,
    agreementAtBand: 0.97,
    coverageAtBand: 0.5,
    priceRatio: 0.05,
    latencyP95Ms: 1000,
  });
  assert.equal(verdictOf(bars).verdict, 'pass');
});

test('Subject B abandons on a labelled corpus under 200, with no network involved', async () => {
  const { scoreSubjectB, verdictOf } = await import('./bars.mjs');
  const bars = scoreSubjectB({
    labelledSize: 12,
    baseline: null,
    agreementAtBand: null,
    coverageAtBand: null,
    priceRatio: null,
    latencyP95Ms: null,
  });
  const got = verdictOf(bars);
  assert.equal(got.verdict, 'abandon');
  assert.deepEqual(got.failing, ['B.corpus']);
  assert.equal(bars[0].status, 'fail');
});

// ---------------------------------------------------------------------------------------------
// Subject B's labeller, against transcript text rather than the real store.
// ---------------------------------------------------------------------------------------------

const TRANSCRIPT = [
  '# Session test',
  '- decided: starting',
  '- ▸ Bash(command=grep -rn "{foo}" src/a.mjs)',
  '- decided: that was refused for its shape, retrying smaller',
  '- Bash(command=grep -rn foo src/a.mjs)',
  '- ▸ Bash(command=ls -la ~/.claude/commands)',
  '- decided: fine, moving on',
  '- Bash(command=ls -la /tmp)',
].join('\n');

test('a candidate is labelled only when a reissue and a recorded failure both appear', async () => {
  const { parseTranscript, labelSession } = await import('./subject-b.mjs');
  const calls = parseTranscript('s1', TRANSCRIPT);
  assert.equal(calls.length, 4);
  assert.equal(calls.filter((c) => c.candidate).length, 2);

  const rows = labelSession(calls);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].label, 'should-have-been-refused');
  // The tilde call was reissued smaller too, but nothing recorded that the original was refused,
  // so it stays unlabelled rather than being assumed either way.
  assert.equal(rows[1].label, null);
  assert.match(rows[1].reason, /nothing records that the original was refused/);
});

test('a candidate with no outcome recorded is never labelled allow by default', async () => {
  const { parseTranscript, labelSession } = await import('./subject-b.mjs');
  const rows = labelSession(parseTranscript('s2', '- ▸ Bash(command=echo "$HOME")'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, null);
  assert.match(rows[0].reason, /no recorded outcome/);
});

test('a truncated command is recorded as truncated', async () => {
  const { parseTranscript } = await import('./subject-b.mjs');
  const calls = parseTranscript('s3', "- ▸ Bash(command=cd /tmp && jq -r '.diff[] | . as $f…)");
  assert.equal(calls[0].truncated, true);
  assert.equal(calls[0].candidate, true);
});

// ---------------------------------------------------------------------------------------------
// The harness reporting on its own calls. Every test below injects a fetch; none touches a
// network, and the 2026-09-17 run — 132 questions, 7 answers, a printed ABANDON — is reproduced
// from fixtures as the case the whole group exists to catch.
// ---------------------------------------------------------------------------------------------

/**
 * A corpus row, with only the fields the replay reads.
 * @param {number} i
 * @param {'keep' | 'delete' | 'tighten'} [label]
 * @returns {import('../lib/clean-corpus.mjs').CorpusEntry}
 */
function entry(i, label = 'keep') {
  return {
    commit: 'abc1234',
    subject: 'chore: clean',
    file: 'src/a.mjs',
    line: i + 1,
    comment: `// comment ${i}`,
    label,
    codeContext: 'const a = 1;',
    surroundingDiff: '+const a = 1;',
  };
}

const SET = { question: 'keep or delete?', criteria: { keep: 'still true', delete: 'noise' } };

/**
 * A `fetch` that answers only the first `answers` questions of whatever it is asked, which is the
 * 2026-09-17 failure in miniature.
 * @param {number} answers
 * @param {number[]} [seen] Filled with each request's question count, in call order.
 * @returns {typeof globalThis.fetch}
 */
function answeringFetch(answers, seen = []) {
  /** @type {typeof globalThis.fetch} */
  const fetchImpl = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    const ids = Object.keys(body.questions);
    seen.push(ids.length);
    /** @type {Record<string, unknown>} */
    const map = {};
    for (const id of ids.slice(0, answers)) {
      map[id] = { type: 'choice', choice: 'keep', probabilities: { keep: 0.99, delete: 0.01 }, confidence: 0.99 };
    }
    const payload = { answers: map, usage: { input_tokens: 10, output_tokens: 2 } };
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  return fetchImpl;
}

/**
 * A `fetch` that refuses with one status, so the client's own reason for it can be asserted.
 * @param {number} status
 * @param {unknown} body
 * @returns {typeof globalThis.fetch}
 */
function statusFetch(status, body) {
  /** @type {typeof globalThis.fetch} */
  const fetchImpl = async () => new Response(JSON.stringify(body), { status });
  return fetchImpl;
}

test('packChunks bounds a request by count and never drops a row', async () => {
  const { packChunks } = await import('./subject-a.mjs');
  const free = () => 0;
  assert.deepEqual(packChunks([1, 2, 3, 4, 5], free, { maxItems: 2 }), [[1, 2], [3, 4], [5]]);
  const many = Array.from({ length: 125 }, (_, i) => i);
  assert.equal(packChunks(many, free, { maxItems: 25 }).length, 5);
  assert.deepEqual(packChunks([], free, { maxItems: 25 }), []);
  // A nonsensical ceiling returns the batch whole rather than sending nothing.
  assert.deepEqual(packChunks([1, 2], free, { maxItems: 0, maxBytes: 0 }), [[1, 2]]);
});

test('packChunks bounds a request by size, which the question count never did', async () => {
  const { packChunks } = await import('./subject-a.mjs');
  const size = (/** @type {number} */ n) => n;

  // Four items of 30 bytes under a 100-byte ceiling: three fit, the fourth starts a call.
  assert.deepEqual(packChunks([30, 30, 30, 30], size, { maxItems: 25, maxBytes: 100 }), [[30, 30, 30], [30]]);

  // The envelope every request carries counts against the ceiling too.
  assert.deepEqual(packChunks([30, 30, 30], size, { maxItems: 25, maxBytes: 100, envelope: 50 }), [[30], [30], [30]]);

  // An item too large to fit alone is still sent alone rather than dropped (ADR 0016).
  assert.deepEqual(packChunks([500, 10], size, { maxItems: 25, maxBytes: 100 }), [[500], [10]]);
});

test('a batch of large rows is split by payload, not just by question count', async () => {
  const { replayBatch, MAX_REQUEST_BYTES } = await import('./subject-a.mjs');
  const { createBudget } = await import('../lib/jev.mjs');

  /** @type {number[]} */
  const bodies = [];
  /** @type {typeof globalThis.fetch} */
  const measuring = async (_input, init) => {
    bodies.push(String(init?.body ?? '').length);
    return new Response(JSON.stringify({ answers: {}, usage: { input_tokens: 1, output_tokens: 1 } }), {
      status: 200,
    });
  };

  // Ten rows of 20 KB diff context each: at 25 questions per call the old splitter sent all ten
  // as one ~200 KB request, the shape the endpoint refused.
  const batch = Array.from({ length: 10 }, (_, i) => ({ ...entry(i), surroundingDiff: 'd'.repeat(20_000) }));
  const got = await replayBatch(batch, SET, createBudget(), { key: 'test-key', fetchImpl: measuring });

  assert.ok(bodies.length > 1, 'a batch over the byte ceiling goes out as several calls');
  assert.ok(
    bodies.every((n) => n <= MAX_REQUEST_BYTES),
    `no request may exceed ${MAX_REQUEST_BYTES} bytes, got ${JSON.stringify(bodies)}`,
  );
  assert.equal(got.rows.length, 10, 'every corpus row still produces exactly one scored row');
  assert.deepEqual(
    got.calls.flatMap((c) => c.questionIds),
    Array.from({ length: 10 }, (_, i) => `c${i}`),
    'ids stay unique and contiguous across chunks of differing size',
  );
  // The size that was sent is on the record, so a refusal for size is readable without a re-run.
  assert.ok(got.calls.every((c) => c.requestBytes > 0));
});

test('a batch larger than the ceiling goes out as several calls, never one', async () => {
  const { replayBatch, MAX_QUESTIONS_PER_CALL } = await import('./subject-a.mjs');
  const { createBudget } = await import('../lib/jev.mjs');

  /** @type {number[]} */
  const seen = [];
  const batch = Array.from({ length: 125 }, (_, i) => entry(i));
  const got = await replayBatch(batch, SET, createBudget(), {
    key: 'test-key',
    fetchImpl: answeringFetch(MAX_QUESTIONS_PER_CALL, seen),
  });

  assert.equal(got.calls.length, 5, '125 rows at a ceiling of 25 is five calls');
  assert.deepEqual(seen, [25, 25, 25, 25, 25], 'no single request carried more than the ceiling');
  assert.equal(got.rows.length, 125, 'every corpus row still produces exactly one scored row');
  assert.ok(got.calls.every((c) => c.questionCount <= MAX_QUESTIONS_PER_CALL));
});

test('a call that answers fewer questions than it asked records which ids never came back', async () => {
  const { replayBatch } = await import('./subject-a.mjs');
  const { createBudget } = await import('../lib/jev.mjs');

  const batch = Array.from({ length: 10 }, (_, i) => entry(i));
  const got = await replayBatch(batch, SET, createBudget(), {
    chunkSize: 10,
    key: 'test-key',
    fetchImpl: answeringFetch(3),
  });

  const call = got.calls[0];
  assert.equal(call.questionCount, 10);
  assert.equal(call.answerCount, 3);
  assert.deepEqual(call.unansweredIds, ['c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']);
  // The invariant the 2026-09-17 run had nowhere to assert.
  assert.equal(call.answerCount + call.unansweredIds.length, call.questionCount);
  // The transport succeeded; the answers did not arrive. Both facts are kept.
  assert.equal(call.ok, true);
  assert.equal(call.reason, null);
});

test('question ids stay unique across chunks, so a record names the row it asked about', async () => {
  const { replayBatch } = await import('./subject-a.mjs');
  const { createBudget } = await import('../lib/jev.mjs');

  const batch = Array.from({ length: 6 }, (_, i) => entry(i));
  const got = await replayBatch(batch, SET, createBudget(), {
    chunkSize: 2,
    key: 'test-key',
    fetchImpl: answeringFetch(0),
  });

  const ids = got.calls.flatMap((c) => c.questionIds);
  assert.deepEqual(ids, ['c0', 'c1', 'c2', 'c3', 'c4', 'c5']);
  assert.equal(new Set(ids).size, 6);
});

test('every client reason reaches the call record, verbatim', async () => {
  const { replayBatch, summariseCalls } = await import('./subject-a.mjs');
  const { createBudget } = await import('../lib/jev.mjs');

  for (const [status, reason, needle] of [
    [401, 'bad-key', '401'],
    [422, 'validation', '422'],
  ]) {
    const got = await replayBatch([entry(0)], SET, createBudget(), {
      key: 'test-key',
      fetchImpl: statusFetch(Number(status), { error: { message: 'nope' } }),
    });
    assert.equal(got.calls[0].reason, reason);
    assert.match(got.calls[0].detail, new RegExp(String(needle)));

    // And it survives serialisation, which is the form the report is grepped in.
    const json = JSON.stringify({ calls: got.calls, integrity: summariseCalls(got.calls) });
    assert.match(json, new RegExp(String(reason)));
    assert.match(json, new RegExp(String(needle)));
  }
});

test('a timeout is carried as a reason rather than as an empty answer map', async () => {
  const { replayBatch } = await import('./subject-a.mjs');
  const { createBudget } = await import('../lib/jev.mjs');

  /** @type {typeof globalThis.fetch} */
  const timingOut = async () => {
    const err = new Error('the request timed out');
    err.name = 'TimeoutError';
    throw err;
  };
  const got = await replayBatch([entry(0)], SET, createBudget(), { key: 'test-key', fetchImpl: timingOut });
  assert.equal(got.calls[0].reason, 'timeout');
  assert.match(JSON.stringify(got.calls), /timeout/);
});

test('summariseCalls counts what was asked against what came back', async () => {
  const { replayBatch, summariseCalls } = await import('./subject-a.mjs');
  const { createBudget } = await import('../lib/jev.mjs');

  const batch = Array.from({ length: 8 }, (_, i) => entry(i));
  const got = await replayBatch(batch, SET, createBudget(), {
    chunkSize: 4,
    key: 'test-key',
    fetchImpl: answeringFetch(1),
  });
  const integrity = summariseCalls(got.calls);

  assert.equal(integrity.calls, 2);
  assert.equal(integrity.questionsAsked, 8);
  assert.equal(integrity.answersReturned, 2);
  assert.equal(integrity.questionsUnanswered, 6);
  assert.equal(integrity.callsShortOfAnswers, 2);
  assert.equal(integrity.complete, false);
});

test('a run that answered everything it asked is complete', async () => {
  const { replayBatch, summariseCalls } = await import('./subject-a.mjs');
  const { createBudget } = await import('../lib/jev.mjs');

  const batch = Array.from({ length: 4 }, (_, i) => entry(i));
  const got = await replayBatch(batch, SET, createBudget(), {
    chunkSize: 2,
    key: 'test-key',
    fetchImpl: answeringFetch(2),
  });
  assert.equal(summariseCalls(got.calls).complete, true);
});

test('a bar measured over an incomplete run is inconclusive, not a failure', async () => {
  const { scoreSubjectA, verdictOf } = await import('./bars.mjs');
  const bars = scoreSubjectA({
    labelledSize: 132,
    baseline: 0.865,
    agreementAtBand: 0.857,
    // The 2026-09-17 shape: 6 of 132 rows reached the band, because 125 were never answered.
    coverageAtBand: 6 / 132,
    priceRatio: null,
    latencyP95Ms: 1200,
    dataComplete: false,
  });

  const got = verdictOf(bars);
  assert.equal(got.verdict, 'inconclusive');
  assert.deepEqual(got.failing, [], 'nothing may fail on data this thin');
  assert.ok(got.inconclusive.includes('A.coverage'));
  assert.ok(got.inconclusive.includes('A.agreement'));
  assert.match(bars[1].detail, /describes the run, not the classifier/);
  // The observed number is kept rather than hidden — it is the evidence the run was broken.
  assert.equal(bars[1].observed, 6 / 132);
});

test('an incomplete run cannot turn a passing number into a pass either', async () => {
  const { scoreSubjectA, verdictOf } = await import('./bars.mjs');
  const bars = scoreSubjectA({
    labelledSize: 132,
    baseline: 0.5,
    agreementAtBand: 1,
    coverageAtBand: 1,
    priceRatio: 0.01,
    latencyP95Ms: 100,
    dataComplete: false,
  });
  assert.equal(verdictOf(bars).verdict, 'inconclusive');
  assert.ok(bars.every((b) => b.status === 'inconclusive'));
});

test('a genuine failure on complete data still abandons', async () => {
  const { scoreSubjectA, verdictOf } = await import('./bars.mjs');
  const bars = scoreSubjectA({
    labelledSize: 1911,
    baseline: 0.865,
    agreementAtBand: 0.93,
    coverageAtBand: 0.5,
    priceRatio: 0.05,
    latencyP95Ms: 1000,
    dataComplete: true,
  });
  const got = verdictOf(bars);
  assert.equal(got.verdict, 'abandon');
  assert.deepEqual(got.failing, ['A.agreement']);
});

test('the printed report separates an inconclusive run from an abandonment', async () => {
  const { format } = await import('./judge-eval.mjs');
  const { scoreSubjectA, verdictOf } = await import('./bars.mjs');
  const { summariseCalls } = await import('./subject-a.mjs');

  /** @type {import('./subject-a.mjs').CallRecord} */
  const short = {
    index: 0,
    file: 'src/a.mjs',
    chunkIndex: 0,
    chunkCount: 1,
    questionCount: 125,
    requestBytes: 4096,
    questionIds: Array.from({ length: 125 }, (_, i) => `c${i}`),
    answerCount: 7,
    unansweredIds: Array.from({ length: 118 }, (_, i) => `c${i + 7}`),
    ok: true,
    reason: null,
    detail: '',
    attempts: 1,
    latencyMs: 1200,
    usage: { input_tokens: 10, output_tokens: 2 },
  };
  const bars = scoreSubjectA({
    labelledSize: 132,
    baseline: 0.865,
    agreementAtBand: 0.857,
    coverageAtBand: 6 / 132,
    priceRatio: null,
    latencyP95Ms: 1200,
    dataComplete: false,
  });

  const text = format({
    generatedAt: '2026-09-17T00:00:00.000Z',
    apiKeyPresent: true,
    recorder: null,
    chunkSize: 25,
    maxRequestBytes: 98_304,
    subjectA: {
      corpus: {
        size: 132,
        commits: 2,
        counts: { keep: 114, delete: 18 },
        baseline: { label: 'keep', share: 0.865 },
        preFiltered: { total: 0, byRule: {} },
      },
      batches: 2,
      calls: [short],
      integrity: summariseCalls([short]),
      metrics: {
        agreement: { overall: 0.857, atBand: 0.857, coverage: 6 / 132, answered: 7, reached: 6, size: 132 },
        price: { inputTokens: 10, outputTokens: 2, totalTokens: 12, counted: 1, ratioOfDisplacedPass: null },
        latency: { p50: 1200, p95: 1200, samples: 132 },
        displacedContext: { total: 100, perRow: 1, rows: 132 },
      },
      bars,
      ...verdictOf(bars),
    },
    subjectB: {
      store: null,
      corpus: null,
      metrics: {
        agreement: { overall: null, atBand: null, coverage: null, answered: 0, reached: 0, size: 0 },
        price: { inputTokens: 0, outputTokens: 0, totalTokens: 0, counted: 0, ratioOfDisplacedPass: null },
        latency: { p50: null, p95: null, samples: 0 },
        displacedContext: { total: 0, perRow: null, rows: 0 },
      },
      bars: [],
      droppedToQuestionSetOnly: true,
      verdict: 'incomplete',
      failing: [],
      inconclusive: [],
      unmeasured: [],
    },
  });

  assert.match(text, /VERDICT: INCONCLUSIVE/);
  assert.ok(!/VERDICT: ABANDON/.test(text), 'a broken run must not print an abandonment');
  assert.match(text, /UNANSWERED:\s+118/);
  assert.match(text, /answered 7 of 125/);
  assert.match(text, /did not produce enough data to evaluate the bars/);
  // The unanswered rows are stated as unanswered rather than divided out of the denominator.
  assert.match(text, /125 never answered/);
  assert.ok(!/abandon if:/.test(text), 'no abandonment clause is quoted against an untested bar');
});

test('the recorder is resolved from a session file, and a stopped session is not offered', async () => {
  const { findRecorder } = await import('./judge-eval.mjs');
  const { mkdtempSync, mkdirSync: mkdir, writeFileSync: write } = await import('node:fs');
  const { tmpdir } = await import('node:os');

  const dir = mkdtempSync(join(tmpdir(), 'jev-record-'));
  /** @param {string} name @param {Record<string, unknown>} body */
  const session = (name, body) => {
    mkdir(join(dir, name), { recursive: true });
    write(join(dir, name, 'session.json'), JSON.stringify(body));
  };

  assert.equal(findRecorder(dir), null, 'an empty directory offers nothing');

  session('20260917T120000-aaaaaa', {
    v: 1,
    session: '20260917T120000-aaaaaa',
    url: 'http://127.0.0.1:1111',
    endedAt: '2026-09-17T12:05:00Z',
    endpoint: 'https://api.typesafe.ai/v1/systemone',
  });
  assert.equal(findRecorder(dir), null, 'a session that has stopped is not a live recorder');

  session('20260917T130000-bbbbbb', {
    v: 1,
    session: '20260917T130000-bbbbbb',
    url: 'http://127.0.0.1:2222',
    endpoint: 'https://api.typesafe.ai/v1/systemone',
  });
  assert.equal(findRecorder(dir)?.url, 'http://127.0.0.1:2222');

  // A format version this reader does not know is skipped rather than guessed at, per the spec.
  session('20260917T140000-cccccc', { v: 2, session: 'x', url: 'http://127.0.0.1:3333' });
  assert.equal(findRecorder(dir)?.url, 'http://127.0.0.1:2222');
});

test('--record and --chunk are parsed, and --record alone means find the session', async () => {
  const { parseArgs } = await import('./judge-eval.mjs');
  const { MAX_QUESTIONS_PER_CALL } = await import('./subject-a.mjs');

  assert.equal(parseArgs([]).chunk, MAX_QUESTIONS_PER_CALL);
  assert.equal(parseArgs(['--chunk', '10']).chunk, 10);
  assert.equal(parseArgs(['--chunk', '0']).chunk, MAX_QUESTIONS_PER_CALL, 'a nonsense ceiling is ignored');

  assert.equal(parseArgs([]).record, false);
  const bare = parseArgs(['--record', '--json']);
  assert.equal(bare.record, true);
  assert.equal(bare.recordUrl, undefined);
  assert.equal(bare.json, true, 'a bare --record does not swallow the flag after it');
  assert.equal(parseArgs(['--record', 'http://127.0.0.1:9']).recordUrl, 'http://127.0.0.1:9');
});

test('an unrecognised argument is refused before anything can be sent', async () => {
  const { parseArgs, UsageError } = await import('./judge-eval.mjs');

  assert.throws(() => parseArgs(['--help-me']), UsageError);
  assert.throws(() => parseArgs(['--dry-run']), /unrecognised argument: --dry-run/);
  assert.throws(() => parseArgs(['--limit', '5', '--nope']), /unrecognised argument: --nope/);
  // A stray value is as unrecognised as a stray flag.
  assert.throws(() => parseArgs(['subjectA']), /unrecognised argument: subjectA/);

  // The recognised flags still parse.
  assert.doesNotThrow(() => parseArgs(['--limit', '5', '--chunk', '10', '--json', '--out', '/tmp/x', '--record']));
});

test('--help asks for usage rather than for a replay', async () => {
  const { parseArgs, USAGE } = await import('./judge-eval.mjs');

  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs([]).help, false);
  // Usage names every flag it accepts, and says plainly that a run costs money.
  for (const flag of ['--limit', '--chunk', '--bytes', '--record', '--json', '--out', '--help']) {
    assert.ok(USAGE.includes(flag), `usage does not mention ${flag}`);
  }
  assert.match(USAGE, /spends real budget/);
});

test('the harness exits non-zero on a bad flag and zero on --help, calling nothing either way', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);

  // No key in the child's environment, so the test stays offline whichever way the guard behaves.
  const env = { ...process.env, TYPESAFE_API_KEY: '' };
  const harness = join(ROOT, HARNESS);

  const helped = await run(process.execPath, [harness, '--help'], { env });
  assert.match(helped.stdout, /pnpm judge:eval \[options\]/);
  assert.ok(!helped.stdout.includes('Subject A —'), '--help must not run the eval');

  await assert.rejects(
    run(process.execPath, [harness, '--nonsense'], { env }),
    (/** @type {Error & {code?: number, stderr?: string}} */ err) => {
      assert.equal(err.code, 1);
      assert.match(String(err.stderr), /unrecognised argument: --nonsense/);
      assert.match(String(err.stderr), /pnpm judge:eval \[options\]/);
      return true;
    },
  );
});

test('the replay routes through the endpoint it is given', async () => {
  const { replayBatch } = await import('./subject-a.mjs');
  const { createBudget } = await import('../lib/jev.mjs');

  /** @type {string[]} */
  const urls = [];
  /** @type {typeof globalThis.fetch} */
  const recording = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ answers: {} }), { status: 200 });
  };
  await replayBatch([entry(0)], SET, createBudget(), {
    key: 'test-key',
    endpoint: 'http://127.0.0.1:4321/v1/systemone',
    fetchImpl: recording,
  });
  assert.deepEqual(urls, ['http://127.0.0.1:4321/v1/systemone']);
});
