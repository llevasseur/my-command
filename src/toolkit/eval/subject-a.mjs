// Subject A's replay: /clean's comment keep/drop, scored against labels git already recorded.
//
// The corpus is ticket 04's — `src/toolkit/lib/clean-corpus.mjs` recovers it from this
// repository's own /clean commits, with the ADR 0011 pre-filter applied so a comment the runtime
// path would never ask about never becomes a scored row. Nothing here rebuilds any of that.
//
// **A call's own failure is data this module carries, not data it discards.**
// `src/toolkit/lib/jev.mjs` never throws: no key, a 401, a 422, a timeout and a body that answered
// 7 of 125 questions all arrive as a result whose answer map is short or empty, which
// `docs/adrs/0013-the-eval-bar-is-pre-registered.md` fixes as the layer's contract. That contract
// is right for a runtime caller and wrong for an eval, because the same emptiness reaches a verdict
// as "the classifier was not confident". So every call made here is recorded whole — what it asked,
// what came back, which ids never came back, and why — and
// `docs/adrs/0016-the-eval-reports-its-own-failures.md` is the decision that it must be.

import { readFileSync } from 'node:fs';
import { buildCorpus, summarise } from '../lib/clean-corpus.mjs';
import { ask, buildRequest } from '../lib/jev.mjs';
import { recordOrEmpty } from '../lib/json.mjs';

/** The question set ticket 03 versioned. Read, never written. */
const SET_PATH = 'src/toolkit/judge/clean-comment.json';

/**
 * The most questions one call may carry.
 *
 * ADR 0013 measures latency as "p95 for one batched call covering a file's comments", and the
 * client's own `buildRequest` says why the batch exists at all: Speculative Fan-Out makes several
 * questions in one call cost less than several calls. Neither is an argument for an unbounded
 * batch, and the run of 2026-09-17 is what an unbounded batch does — one file's 125 comments went
 * out as a single 125-question request and 7 answers came back, which the harness then read as 118
 * rows of low confidence.
 *
 * So the batch stays batched and gains a ceiling. 25 is small enough that one short answer costs a
 * bounded number of rows and large enough to keep the fan-out advantage the ADR priced; a file
 * under the ceiling is still exactly one call, which is the shape ADR 0013's latency bar was
 * written against. Above it, latency p95 becomes a per-call number covering part of a file, and
 * ADR 0016 records that as a deliberate consequence rather than leaving it to be inferred here.
 *
 * Question count only; `MAX_REQUEST_BYTES` below bounds body size. Both apply to every call.
 *
 * Overridable per run — `--chunk <n>` on the harness, `chunkSize` here.
 */
export const MAX_QUESTIONS_PER_CALL = 25;

/**
 * The set's options as a `choice` question's criteria: option id to its rubric.
 *
 * Built from the file rather than restated, so a rubric edit in ticket 03's set reaches the eval
 * without an edit here.
 * @param {string} root
 * @returns {{question: string, criteria: Record<string, string>}}
 */
export function loadQuestionSet(root) {
  const raw = JSON.parse(readFileSync(`${root}/${SET_PATH}`, 'utf8'));
  const set = recordOrEmpty(raw);
  /** @type {Record<string, string>} */
  const criteria = {};
  const options = Array.isArray(set.options) ? set.options : [];
  for (const option of options) {
    const o = recordOrEmpty(option);
    const id = String(o.id ?? '');
    if (id === '') continue;
    criteria[id] = String(o.rubric ?? '');
  }
  return { question: String(set.question ?? ''), criteria };
}

/**
 * The corpus grouped into the batches a call covers: one per file within one /clean commit.
 * @param {import('../lib/clean-corpus.mjs').CorpusEntry[]} entries
 * @returns {import('../lib/clean-corpus.mjs').CorpusEntry[][]}
 */
export function batchByFile(entries) {
  /** @type {Map<string, import('../lib/clean-corpus.mjs').CorpusEntry[]>} */
  const batches = new Map();
  for (const entry of entries) {
    const key = `${entry.commit}:${entry.file}`;
    const got = batches.get(key);
    if (got === undefined) batches.set(key, [entry]);
    else got.push(entry);
  }
  return [...batches.values()];
}

