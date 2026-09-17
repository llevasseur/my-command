// Subject A's replay: /clean's comment keep/drop, scored against labels git already recorded.
//
// The corpus is ticket 04's — `src/toolkit/lib/clean-corpus.mjs` recovers it from this
// repository's own /clean commits, with the ADR 0011 pre-filter applied so a comment the runtime
// path would never ask about never becomes a scored row. Nothing here rebuilds any of that.
//
// One call covers a whole file's comments. `docs/adrs/0013-the-eval-bar-is-pre-registered.md`
// measures latency as "p95 for one batched call covering a file's comments", and the client's own
// `buildRequest` says why: Speculative Fan-Out makes several questions in one call cost less than
// several calls, so there is no loop over questions here.

import { readFileSync } from 'node:fs';
import { buildCorpus, summarise } from '../lib/clean-corpus.mjs';
import { ask } from '../lib/jev.mjs';
import { recordOrEmpty } from '../lib/json.mjs';

/** The question set ticket 03 versioned. Read, never written. */
const SET_PATH = 'src/toolkit/judge/clean-comment.json';

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
 * Replay one batch against the endpoint and score every row in it.
 * @param {import('../lib/clean-corpus.mjs').CorpusEntry[]} batch
 * @param {{question: string, criteria: Record<string, string>}} set
 * @param {import('../lib/jev.mjs').JevBudget} budget
 * @returns {Promise<{rows: import('./metrics.mjs').Scored[], reason: string | null}>}
 */
export async function replayBatch(batch, set, budget) {
  /** @type {Record<string, import('../lib/jev.mjs').JevQuestion>} */
  const questions = {};
  batch.forEach((_entry, i) => {
    questions[`c${i}`] = { type: 'choice', instructions: set.question, criteria: set.criteria };
  });

  const state = batch.map(stateOf);
  const displaced = approximateTokens(JSON.stringify(state));

  const started = Date.now();
  const result = await ask({ state, questions, budget });
  const elapsed = Date.now() - started;

  // The whole batch went in one call, so the call's cost and latency belong to the batch. Charging
  // each row the full figure would multiply both by the batch size.
  const rows = batch.map((entry, i) => {
    const answer = result.answers[`c${i}`];
    const choice = answer !== undefined && answer.type === 'choice' ? answer : null;
    return {
      expected: entry.label,
      actual: choice === null ? null : choice.choice,
      confidence: choice === null ? 0 : choice.confidence,
      latencyMs: elapsed,
      inputTokens: i === 0 ? result.usage.input_tokens : 0,
      outputTokens: i === 0 ? result.usage.output_tokens : 0,
      displacedTokens: i === 0 ? displaced : 0,
    };
  });

  return { rows, reason: result.ok ? null : result.detail };
}

/**
 * Recover the corpus and, when a key is present, replay it.
 *
 * The corpus half needs no network and always runs: it is what lets a run with no key still report
 * the size and the baseline, which ADR 0013 requires before any agreement number in any case.
 * @param {string} root
 * @param {{limit?: number, budget: import('../lib/jev.mjs').JevBudget, replay: boolean}} opts
 */
export async function runSubjectA(root, opts) {
  const corpus = buildCorpus(root, opts.limit === undefined ? {} : { limit: opts.limit });
  const summary = summarise(corpus);

  if (!opts.replay) {
    return { summary, rows: /** @type {import('./metrics.mjs').Scored[]} */ ([]), batches: 0, failure: null };
  }

  const batches = batchByFile(corpus.entries);
  /** @type {import('./metrics.mjs').Scored[]} */
  const rows = [];
  /** @type {string | null} */
  let failure = null;

  const set = loadQuestionSet(root);
  for (const batch of batches) {
    const got = await replayBatch(batch, set, opts.budget);
    rows.push(...got.rows);
    if (got.reason !== null && failure === null) failure = got.reason;
  }

  return { summary, rows, batches: batches.length, failure };
}
