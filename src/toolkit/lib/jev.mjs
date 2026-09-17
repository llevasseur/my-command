// The Jev client — one POST to TypeSafe's System One endpoint, asking a whole map of questions
// at once and answering with whatever came back.
//
// **Nothing here throws.** Every failure — no key, a refused key, a malformed body, exhausted
// retries, a timeout, a spent budget — resolves to a result carrying no answers, because a
// caller that must wrap this in `try` to stay correct is a caller that breaks the moment
// someone forgets to. The policy is `guard()` in `src/hooks/lib/io.mjs`, which swallows every
// exception into a silent allow, transposed from a hook's "no opinion" to this module's "no
// answer": a command that asks Jev a question and gets nothing back behaves exactly as it did
// before Jev existed.
//
// Zero runtime dependencies, deliberately and permanently: a raw `fetch` against Node's global,
// no SDK. `docs/adrs/0013-the-eval-bar-is-pre-registered.md` makes that a condition of the
// layer existing at all rather than a preference — a dependency abandons the layer instead.
//
// The API key is read from the process environment and from nowhere else. It is never written
// into a file in this repository: `package.json`'s `files` list ships `src`, so a key committed
// here is a key published to npm.

/** Where System One answers. */
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

/** The only model this client asks for. */
const MODEL = 'jev-latest';

/**
 * The high-confidence band for a `noul`, fixed by
 * `docs/adrs/0013-the-eval-bar-is-pre-registered.md`: a noul carries no confidence field, so
 * the band is the value's own distance from the middle. At or beyond 0.1 and 0.9.
 */
export const NOUL_HIGH_CONFIDENCE_DISTANCE = 0.4;

/** Give up on a single request after this long. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** How many times a retryable status is retried before the call gives up and answers nothing. */
const DEFAULT_MAX_RETRIES = 3;

/** The first backoff pause; each further attempt doubles it. */
const DEFAULT_BACKOFF_MS = 250;

/** The statuses worth waiting out. Every other failure is answered immediately. */
const RATE_LIMITED = 429;
const OVERLOADED = 529;
const BAD_KEY = 401;
const VALIDATION = 422;

/**
 * Why a call produced no answers. `null` on a call that produced some.
 *
 * `invalid-request` is this client's own reading of a malformed question map — the same refusal
 * a 422 would have made, made before spending a request on it.
 * @typedef {'no-key' | 'invalid-request' | 'bad-key' | 'validation' | 'rate-limited'
 *   | 'overloaded' | 'timeout' | 'transport' | 'malformed' | 'http' | 'spend-cap'} JevReason
 */

/**
 * What the state carries. A string, a record, or an array — the endpoint takes all three and
 * this client reads none of them, so it forwards whichever arrived untouched.
 * @typedef {string | Record<string, unknown> | unknown[]} JevState
 */

/**
 * A yes/no question. Its answer is a probability rather than a verdict, and it carries **no
 * confidence field** — `noulConfidence` derives one from the value itself.
 * @typedef {object} NoulQuestion
 * @property {'noul'} type
 * @property {string} instructions
 * @property {{ true: string, false: string }} [criteria] What each pole means, when the
 *   instructions alone leave it open.
 */

/**
 * A pick-one question. `criteria` is required: it is the option list, so a choice without one
 * has nothing to choose between.
 * @typedef {object} ChoiceQuestion
 * @property {'choice'} type
 * @property {string} [instructions]
 * @property {Record<string, string | null>} criteria Option to its rubric, or `null` for an
 *   option whose name is the whole rubric.
 */

/**
 * A graded question. `criteria` is required and ordered: the levels, low to high, at least two.
 * @typedef {object} ScoreQuestion
 * @property {'score'} type
 * @property {string} [instructions]
 * @property {string[]} criteria
 */

/** @typedef {NoulQuestion | ChoiceQuestion | ScoreQuestion} JevQuestion */