/**
 * The most bytes one serialised request body may carry.
 *
 * The endpoint caps a request's input tokens and refuses anything above it with `400` and a body
 * of `{"detail":{"error_type":"max_tokens_exceeded"}}`. `MAX_QUESTIONS_PER_CALL` bounds how many
 * questions a call asks, never how large they are, so 25 comments carrying long `surroundingDiff`
 * context went past the cap and every call for that file was refused.
 *
 * There is no documented limit, so 96 KiB comes from what the endpoint has been observed to
 * accept: a 130,000-byte body accepted, a 133,000-byte one refused, and 124,761 bytes the largest
 * accepted on 2026-09-17. Corpus text runs 2.95–3.80 bytes to the token, so at the densest 96 KiB
 * is about 33,300 tokens — under the 35,238 seen accepted, the margin covering a byte count
 * standing in for a token count it cannot compute.
 *
 * Overridable per run with `--bytes <n>` on the harness, `maxBytes` here.
 */
export const MAX_REQUEST_BYTES = 98_304;

/**
 * One batch split into the requests it will actually be sent as, in order.
 *
 * Two ceilings: at most `maxItems` questions and at most `maxBytes` of serialised body. A ceiling
 * of zero or less is read as no ceiling rather than silently dropping the batch.
 *
 * **An item too large to fit alone is still sent, alone.** ADR 0016 keeps an unanswered row
 * counted, and a row that was never asked about cannot be.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => number} sizeOf Bytes this item contributes to a request body.
 * @param {object} [opts]
 * @param {number} [opts.maxItems]
 * @param {number} [opts.maxBytes]
 * @param {number} [opts.envelope] Bytes every request carries whatever it asks.
 * @returns {T[][]}
 */
