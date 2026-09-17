// The client's whole contract is that it never makes a caller's correctness depend on catching
// something, so most of what is asserted here is a failure producing a result rather than a
// throw. The retry tests are the other half: a pause is only correct on the two statuses that
// waiting can help, and sending a refused key again is a wasted round trip.
//
// `fetch` and the backoff sleep are injected rather than module-mocked — the repo's anti-slop
// lint forbids module mocking, and injection is what lets the backoff be asserted instead of
// slept through. No test here touches the network, and the key every test passes is an obvious
// placeholder: a real one would be published, since `package.json` ships `src`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ask,
  budgetReached,
  buildRequest,
  createBudget,
  isHighConfidenceNoul,
  NOUL_HIGH_CONFIDENCE_DISTANCE,
  noulConfidence,
} from './jev.mjs';

const KEY = 'test-placeholder-not-a-real-key';

/** @typedef {{ status: number, body?: unknown, raw?: string }} Step */

/**
 * A `fetch` that answers from a script, one step per call, repeating the last step once the
 * script runs out. Records what it was called with so the request can be asserted.
 * @param {Step[]} script
 */
function stubFetch(script) {
  /** @type {Array<{ url: string, init: RequestInit }>} */
  const calls = [];
  /** @type {typeof globalThis.fetch} */
  const fetchImpl = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    const payload = step.raw ?? JSON.stringify(step.body ?? {});
    return new Response(payload, { status: step.status });
  };
  return { fetchImpl, calls };
}

/** A sleep that records its pauses instead of taking them. */
function stubSleep() {
  /** @type {number[]} */
  const slept = [];
  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  const sleep = async (ms) => {
    slept.push(ms);
  };
  return { sleep, slept };
}

/** A well-formed response carrying one noul answer. */
const NOUL_OK = {
  status: 200,
  body: {
    model: 'jev-latest',
    answers: { verdict: { type: 'noul', noul: 0.93 } },
    usage: { input_tokens: 100, output_tokens: 20 },
  },
};

/** @type {Record<string, import('./jev.mjs').JevQuestion>} */
const ONE_NOUL = { verdict: { type: 'noul', instructions: 'Is this command safe to run?' } };

test('buildRequest carries the state, the fixed model and every question in one body', () => {
  const body = buildRequest('some state', ONE_NOUL);
  assert.equal(body.model, 'jev-latest');
  assert.equal(body.state, 'some state');
  assert.deepEqual(Object.keys(body.questions), ['verdict']);
});

test('buildRequest forwards a state that is an object or an array untouched', () => {
  assert.deepEqual(buildRequest({ turns: 3 }, ONE_NOUL).state, { turns: 3 });
  assert.deepEqual(buildRequest([1, 2], ONE_NOUL).state, [1, 2]);
});

test('a whole question map is one request, and the caller keys come back identical', async () => {
  const { fetchImpl, calls } = stubFetch([
    {
      status: 200,
      body: {
        model: 'jev-latest',
        answers: {
          keep_it: { type: 'choice', choice: 'keep', probabilities: { keep: 0.8, drop: 0.2 }, confidence: 0.8 },
          how_good: {
            type: 'score',
            score: 2.4,
            legend: ['poor', 'fair', 'good'],
            probabilities: { poor: 0.1, fair: 0.4, good: 0.5 },
            confidence: 0.7,
          },
          verdict: { type: 'noul', noul: 0.12 },
        },
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    },
  ]);

  const result = await ask({
    state: 'a file of comments',
    questions: {
      keep_it: { type: 'choice', criteria: { keep: 'it earns its line', drop: null } },
      how_good: { type: 'score', criteria: ['poor', 'fair', 'good'] },
      verdict: { type: 'noul', instructions: 'Is it judgeable?' },
    },
    key: KEY,
    fetchImpl,
  });

  // Speculative Fan-Out: three questions, one round trip. A loop here would cost three.
  assert.equal(calls.length, 1);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.answers).sort(), ['how_good', 'keep_it', 'verdict']);
});

test('the request is a POST carrying the bearer key and a JSON content type', async () => {
  const { fetchImpl, calls } = stubFetch([NOUL_OK]);
  await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl });

  const { url, init } = calls[0];
  assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });
});

test('a noul answer carries no confidence field at all', async () => {
  const { fetchImpl } = stubFetch([NOUL_OK]);
  const result = await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl });

  assert.deepEqual(result.answers.verdict, { type: 'noul', noul: 0.93 });
  // The API sends none, and inventing one here would be a second definition of the band.
  assert.equal(Object.hasOwn(result.answers.verdict, 'confidence'), false);
});