/**
 * @typedef {object} NoulAnswer
 * @property {'noul'} type
 * @property {number} noul 0 to 1.
 */

/**
 * @typedef {object} ChoiceAnswer
 * @property {'choice'} type
 * @property {string} choice
 * @property {Record<string, number>} probabilities
 * @property {number} confidence
 */

/**
 * @typedef {object} ScoreAnswer
 * @property {'score'} type
 * @property {number} score Probability-weighted, so it may land between two levels.
 * @property {string[]} legend
 * @property {Record<string, number>} probabilities
 * @property {number} confidence
 */

/** @typedef {NoulAnswer | ChoiceAnswer | ScoreAnswer} JevAnswer */

/**
 * @typedef {object} JevUsage
 * @property {number} input_tokens
 * @property {number} output_tokens
 */

/**
 * One call's outcome. `answers` is empty on every failure, which is what "fails open" means
 * here: the caller reads the key it asked about, finds nothing, and carries on.
 * @typedef {object} JevResult
 * @property {boolean} ok
 * @property {JevReason | null} reason
 * @property {string} detail Free text for a log or a report; never parsed.
 * @property {Record<string, JevAnswer>} answers Keyed exactly as the questions were.
 * @property {JevUsage} usage
 * @property {number} attempts How many requests were actually sent.
 */

/**
 * A run's token budget, accumulated across every call made with it. Mutable on purpose: one
 * object is threaded through a run so the cap is the run's, not each call's.
 * @typedef {object} JevBudget
 * @property {number} cap Total tokens this run may spend. `Infinity` for no cap.
 * @property {number} spent
 */

/**
 * Whether a decoded JSON value is an object with named fields, as against an array or a scalar.
 * `Object(value) === value` holds for an object and nothing else.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && Object(value) === value && !Array.isArray(value);
}

/**
 * The text a field carried, or undefined when it carried something that was not text.
 * `String(value) === value` holds for a string primitive and nothing else.
 * @param {unknown} value
 * @returns {string | undefined}
 */
function asText(value) {
  return String(value) === value ? /** @type {string} */ (value) : undefined;
}

/**
 * The finite number a field carried, or undefined for anything else — including `NaN` and the
 * infinities, which are numbers a caller cannot act on.
 * @param {unknown} value
 * @returns {number | undefined}
 */
function asNumber(value) {
  return Number.isFinite(value) ? /** @type {number} */ (value) : undefined;
}

/**
 * A map of name to probability, or undefined when the field was not that shape. A single
 * non-numeric entry voids the whole map rather than being dropped quietly — a probability
 * distribution missing one of its members is not a distribution.
 * @param {unknown} value
 * @returns {Record<string, number> | undefined}
 */
function asProbabilities(value) {
  if (!isRecord(value)) return undefined;
  /** @type {Record<string, number>} */
  const probabilities = {};
  for (const [name, weight] of Object.entries(value)) {
    const number = asNumber(weight);
    if (number === undefined) return undefined;
    probabilities[name] = number;
  }
  return probabilities;
}

/**
 * An array of labels, or undefined when the field was not that shape.
 * @param {unknown} value
 * @returns {string[] | undefined}
 */
function asLabels(value) {
  if (!Array.isArray(value)) return undefined;
  /** @type {string[]} */
  const labels = [];
  for (const entry of value) {
    const label = asText(entry);
    if (label === undefined) return undefined;
    labels.push(label);
  }
  return labels;
}

/**
 * The confidence a `noul` implies, on the same 0-to-1 scale the other two answer types report
 * one on. A noul is a probability, so its own distance from the middle is the whole of what it
 * says about its own certainty: 0.5 is a coin toss and reads as 0, while 0 and 1 read as 1.
 *
 * Exported so every caller shares one definition of the band rather than each re-deriving it.
 * A value that is not a usable probability reads as no confidence at all.
 * @param {number} noul
 * @returns {number}
 */
