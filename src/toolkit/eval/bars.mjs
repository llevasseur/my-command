// The abandonment bars, transcribed from docs/adrs/0013-the-eval-bar-is-pre-registered.md.
//
// They live in code as data so the harness emits the verdict itself rather than printing numbers
// for a reader to judge afterwards. ADR 0013 is explicit that this is the whole point: "An eval
// with no pre-registered bar cannot conclude no."
//
// Every bar is a pair — agreement at a confidence band, and the share of the corpus reaching that
// band — because a classifier that abstains on almost everything can post a perfect agreement
// number and be worthless.
//
// Changing a number here after a result is visible is a superseding ADR, never an edit. ADR 0013
// says so in those words.

/** ADR 0013, Subject A: the confidence at which /clean's answers are scored. */
export const SUBJECT_A_BAND = 0.9;

/**
 * ADR 0013, Subject B: a `noul` carries no confidence field, so the band is the value's own
 * distance from the middle. Re-exported from the client rather than restated, so one edit moves
 * both the runtime gate and this bar.
 */
export { NOUL_HIGH_CONFIDENCE_DISTANCE } from '../lib/jev.mjs';

/**
 * One pre-registered threshold.
 * @typedef {object} Bar
 * @property {string} id
 * @property {string} metric
 * @property {string} statement Abandon if this is true, in ADR 0013's own words.
 */

/**
 * A bar measured against a result.
 * @typedef {object} BarOutcome
 * @property {string} id
 * @property {string} metric
 * @property {string} statement
 * @property {'pass' | 'fail' | 'not-measured'} status
 * @property {number | null} observed
 * @property {string} detail
 */

/** @type {Bar[]} */
export const SUBJECT_A_BARS = [
  {
    id: 'A.agreement',
    metric: 'agreement',
    statement:
      'at confidence >= 0.9, agreement fails to beat the majority-class baseline by 10 percentage points, or is below 0.90 absolute',
  },
  {
    id: 'A.coverage',
    metric: 'coverage',
    statement: 'under 20% of the corpus lands at confidence >= 0.9',
  },
  {
    id: 'A.price',
    metric: 'price',
    statement: 'judging one file’s comments costs more than 10% of the generative pass it replaces',
  },
  {
    id: 'A.latency',
    metric: 'latency',
    statement: 'p95 for one batched call covering a file’s comments exceeds 5s',
  },
];

/** @type {Bar[]} */
export const SUBJECT_B_BARS = [
  {
    id: 'B.corpus',
    metric: 'corpus',
    statement: 'outcome-pairing yields fewer than 200 labelled commands',
  },
  {
    id: 'B.agreement',
    metric: 'agreement',
    statement: 'at |noul - 0.5| >= 0.4, agreement is below 0.95',
  },
  {
    id: 'B.coverage',
    metric: 'coverage',
    statement: 'under 25% of the labelled corpus lands at that band',
  },
  {
    id: 'B.latency',
    metric: 'latency',
    statement: 'p95 end-to-end exceeds 200ms',
  },
];

/** ADR 0013's one bar that is a constraint rather than a number. */
export const DEPENDENCY_BAR =
  'If the client cannot be built as a raw fetch against Node 22 global fetch with nothing added to package.json dependencies, the layer is abandoned rather than given a dependency.';

/**
 * A number that was never measured is not a number that passed. Kept as one helper so no bar can
 * quietly read `null` as clearing itself.
 * @param {string} id
 * @param {string} metric
 * @param {string} statement
 * @param {number | null} observed
 * @param {boolean} failed
 * @param {string} detail
 * @returns {BarOutcome}
 */
function outcome(id, metric, statement, observed, failed, detail) {
  if (observed === null) return { id, metric, statement, status: 'not-measured', observed: null, detail };
  return { id, metric, statement, status: failed ? 'fail' : 'pass', observed, detail };
}

/**
 * What the harness measured for one subject. Every field is nullable because a bar with no
 * measurement behind it reports `not-measured` rather than passing.
 * @typedef {object} SubjectMeasurement
 * @property {number} labelledSize
 * @property {number | null} baseline The majority-class share. Subject A only.
 * @property {number | null} agreementAtBand
 * @property {number | null} coverageAtBand
 * @property {number | null} priceRatio
 * @property {number | null} latencyP95Ms
 */

/**
 * Subject A's verdict, in ADR 0013's terms.
 * @param {SubjectMeasurement} m
 * @returns {BarOutcome[]}
 */