test('a score answer keeps its legend and may land between two levels', async () => {
  const { fetchImpl } = stubFetch([
    {
      status: 200,
      body: {
        model: 'jev-latest',
        answers: {
          how_good: {
            type: 'score',
            score: 1.6,
            legend: ['poor', 'fair', 'good'],
            probabilities: { poor: 0.2, fair: 0.6, good: 0.2 },
            confidence: 0.6,
          },
        },
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    },
  ]);

  const result = await ask({
    state: 's',
    questions: { how_good: { type: 'score', criteria: ['poor', 'fair', 'good'] } },
    key: KEY,
    fetchImpl,
  });

  const answer = result.answers.how_good;
  assert.equal(answer.type, 'score');
  if (answer.type !== 'score') return;
  assert.equal(answer.score, 1.6);
  assert.deepEqual(answer.legend, ['poor', 'fair', 'good']);
});

test('noulConfidence reads a noul by its own distance from the middle', () => {
  assert.equal(noulConfidence(0.5), 0);
  assert.equal(noulConfidence(1), 1);
  assert.equal(noulConfidence(0), 1);
  assert.equal(Math.round(noulConfidence(0.9) * 100), 80);
  // Not a usable probability: no confidence rather than a number computed from nonsense.
  assert.equal(noulConfidence(Number.NaN), 0);
});

test('isHighConfidenceNoul is the band ADR 0013 pre-registered, and only that band', () => {
  assert.equal(NOUL_HIGH_CONFIDENCE_DISTANCE, 0.4);
  assert.equal(isHighConfidenceNoul(0.9), true);
  assert.equal(isHighConfidenceNoul(0.1), true);
  assert.equal(isHighConfidenceNoul(0.89), false);
  assert.equal(isHighConfidenceNoul(0.11), false);
  assert.equal(isHighConfidenceNoul(0.5), false);
});

test('no key fails open, with no request sent and no error raised', async () => {
  const { fetchImpl, calls } = stubFetch([NOUL_OK]);
  const before = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;

  const result = await ask({ state: 's', questions: ONE_NOUL, fetchImpl });

  if (before !== undefined) process.env.TYPESAFE_API_KEY = before;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-key');
  assert.deepEqual(result.answers, {});
  assert.equal(calls.length, 0);
});

test('a 401 fails open and is never retried', async () => {
  const { fetchImpl, calls } = stubFetch([{ status: 401 }]);
  const { sleep, slept } = stubSleep();

  const result = await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl, sleep });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad-key');
  assert.deepEqual(result.answers, {});
  // Retrying a refused key cannot help, so there is one attempt and no pause.
  assert.equal(calls.length, 1);
  assert.deepEqual(slept, []);
});

test('a 422 fails open naming the offending field, and is never retried', async () => {
  const { fetchImpl, calls } = stubFetch([
    { status: 422, raw: '{"error":{"field":"questions.pick.criteria","message":"required for a choice"}}' },
  ]);
  const { sleep, slept } = stubSleep();

  const result = await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl, sleep });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'validation');
  assert.match(result.detail, /questions\.pick\.criteria/);
  assert.equal(calls.length, 1);
  assert.deepEqual(slept, []);
});

test('a 429 backs off exponentially and then fails open once the retries are spent', async () => {
  const { fetchImpl, calls } = stubFetch([{ status: 429 }]);
  const { sleep, slept } = stubSleep();

  const result = await ask({
    state: 's',
    questions: ONE_NOUL,
    key: KEY,
    fetchImpl,
    sleep,
    maxRetries: 3,
    backoffMs: 100,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rate-limited');
  assert.deepEqual(result.answers, {});
  assert.equal(calls.length, 4);
  assert.deepEqual(slept, [100, 200, 400]);
});

test('a 529 backs off exponentially and then fails open once the retries are spent', async () => {
  const { fetchImpl, calls } = stubFetch([{ status: 529 }]);
  const { sleep, slept } = stubSleep();

  const result = await ask({
    state: 's',
    questions: ONE_NOUL,
    key: KEY,
    fetchImpl,
    sleep,
    maxRetries: 2,
    backoffMs: 50,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'overloaded');
  assert.equal(calls.length, 3);
  assert.deepEqual(slept, [50, 100]);
});

test('a 429 that clears on the retry answers normally', async () => {
  const { fetchImpl, calls } = stubFetch([{ status: 429 }, NOUL_OK]);
  const { sleep, slept } = stubSleep();

  const result = await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl, sleep, backoffMs: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.answers.verdict.type, 'noul');
  assert.equal(calls.length, 2);
  assert.deepEqual(slept, [10]);
});

test('a timeout fails open', async () => {
  /** @type {typeof globalThis.fetch} */
  const fetchImpl = async () => {
    throw new DOMException('the operation timed out', 'TimeoutError');
  };

  const result = await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
  assert.deepEqual(result.answers, {});
});

test('a transport failure fails open', async () => {
  /** @type {typeof globalThis.fetch} */
  const fetchImpl = async () => {
    throw new TypeError('fetch failed');
  };

  const result = await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'transport');
  assert.deepEqual(result.answers, {});
});

test('a response that is not JSON fails open', async () => {
  const { fetchImpl } = stubFetch([{ status: 200, raw: 'not json at all' }]);

  const result = await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'malformed');
  assert.deepEqual(result.answers, {});
});