export function noulConfidence(noul) {
  const value = asNumber(noul);
  if (value === undefined) return 0;
  return Math.min(1, Math.abs(value - 0.5) * 2);
}

/**
 * Whether a `noul` sits in the high-confidence band ADR 0013 pre-registered — `|noul − 0.5| ≥
 * 0.4`, which is `noulConfidence(noul) >= 0.8` on the scale above. The eval's coverage number
 * is the share of a corpus for which this is true, so it has exactly one definition.
 * @param {number} noul
 * @returns {boolean}
 */
export function isHighConfidenceNoul(noul) {
  const value = asNumber(noul);
  if (value === undefined) return false;
  return Math.abs(value - 0.5) >= NOUL_HIGH_CONFIDENCE_DISTANCE;
}

/**
 * A run's spend cap, to thread through every call that run makes.
 * @param {number} cap Total tokens, across the whole run. Omit for no cap.
 * @returns {JevBudget}
 */
export function createBudget(cap = Number.POSITIVE_INFINITY) {
  return { cap, spent: 0 };
}

/**
 * Whether the cap has been reached. Reaching it is not an error — it is the run declining to
 * ask anything further, and the caller sees the same nothing it would see from a failure.
 * @param {JevBudget | undefined} budget
 * @returns {boolean}
 */
export function budgetReached(budget) {
  return budget !== undefined && budget.spent >= budget.cap;
}

/**
 * Why a question map cannot be sent, or undefined when it can. This is the 422 the endpoint
 * would have answered, answered here instead so an obviously malformed map costs no request.
 * @param {unknown} questions
 * @returns {string | undefined}
 */
function questionsProblem(questions) {
  if (!isRecord(questions)) return 'questions must be a map of caller-chosen keys to questions';
  const keys = Object.keys(questions);
  if (keys.length === 0) return 'questions must carry at least one question';

  for (const key of keys) {
    const question = questions[key];
    if (!isRecord(question)) return `questions.${key} must be a question object`;
    const type = asText(question.type);

    if (type === 'noul') {
      if (asText(question.instructions) === undefined) return `questions.${key}.instructions must be text`;
      continue;
    }

    if (type === 'choice') {
      if (!isRecord(question.criteria)) return `questions.${key}.criteria is required for a choice`;
      if (Object.keys(question.criteria).length === 0) return `questions.${key}.criteria must carry an option`;
      continue;
    }

    if (type === 'score') {
      if (!Array.isArray(question.criteria)) return `questions.${key}.criteria is required for a score`;
      if (question.criteria.length < 2) return `questions.${key}.criteria must carry at least two levels`;
      continue;
    }

    return `questions.${key}.type must be noul, choice or score`;
  }
  return undefined;
}

/**
 * The request body for a whole question map.
 *
 * One body carries every question, never one body per question: Speculative Fan-Out makes
 * several questions in a single call cost less than several calls, so this client has no loop
 * over questions and callers should not add one.
 *
 * The caller's keys are correlation handles — they come back identical on `answers`, and the
 * key itself is never part of what the model is asked.
 * @param {JevState} state
 * @param {Record<string, JevQuestion>} questions
 * @returns {{ state: JevState, model: string, questions: Record<string, JevQuestion> }}
 */
export function buildRequest(state, questions) {
  return { state, model: MODEL, questions };
}

/**
 * One answer, read into the shape its type promises, or undefined when the endpoint sent
 * something that shape cannot be read from.
 *
 * A `noul` is given **no** confidence field, deliberately — the API does not send one and
 * inventing one here would put a second, quietly different definition of the band beside
 * `noulConfidence`.
 * @param {unknown} value
 * @returns {JevAnswer | undefined}
 */