export function packChunks(items, sizeOf, opts = {}) {
  const maxItems = bound(opts.maxItems, MAX_QUESTIONS_PER_CALL);
  const maxBytes = bound(opts.maxBytes, MAX_REQUEST_BYTES);
  const envelope = Number.isFinite(opts.envelope) ? Number(opts.envelope) : 0;

  /** @type {T[][]} */
  const chunks = [];
  /** @type {T[]} */
  let current = [];
  let bytes = envelope;

  for (const item of items) {
    const size = sizeOf(item);
    if (current.length > 0 && (current.length >= maxItems || bytes + size > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = envelope;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * A ceiling as a usable number, or `Infinity` for one that cannot bound anything.
 * @param {number | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function bound(value, fallback) {
  const n = value ?? fallback;
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

/**
 * A rough token count for state that was never sent, used only for the displaced-context metric.
 *
 * Four characters to the token is the conventional English approximation. It is never used for
 * price: ADR 0013 requires price to come from the returned `usage` counts, and it does.
 * @param {string} text
 * @returns {number}
 */
export function approximateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * The state one comment is judged on: the comment, the code beside it, and the branch work /clean
 * judged it against. `src/toolkit/judge/clean-comment.json` fixes those three.
 * @param {import('../lib/clean-corpus.mjs').CorpusEntry} entry
 */
function stateOf(entry) {
  return {
    comment: entry.comment,
    code: entry.codeContext,
    surroundingDiff: entry.surroundingDiff,
    file: entry.file,
    line: entry.line,
  };
}

/**
 * What one call asked and what it got, recorded whether or not it worked.
 *
 * `answered + unansweredIds.length === questionCount` always holds, which is the assertion the
 * 2026-09-17 run had nowhere to make. `ok: true` with a non-empty `unansweredIds` is the exact
 * shape that run hit: the transport succeeded and the answers did not arrive.
 * @typedef {object} CallRecord
 * @property {number} index Position in the run's call order, from 0.
 * @property {string} file The corpus file this call's questions came from.
 * @property {number} chunkIndex Which chunk of that file's batch, from 0.
 * @property {number} chunkCount How many chunks that batch was split into.
 * @property {number} questionCount
 * @property {number} requestBytes The serialised body's own length, so a refusal for size is
 *   readable from the report rather than reproduced.
 * @property {string[]} questionIds Keyed exactly as they were sent.
 * @property {number} answerCount
 * @property {string[]} unansweredIds Asked and never answered. The 7-of-125 signal.
 * @property {boolean} ok What the client reported.
 * @property {string | null} reason The client's `JevReason`, verbatim.
 * @property {string} detail The client's free-text detail, verbatim.
 * @property {number} attempts Requests actually sent.
 * @property {number} latencyMs
 * @property {{input_tokens: number, output_tokens: number}} usage
 */

/**
 * Replay one batch against the endpoint and score every row in it.
 *
 * The batch goes out as one or more calls of at most `chunkSize` questions. Cost, latency and
 * displaced context are charged to the first row **of each chunk**, because each chunk is its own
 * call — charging the whole batch to its first row would drop every chunk after the first out of
 * the price metric, which is how the 2026-09-17 run counted one call of the two it made.
 *
 * @param {import('../lib/clean-corpus.mjs').CorpusEntry[]} batch
 * @param {{question: string, criteria: Record<string, string>}} set
 * @param {import('../lib/jev.mjs').JevBudget} budget
 * @param {object} [opts]
 * @param {number} [opts.chunkSize]
 * @param {number} [opts.maxBytes]
 * @param {string} [opts.endpoint] Passed to `ask()` — a recorder's URL routes the call through it.
 * @param {string} [opts.key] Injected in tests; otherwise the client reads the environment.
 * @param {typeof globalThis.fetch} [opts.fetchImpl] Injected in tests. Nothing here mocks modules.
 * @param {number} [opts.firstCallIndex] Where this batch's calls sit in the run's call order.
 * @returns {Promise<{rows: import('./metrics.mjs').Scored[], calls: CallRecord[]}>}
 */
export async function replayBatch(batch, set, budget, opts = {}) {
  /** One entry's question, which is the same for every row: the set's rubric, verbatim. */
  const questionOf = () =>
    /** @type {import('../lib/jev.mjs').JevQuestion} */ ({
      type: 'choice',
      instructions: set.question,
      criteria: set.criteria,
    });

  // What one row adds to a body — state, question, joining punctuation — measured off the real
  // builder rather than estimated, so a change to either shape moves this with it.
  const envelope = JSON.stringify(buildRequest([], {})).length;
  const perQuestion = JSON.stringify(questionOf()).length + '"c000":,'.length;
  /** @param {import('../lib/clean-corpus.mjs').CorpusEntry} entry */
  const sizeOf = (entry) => JSON.stringify(stateOf(entry)).length + 1 + perQuestion;

  const chunks = packChunks(batch, sizeOf, {
    maxItems: opts.chunkSize,
    maxBytes: opts.maxBytes,
    envelope,
  });
  const file = batch.length === 0 ? '' : batch[0].file;

  /** @type {import('./metrics.mjs').Scored[]} */
  const rows = [];
  /** @type {CallRecord[]} */
  const calls = [];
  // Chunks vary in size, so the next id is counted rather than multiplied out of the chunk index.
  // Keys stay unique across the batch, so `questionIds` name the same rows the corpus does.
  let asked = 0;

  for (const [chunkIndex, entries] of chunks.entries()) {
    /** @type {Record<string, import('../lib/jev.mjs').JevQuestion>} */
    const questions = {};
    const questionIds = entries.map((_entry, i) => `c${asked + i}`);
    for (const id of questionIds) questions[id] = questionOf();
    asked += entries.length;

    const state = entries.map(stateOf);
    const displaced = approximateTokens(JSON.stringify(state));
    const requestBytes = JSON.stringify(buildRequest(state, questions)).length;

    const started = Date.now();
    const result = await ask({
      state,
      questions,
      budget,
      endpoint: opts.endpoint,
      key: opts.key,
      fetchImpl: opts.fetchImpl,
    });
    const elapsed = Date.now() - started;

    /** @type {string[]} */
    const unansweredIds = [];
    for (const [i, id] of questionIds.entries()) {
      const answer = result.answers[id];
      const choice = answer !== undefined && answer.type === 'choice' ? answer : null;
      if (choice === null) unansweredIds.push(id);
      rows.push({
        expected: entries[i].label,
        actual: choice === null ? null : choice.choice,
        confidence: choice === null ? 0 : choice.confidence,
        latencyMs: elapsed,
        inputTokens: i === 0 ? result.usage.input_tokens : 0,
        outputTokens: i === 0 ? result.usage.output_tokens : 0,
        displacedTokens: i === 0 ? displaced : 0,
      });
    }

    calls.push({
      index: (opts.firstCallIndex ?? 0) + chunkIndex,
      file,
      chunkIndex,
      chunkCount: chunks.length,
      questionCount: questionIds.length,
      requestBytes,
      questionIds,
      answerCount: questionIds.length - unansweredIds.length,
      unansweredIds,
      ok: result.ok,
      reason: result.reason,
      detail: result.detail,
      attempts: result.attempts,
      latencyMs: elapsed,
      usage: result.usage,
    });
  }

  return { rows, calls };
}

/**
 * What the run's calls add up to, as the one place a reader learns whether the numbers beside it
 * mean anything.
 *
 * `complete` is the gate the bars read. It is deliberately strict: one unanswered question is
 * enough to make every replay-derived number a statement about a partial run rather than about the
 * classifier, and ADR 0016 would rather report that than average over it.
 * @param {CallRecord[]} calls
 */
export function summariseCalls(calls) {
  const questionsAsked = calls.reduce((n, c) => n + c.questionCount, 0);
  const answersReturned = calls.reduce((n, c) => n + c.answerCount, 0);
  const failed = calls.filter((c) => !c.ok);
  const short = calls.filter((c) => c.ok && c.unansweredIds.length > 0);

  // Each distinct reason once, with how many calls carried it — a run that timed out forty times
  // says so in one line rather than forty identical ones, and the detail is kept verbatim so a
  // grep for 401, 422 or timeout finds the endpoint's own words.
  /** @type {Map<string, {reason: string, detail: string, calls: number}>} */
  const byReason = new Map();
  for (const call of failed) {
    const reason = call.reason ?? 'unknown';
    const key = `${reason} ${call.detail}`;
    const got = byReason.get(key);
    if (got === undefined) byReason.set(key, { reason, detail: call.detail, calls: 1 });
    else got.calls += 1;
  }

  return {
    calls: calls.length,
    callsFailed: failed.length,
    callsShortOfAnswers: short.length,
    questionsAsked,
    answersReturned,
    questionsUnanswered: questionsAsked - answersReturned,
    reasons: [...byReason.values()],
    complete: calls.length > 0 && failed.length === 0 && questionsAsked === answersReturned,
  };
}

/**
 * Recover the corpus and, when a key is present, replay it.
 *
 * The corpus half needs no network and always runs: it is what lets a run with no key still report
 * the size and the baseline, which ADR 0013 requires before any agreement number in any case.
 * @param {string} root
 * @param {object} opts
 * @param {number} [opts.limit]
 * @param {import('../lib/jev.mjs').JevBudget} opts.budget
 * @param {boolean} opts.replay
 * @param {number} [opts.chunkSize]
 * @param {number} [opts.maxBytes]
 * @param {string} [opts.endpoint]
 * @param {string} [opts.key]
 * @param {typeof globalThis.fetch} [opts.fetchImpl]
 */
export async function runSubjectA(root, opts) {
  const corpus = buildCorpus(root, opts.limit === undefined ? {} : { limit: opts.limit });
  const summary = summarise(corpus);

  if (!opts.replay) {
    return {
      summary,
      rows: /** @type {import('./metrics.mjs').Scored[]} */ ([]),
      batches: 0,
      calls: /** @type {CallRecord[]} */ ([]),
      // A run that asked nothing broke nothing. Its bars report `not-measured` on their own, and
      // calling it incomplete here would read as a failure where there was only an absent key.
      integrity: { ...summariseCalls([]), complete: true },
    };
  }

  const batches = batchByFile(corpus.entries);
  /** @type {import('./metrics.mjs').Scored[]} */
  const rows = [];
  /** @type {CallRecord[]} */
  const calls = [];

  const set = loadQuestionSet(root);
  for (const batch of batches) {
    const got = await replayBatch(batch, set, opts.budget, {
      chunkSize: opts.chunkSize,
      maxBytes: opts.maxBytes,
      endpoint: opts.endpoint,
      key: opts.key,
      fetchImpl: opts.fetchImpl,
      firstCallIndex: calls.length,
    });
    rows.push(...got.rows);
    calls.push(...got.calls);
  }

  return { summary, rows, batches: batches.length, calls, integrity: summariseCalls(calls) };
}