export function scoreSubjectA(m) {
  const baseline = m.baseline;
  const agreement = m.agreementAtBand;
  const margin = agreement !== null && baseline !== null ? agreement - baseline : null;
  const agreementFailed =
    agreement !== null && baseline !== null && (margin === null || margin < 0.1 || agreement < 0.9);

  return [
    outcome(
      'A.agreement',
      'agreement',
      SUBJECT_A_BARS[0].statement,
      agreement,
      agreementFailed,
      baseline === null
        ? 'no baseline, so the 10-point margin cannot be tested'
        : `agreement ${fmt(agreement)} vs baseline ${fmt(baseline)} (margin ${fmt(margin)}); needs >= 0.90 absolute and >= 0.10 margin`,
    ),
    outcome(
      'A.coverage',
      'coverage',
      SUBJECT_A_BARS[1].statement,
      m.coverageAtBand,
      m.coverageAtBand !== null && m.coverageAtBand < 0.2,
      `${fmt(m.coverageAtBand)} of the corpus at confidence >= ${SUBJECT_A_BAND}; needs >= 0.20`,
    ),
    outcome(
      'A.price',
      'price',
      SUBJECT_A_BARS[2].statement,
      m.priceRatio,
      m.priceRatio !== null && m.priceRatio > 0.1,
      `${fmt(m.priceRatio)} of the generative pass it replaces; needs <= 0.10`,
    ),
    outcome(
      'A.latency',
      'latency',
      SUBJECT_A_BARS[3].statement,
      m.latencyP95Ms,
      m.latencyP95Ms !== null && m.latencyP95Ms > 5000,
      `p95 ${dur(m.latencyP95Ms)} for one batched call; needs <= 5000ms`,
    ),
  ];
}

/**
 * Subject B's verdict, in ADR 0013's terms.
 *
 * The corpus bar is first and is decidable with no network at all, which is what lets a run with
 * no API key still conclude something real: ADR 0012 says a labelled corpus in the dozens drops
 * this subject to question-set-only.
 * @param {SubjectMeasurement} m
 * @returns {BarOutcome[]}
 */
export function scoreSubjectB(m) {
  return [
    outcome(
      'B.corpus',
      'corpus',
      SUBJECT_B_BARS[0].statement,
      m.labelledSize,
      m.labelledSize < 200,
      `${m.labelledSize} labelled commands; needs >= 200`,
    ),
    outcome(
      'B.agreement',
      'agreement',
      SUBJECT_B_BARS[1].statement,
      m.agreementAtBand,
      m.agreementAtBand !== null && m.agreementAtBand < 0.95,
      `${fmt(m.agreementAtBand)} at the high-confidence band; needs >= 0.95`,
    ),
    outcome(
      'B.coverage',
      'coverage',
      SUBJECT_B_BARS[2].statement,
      m.coverageAtBand,
      m.coverageAtBand !== null && m.coverageAtBand < 0.25,
      `${fmt(m.coverageAtBand)} of the labelled corpus at the band; needs >= 0.25`,
    ),
    outcome(
      'B.latency',
      'latency',
      SUBJECT_B_BARS[3].statement,
      m.latencyP95Ms,
      m.latencyP95Ms !== null && m.latencyP95Ms > 200,
      `p95 ${dur(m.latencyP95Ms)} end-to-end; needs <= 200ms. ADR 0013 expects this one to fail.`,
    ),
  ];
}

/**
 * The subject's overall verdict. `abandon` the moment any bar fails; `pass` only when every bar
 * was measured and cleared; `incomplete` when nothing failed but something went unmeasured.
 *
 * The third value exists so a run with no API key cannot report a pass it did not earn.
 * @param {BarOutcome[]} bars
 * @returns {{verdict: 'pass' | 'abandon' | 'incomplete', failing: string[], unmeasured: string[]}}
 */
export function verdictOf(bars) {
  const failing = bars.filter((b) => b.status === 'fail').map((b) => b.id);
  const unmeasured = bars.filter((b) => b.status === 'not-measured').map((b) => b.id);
  if (failing.length > 0) return { verdict: 'abandon', failing, unmeasured };
  if (unmeasured.length > 0) return { verdict: 'incomplete', failing, unmeasured };
  return { verdict: 'pass', failing, unmeasured };
}

/**
 * @param {number | null} n
 * @returns {string}
 */
function fmt(n) {
  return n === null ? 'not measured' : String(Math.round(n * 1000) / 1000);
}

/**
 * A duration, with the unit inside the formatter so an unmeasured one never reads "not measuredms".
 * @param {number | null} n
 * @returns {string}
 */
function dur(n) {
  return n === null ? 'not measured' : `${Math.round(n)}ms`;
}
