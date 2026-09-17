// The four metrics ADR 0013 asks of every subject, computed rather than estimated.
//
// They can disagree — a classifier can agree often and cost too much, or be cheap and slow — so
// all four are reported side by side and none of them stands in for another.
//
// Nothing here touches the network or the filesystem. That is deliberate: it is what lets the
// deterministic test suite exercise the arithmetic while `pnpm judge:eval` stays out of every gate.

/**
 * One replayed row: what history recorded, what the classifier said, and what the call cost.
 * @typedef {object} Scored
 * @property {string} expected The recorded label.
 * @property {string | null} actual What came back, or null when nothing did.
 * @property {number} confidence 0..1, already normalised to a distance-from-certainty scale.
 * @property {number} latencyMs
 * @property {number} inputTokens From the response's own usage block.
 * @property {number} outputTokens From the response's own usage block.
 * @property {number} displacedTokens State the agent never had to load into its own window.
 */

/**
 * Agreement with the recorded label, split by confidence band.
 *
 * This is how you discover whether the thresholds hold for this domain, which is why the split is
 * the metric rather than a single headline number. `atBand` is the pair ADR 0013 scores: agreement
 * among rows reaching the band, and the share of the corpus that reached it.
 * @param {Scored[]} rows
 * @param {number} band
 * @returns {{overall: number | null, atBand: number | null, coverage: number | null,
 *   answered: number, reached: number, size: number}}
 */
export function agreement(rows, band) {
  const size = rows.length;
  if (size === 0) return { overall: null, atBand: null, coverage: null, answered: 0, reached: 0, size: 0 };

  const answered = rows.filter((r) => r.actual !== null);
  const reached = answered.filter((r) => r.confidence >= band);
  const agreed = (/** @type {Scored[]} */ set) => set.filter((r) => r.actual === r.expected).length;

  return {
    overall: answered.length === 0 ? null : agreed(answered) / answered.length,
    atBand: reached.length === 0 ? null : agreed(reached) / reached.length,
    // Coverage is measured against the whole corpus, not against the rows that answered. A row the
    // classifier declined to answer is a row that did not reach the band, and counting only
    // answered rows would let an abstaining classifier report full coverage.
    coverage: reached.length / size,
    answered: answered.length,
    reached: reached.length,
    size,
  };
}

/**
 * The nearest-rank percentile, which needs no interpolation and so cannot invent a latency nobody
 * observed.
 * @param {number[]} values
 * @param {number} p 0..1
 * @returns {number | null}
 */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

/**
 * Latency p50 and p95, measured against the turn it would replace.
 * @param {Scored[]} rows
 * @returns {{p50: number | null, p95: number | null, samples: number}}
 */
export function latency(rows) {
  const ms = rows.map((r) => r.latencyMs);
  return { p50: percentile(ms, 0.5), p95: percentile(ms, 0.95), samples: ms.length };
}

/**
 * Price, summed from the `usage` counts the endpoint returned on every response.
 *
 * **Never estimated.** ADR 0013 requires the exact returned counts, and a row whose response
 * carried no usage block contributes nothing rather than a guessed figure — `counted` says how
 * many rows actually backed the total.
 * @param {Scored[]} rows
 * @returns {{inputTokens: number, outputTokens: number, totalTokens: number, counted: number}}
 */
export function price(rows) {
  let inputTokens = 0;
  let outputTokens = 0;
  let counted = 0;
  for (const r of rows) {
    if (r.inputTokens === 0 && r.outputTokens === 0) continue;
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    counted += 1;
  }
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, counted };
}

/**
 * The price bar is a ratio against what the call displaces, not a dollar figure — ADR 0013 fixes
 * it that way because the endpoint's per-token price is not this repository's to know.
 *
 * Returns null when the displaced pass was never measured, so the bar reports `not-measured`
 * instead of dividing by a number nobody observed.
 * @param {number} judgeTokens
 * @param {number} displacedPassTokens
 * @returns {number | null}
 */
export function priceRatio(judgeTokens, displacedPassTokens) {
  if (displacedPassTokens <= 0) return null;
  return judgeTokens / displacedPassTokens;
}

/**
 * Displaced context — tokens the agent never had to load into its own window because the judgement
 * happened outside it.
 * @param {Scored[]} rows
 * @returns {{total: number, perRow: number | null, rows: number}}
 */
export function displacedContext(rows) {
  const total = rows.reduce((sum, r) => sum + r.displacedTokens, 0);
  return { total, perRow: rows.length === 0 ? null : total / rows.length, rows: rows.length };
}

/**
 * Every metric for one subject, in the order ADR 0013 lists them.
 * @param {Scored[]} rows
 * @param {number} band
 * @param {number} displacedPassTokens
 */
export function allMetrics(rows, band, displacedPassTokens) {
  const spend = price(rows);
  return {
    agreement: agreement(rows, band),
    price: { ...spend, ratioOfDisplacedPass: priceRatio(spend.totalTokens, displacedPassTokens) },
    latency: latency(rows),
    displacedContext: displacedContext(rows),
  };
}