test('a response carrying no answers map fails open', async () => {
  const { fetchImpl } = stubFetch([{ status: 200, body: { model: 'jev-latest' } }]);

  const result = await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'malformed');
});

test('an unreadable answer is simply absent, and its readable siblings survive', async () => {
  const { fetchImpl } = stubFetch([
    {
      status: 200,
      body: {
        model: 'jev-latest',
        answers: {
          broken: { type: 'noul' },
          verdict: { type: 'noul', noul: 0.2 },
        },
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    },
  ]);

  const result = await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl });

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.answers), ['verdict']);
});

test('an unexpected status fails open', async () => {
  const { fetchImpl } = stubFetch([{ status: 500 }]);

  const result = await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'http');
  assert.deepEqual(result.answers, {});
});

test('a question map the endpoint would reject fails open before a request is spent', async () => {
  const { fetchImpl, calls } = stubFetch([NOUL_OK]);

  const noCriteria = await ask({
    state: 's',
    // @ts-expect-error — a choice without criteria is exactly what this rejects.
    questions: { pick: { type: 'choice' } },
    key: KEY,
    fetchImpl,
  });
  const tooFewLevels = await ask({
    state: 's',
    questions: { grade: { type: 'score', criteria: ['only-one'] } },
    key: KEY,
    fetchImpl,
  });

  assert.equal(noCriteria.reason, 'invalid-request');
  assert.match(noCriteria.detail, /criteria is required for a choice/);
  assert.equal(tooFewLevels.reason, 'invalid-request');
  assert.match(tooFewLevels.detail, /at least two levels/);
  assert.equal(calls.length, 0);
});

test('the spend cap fails open rather than throwing, and sends no further request', async () => {
  const { fetchImpl, calls } = stubFetch([NOUL_OK]);
  const budget = createBudget(100);

  // The first call is affordable and spends 120 tokens, taking the run past its cap.
  const first = await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl, budget });
  assert.equal(first.ok, true);
  assert.equal(budget.spent, 120);
  assert.equal(budgetReached(budget), true);

  // The second must not throw. It answers nothing, which is what every caller already handles.
  const second = await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl, budget });

  assert.equal(second.ok, false);
  assert.equal(second.reason, 'spend-cap');
  assert.deepEqual(second.answers, {});
  assert.equal(calls.length, 1);
});

test('a budget accumulates across calls, and an uncapped run never reaches its cap', async () => {
  const { fetchImpl } = stubFetch([NOUL_OK]);
  const budget = createBudget();

  await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl, budget });
  await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl, budget });

  assert.equal(budget.spent, 240);
  assert.equal(budgetReached(budget), false);
  assert.equal(budgetReached(undefined), false);
});

test('tokens are charged even when the answers came back unreadable', async () => {
  const { fetchImpl } = stubFetch([
    { status: 200, body: { model: 'jev-latest', answers: {}, usage: { input_tokens: 7, output_tokens: 3 } } },
  ]);
  const budget = createBudget(1000);

  await ask({ state: 's', questions: ONE_NOUL, key: KEY, fetchImpl, budget });

  // A cap that only counted successful answers would not be a spend cap.
  assert.equal(budget.spent, 10);
});

test('the key is read from the environment when none was passed', async () => {
  const { fetchImpl, calls } = stubFetch([NOUL_OK]);
  const before = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = KEY;

  await ask({ state: 's', questions: ONE_NOUL, fetchImpl });

  if (before === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = before;
  assert.deepEqual(calls[0].init.headers, { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });
});