function readAnswer(value) {
  if (!isRecord(value)) return undefined;
  const type = asText(value.type);

  if (type === 'noul') {
    const noul = asNumber(value.noul);
    return noul === undefined ? undefined : { type: 'noul', noul };
  }

  if (type === 'choice') {
    const choice = asText(value.choice);
    const probabilities = asProbabilities(value.probabilities);
    const confidence = asNumber(value.confidence);
    if (choice === undefined || probabilities === undefined || confidence === undefined) return undefined;
    return { type: 'choice', choice, probabilities, confidence };
  }

  if (type === 'score') {
    const score = asNumber(value.score);
    const legend = asLabels(value.legend);
    const probabilities = asProbabilities(value.probabilities);
    const confidence = asNumber(value.confidence);
    if (score === undefined || legend === undefined || probabilities === undefined || confidence === undefined) {
      return undefined;
    }
    return { type: 'score', score, legend, probabilities, confidence };
  }

  return undefined;
}

/**
 * The usage the response reported, defaulting each half to 0 so a budget can always be charged.
 * @param {unknown} value
 * @returns {JevUsage}
 */
function readUsage(value) {
  if (!isRecord(value)) return { input_tokens: 0, output_tokens: 0 };
  return {
    input_tokens: asNumber(value.input_tokens) ?? 0,
    output_tokens: asNumber(value.output_tokens) ?? 0,
  };
}

/**
 * A result carrying no answers.
 * @param {JevReason} reason
 * @param {string} detail
 * @param {number} attempts
 * @returns {JevResult}
 */
function noAnswer(reason, detail, attempts = 0) {
  return { ok: false, reason, detail, answers: {}, usage: { input_tokens: 0, output_tokens: 0 }, attempts };
}

/**
 * The field a 422 named, as a sentence. The endpoint's wording is not contractual, so every
 * shape it has been seen to use is tried and the raw body is the floor.
 * @param {string} body
 * @returns {string}
 */
function validationDetail(body) {
  /** @type {unknown} */
  let decoded;
  try {
    decoded = JSON.parse(body);
  } catch {
    return body.slice(0, 200);
  }
  if (!isRecord(decoded)) return body.slice(0, 200);

  const error = isRecord(decoded.error) ? decoded.error : decoded;
  const field = asText(error.field) ?? asText(error.param) ?? asText(error.loc);
  const message = asText(error.message) ?? asText(decoded.message) ?? 'validation failed';
  return field === undefined ? message : `${field}: ${message}`;
}

/**
 * Whether a thrown value is a request that ran out of time, as against one that never
 * connected. `fetch` aborts with `AbortError`, and `AbortSignal.timeout` with `TimeoutError`.
 * @param {unknown} cause
 * @returns {boolean}
 */
function isTimeout(cause) {
  if (!(cause instanceof Error)) return false;
  return cause.name === 'AbortError' || cause.name === 'TimeoutError';
}

/**
 * The message a thrown value carries, for the `detail` line.
 * @param {unknown} cause
 * @returns {string}
 */
function messageOf(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Wait, by wall clock. Replaced in tests so backoff is asserted rather than slept through.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Ask Jev a whole map of questions, and answer with whatever came back.
 *
 * **Never throws and never rejects.** Every path below returns a `JevResult`; a failure is one
 * whose `answers` is empty. That is the contract every caller is written against, so a caller
 * needs no `try` to stay correct.
 *
 * @param {object} request
 * @param {JevState} request.state What the questions are about.
 * @param {Record<string, JevQuestion>} request.questions Keys are the caller's own and come
 *   back identical on `answers`.
 * @param {string | undefined} [request.key] The API key. Defaults to `TYPESAFE_API_KEY` from
 *   the process environment, which is the only place it is ever read from.
 * @param {JevBudget} [request.budget] The run's spend cap, charged from the returned usage.
 * @param {string} [request.endpoint]
 * @param {number} [request.timeoutMs]
 * @param {number} [request.maxRetries] Retries for 429 and 529 only.
 * @param {number} [request.backoffMs] The first pause; each further attempt doubles it.
 * @param {typeof globalThis.fetch} [request.fetchImpl] Injected in tests. No test here makes a
 *   real network call, and injection rather than module mocking is what the repo's lint allows.
 * @param {(ms: number) => Promise<void>} [request.sleep] Injected in tests, to assert the
 *   backoff rather than wait it out.
 * @returns {Promise<JevResult>}
 */
export async function ask({
  state,
  questions,
  key = process.env.TYPESAFE_API_KEY,
  budget,
  endpoint = ENDPOINT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  backoffMs = DEFAULT_BACKOFF_MS,
  fetchImpl = globalThis.fetch,
  sleep = wait,
}) {
  let attempts = 0;
  try {
    // The cap is checked before anything else: a run that has spent its budget asks nothing
    // further, and the caller sees the same nothing a refused call would have given it.
    if (budgetReached(budget)) {
      return noAnswer('spend-cap', `spend cap reached at ${budget?.spent} of ${budget?.cap} tokens`);
    }

    // No key means the layer was never switched on. That is the ordinary case, not a fault:
    // a user who never opted in gets no error and no mention.
    if (key === undefined || key === '') {
      return noAnswer('no-key', 'TYPESAFE_API_KEY is not set in the environment');
    }

    const problem = questionsProblem(questions);
    if (problem !== undefined) return noAnswer('invalid-request', problem);

    const body = JSON.stringify(buildRequest(state, questions));

    for (;;) {
      /** @type {Response} */
      let response;
      attempts += 1;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        return noAnswer(isTimeout(cause) ? 'timeout' : 'transport', messageOf(cause), attempts);
      }

      const status = response.status;

      // 429 and 529 are the only statuses a retry can help: the first says "later" and the
      // second says "busy". Everything else below is answered on the first attempt, because
      // sending the same refused request again cannot change the answer.
      if (status === RATE_LIMITED || status === OVERLOADED) {
        const reason = status === RATE_LIMITED ? 'rate-limited' : 'overloaded';
        if (attempts > maxRetries) {
          return noAnswer(reason, `${status} after ${attempts} attempts`, attempts);
        }
        await sleep(backoffMs * 2 ** (attempts - 1));
        continue;
      }

      if (status === BAD_KEY) {
        return noAnswer('bad-key', '401: the API key was refused', attempts);
      }

      if (status === VALIDATION) {
        const text = await response.text().catch(() => '');
        return noAnswer('validation', `422: ${validationDetail(text)}`, attempts);
      }

      if (!response.ok) {
        return noAnswer('http', `${status}: the endpoint refused the request`, attempts);
      }

      /** @type {unknown} */
      let decoded;
      try {
        decoded = await response.json();
      } catch (cause) {
        return noAnswer('malformed', `the response was not JSON: ${messageOf(cause)}`, attempts);
      }
      if (!isRecord(decoded) || !isRecord(decoded.answers)) {
        return noAnswer('malformed', 'the response carried no answers map', attempts);
      }

      const usage = readUsage(decoded.usage);
      // Charged even on a response whose answers are unreadable: the tokens were spent
      // whatever came back, and a budget that only counts successes is not a spend cap.
      if (budget !== undefined) budget.spent += usage.input_tokens + usage.output_tokens;

      /** @type {Record<string, JevAnswer>} */
      const answers = {};
      for (const [answerKey, value] of Object.entries(decoded.answers)) {
        const answer = readAnswer(value);
        // An unreadable answer is absent rather than fatal — the readable ones beside it in
        // the same fan-out are still worth having.
        if (answer !== undefined) answers[answerKey] = answer;
      }

      return { ok: true, reason: null, detail: '', answers, usage, attempts };
    }
  } catch (cause) {
    // The floor. Anything the paths above failed to anticipate still leaves the caller with no
    // answer rather than an exception it never agreed to handle.
    return noAnswer('malformed', messageOf(cause), attempts);
  }
}
