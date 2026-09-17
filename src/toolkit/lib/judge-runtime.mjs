// The judgement layer's runtime surface: two gates, a spend cap, a shadow store, and
// deliberately no decision path.
//
// **Nothing here acts on an answer, and nothing here can be made to.**
// `docs/adrs/0008-no-question-set-acts-in-this-campaign.md` settles that every set ships in
// shadow, so what this module offers a caller is a *recording* path: `consult()` returns a
// report of what was asked and what came back, and there is no field on it that names a
// verdict, a choice, or an edit to apply. A caller reads `report.acted`, which is the literal
// `false` on every path below, and carries on doing exactly what it did before.
//
// **Shadow mode is not the safety mechanism.** Nothing acting is. ADR 0008 and
// `docs/adrs/0010-eval-harness-before-the-layer.md` both say so outright, and both say why it
// matters: a mechanism credited with safety it does not provide is the kind of thing a later
// change removes as redundant. Shadow is the last gate before promotion — a way of collecting
// what the layer *would* have said — and it is described that way here and nowhere else.
//
// **Two gates, because capability and opt-in are different questions.**
// `docs/adrs/0009-conversation-derived-state-leaves-the-device.md` fixes the shape: a key
// present means the layer *can* run, and an explicit per-invocation opt-in means it *does*.
// The default is off even with a key present. That mirrors the `MY_COMMAND_HOOKS=0` disarm
// precedent in `docs/specs/workflow-gates.md` with the polarity reversed, and the reversal is
// the whole point — a gate that refuses a call is safe by default, and a call that leaves the
// device is not.
//
// **With no key, a caller says nothing at all.** Not an error, not a warning, not a mention.
// `gate()` reports that case as `silent`, so a user who never opted in never learns the layer
// exists. That is ADR 0009's promise and it is a field rather than a convention because a
// convention is what a future caller forgets.
//
// **Every failure mode fails open**, without exception. A missing key, a refused key, a
// rejected body, a rate limit, an overload, a timeout, an unreadable response, an answer below
// the confidence floor, and a reached spend cap all mean one thing: the caller behaves exactly
// as it did before this module existed. `FAILURE_MODES` below names all nine, and
// `judge-runtime.test.mjs` runs a caller through each of them against the same caller with no
// layer at all, asserting the two produce byte-identical output.
//
// The API key is read from the process environment and from nowhere else, and no record this
// module writes carries it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ask, createBudget, noulConfidence } from './jev.mjs';
import { segment } from './shots.mjs';

/** Where the key lives. The environment, and nowhere else. */
export const KEY_VAR = 'TYPESAFE_API_KEY';

/** The per-invocation opt-in. Absent or unset means off, whatever the key says. */
export const OPT_IN_VAR = 'MY_COMMAND_JUDGE';

/** Redirects the shadow keep, exactly as `MY_COMMAND_SHOTS_DIR` redirects the screenshots one. */
export const KEEP_VAR = 'MY_COMMAND_JUDGE_DIR';

/** Caps what one run may spend, in tokens across every call it makes. */
export const CAP_VAR = 'MY_COMMAND_JUDGE_TOKEN_CAP';

/**
 * What counts as switching the layer on.
 *
 * The mirror image of `hooks-status.mjs`'s `/^(0|off|false|no)$/i` disarm test, and spelled as
 * its own constant for the reason the polarity is reversed: a value this pattern does not
 * match leaves the layer off, so a typo costs a run that did not happen rather than an egress
 * nobody asked for.
 */
const OPT_IN_VALUE = /^(1|on|true|yes)$/i;

/**
 * The global abstention floor. Below this an answer says nothing a caller could use, so it is
 * treated as no answer at all.
 */
export const ABSTENTION_FLOOR = 0.5;

/**
 * The floor before anything destructive. Higher than the global one deliberately: the plan
 * starts conservative and loosens only as the eval corpus justifies it, never the other way.
 */
export const DESTRUCTIVE_FLOOR = 0.9;

/**
 * Every way this layer declines to answer. Nine, and each one means "behave exactly as
 * today" — there is no tenth that means anything else.
 *
 * Eight come from the client's own taxonomy; `below-threshold` is this module's, because an
 * answer that arrived and said nothing useful is a failure of the same kind as one that never
 * arrived, and a caller that handled the first eight and not the ninth would still change its
 * behaviour on a coin toss.
 * @type {readonly string[]}
 */
export const FAILURE_MODES = Object.freeze([
  'no-key',
  'bad-key',
  'validation',
  'rate-limited',
  'overloaded',
  'timeout',
  'malformed',
  'below-threshold',
  'spend-cap',
]);

/**
 * The text a value carried, or undefined for anything that was not text. `String(value) ===
 * value` holds for a string primitive and nothing else.
 * @param {unknown} value
 * @returns {string | undefined}
 */
function asText(value) {
  return String(value) === value ? /** @type {string} */ (value) : undefined;
}

/**
 * @typedef {object} Gate
 * @property {boolean} capable   A key is present, so the layer *can* run.
 * @property {boolean} optedIn   This invocation asked for it.
 * @property {boolean} enabled   Both of the above. Nothing runs without it.
 * @property {boolean} silent    Say nothing at all — no key means no mention.
 * @property {string | null} reason  Why it is off, or null when it is on.
 */

/**
 * Read both gates.
 *
 * The key is checked first and its absence wins outright, which is what makes the no-key case
 * indistinguishable from a device where this layer was never written: `silent` is true, so a
 * caller reports nothing, and `reason` is the same `no-key` the client itself would have
 * given. A key present with no opt-in is the ordinary default-off case — that one a directly
 * invoked verb may say out loud, because someone typed the invocation and is reading its
 * output.
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {boolean} [options.optIn] A flag on this invocation — `--judge`, or a caller's own.
 * @returns {Gate}
 */
export function gate({ env = process.env, optIn = false } = {}) {
  const key = asText(env[KEY_VAR]) ?? '';
  const capable = key !== '';
  const declared = asText(env[OPT_IN_VAR]) ?? '';
  const optedIn = optIn || OPT_IN_VALUE.test(declared.trim());

  if (!capable) return { capable: false, optedIn, enabled: false, silent: true, reason: 'no-key' };
  if (!optedIn) return { capable: true, optedIn: false, enabled: false, silent: false, reason: 'not-opted-in' };
  return { capable: true, optedIn: true, enabled: true, silent: false, reason: null };
}

/**
 * The confidence an answer carries, on one 0-to-1 scale whatever its type.
 *
 * A `noul` has no confidence field, so its band comes from the client's own exported
 * `noulConfidence` rather than from a second definition written here — which is the whole
 * reason that function is exported. A choice and a score report one directly.
 * @param {import('./jev.mjs').JevAnswer} answer
 * @returns {number}
 */
export function confidenceOf(answer) {
  if (answer.type === 'noul') return noulConfidence(answer.noul);
  return Number.isFinite(answer.confidence) ? answer.confidence : 0;
}

/**
 * Whether an answer clears a floor. An answer that does not is not a weaker answer; it is no
 * answer, and the caller does what it would have done with none.
 * @param {import('./jev.mjs').JevAnswer} answer
 * @param {number} [floor]
 * @returns {boolean}
 */
export function meetsFloor(answer, floor = ABSTENTION_FLOOR) {
  return confidenceOf(answer) >= floor;
}

/** What one run may spend when nothing says otherwise. */
export const DEFAULT_TOKEN_CAP = 200_000;

/**
 * The run's token budget, read from the environment.
 *
 * A cap is on by default and conservative by default. An uncapped run is available by asking
 * for it — `MY_COMMAND_JUDGE_TOKEN_CAP=0` — rather than by forgetting to set one.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {import('./jev.mjs').JevBudget}
 */
export function budgetFrom(env = process.env) {
  // Absent is not zero. `Number('')` is 0, and 0 is the spelling that means "no cap" — so an
  // unset variable read through one conversion would uncap every run that never asked to be.
  const raw = (asText(env[CAP_VAR]) ?? '').trim();
  if (raw === '') return createBudget(DEFAULT_TOKEN_CAP);
  const declared = Number(raw);
  if (!Number.isFinite(declared) || declared < 0) return createBudget(DEFAULT_TOKEN_CAP);
  return createBudget(declared === 0 ? Number.POSITIVE_INFINITY : declared);
}

/**
 * The device-wide shadow keep, expanded from the home directory at runtime.
 *
 * `MY_COMMAND_JUDGE_DIR` overrides it, which is how the tests exercise the store for real
 * without writing into a developer's home directory — the same arrangement `shots.mjs` uses
 * for screenshots, and named to match so the two read as one convention.
 *
 * It sits **outside any checkout**, beside the `shots/` keep. ADR 0009 requires that: a record
 * of what was sent to a third party is data, not source, and one that lived in a working tree
 * could be committed to a repository by accident.
 * @returns {string}
 */
export function keepRoot() {
  return process.env[KEEP_VAR] || join(homedir(), '.my-command', 'judge');
}

/**
 * Where one set's records land. One directory per set, so a set's shadow history reads as a
 * run of files rather than as a sifting problem.
 * @param {string} set
 * @returns {string}
 */
export function keepDirFor(set) {
  return join(keepRoot(), segment(set));
}

/**
 * @typedef {object} ShadowRecord
 * @property {string} set
 * @property {string | null} version
 * @property {boolean} acted            Always false. Written into every record deliberately.
 * @property {unknown} existing         What the path already in place decided.
 * @property {unknown} judge            What the layer said, or why it said nothing.
 * @property {string} recordedAt
 */

/**
 * Write one shadow record, and answer with where it went.
 *
 * The name carries the instant, so records sort by when they were taken, and a collision
 * bumps a counter rather than overwriting — `wx` fails outright on a file that is already
 * there, so the check and the claim are one syscall and two runs racing for one name cannot
 * both believe they took it. `shots.mjs` claims a run directory the same way and for the same
 * reason.
 * @param {ShadowRecord} record
 * @param {number} [now]
 * @returns {{file: string, dir: string}}
 */
export function recordShadow(record, now = Date.now()) {
  const dir = keepDirFor(record.set);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  const body = `${JSON.stringify(record, null, 2)}\n`;
  for (let n = 0; ; n += 1) {
    const file = join(dir, n === 0 ? `${stamp}.json` : `${stamp}-${n}.json`);
    try {
      writeFileSync(file, body, { flag: 'wx' });
      return { file, dir };
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error;
    }
  }
}

/**
 * @typedef {object} ConsultReport
 * @property {false} acted         Fixed. Nothing in this campaign acts on a Jev answer.
 * @property {Gate} gate
 * @property {boolean} asked       Whether a request was actually sent.
 * @property {string | null} reason  Which of `FAILURE_MODES` applied, or null for an answer.
 * @property {string} detail       Free text for a log or a report; never parsed.
 * @property {number} attempts     How many requests were actually sent.
 * @property {boolean} silent      Whether the caller should say nothing at all.
 * @property {Record<string, import('./jev.mjs').JevAnswer>} answers  Above the floor. For
 *   recording; acting on one is what ADR 0008 forbids.
 * @property {Record<string, import('./jev.mjs').JevAnswer>} belowFloor  Arrived, said nothing.
 * @property {import('./jev.mjs').JevUsage} usage
 * @property {string | null} recordedAt  Where the shadow record went, when one was written.
 */

/** A report carrying no answers. @param {Gate} gate @param {string | null} reason */
function noConsult(gate, reason) {
  return {
    acted: /** @type {false} */ (false),
    gate,
    asked: false,
    reason,
    detail: '',
    attempts: 0,
    silent: gate.silent,
    answers: {},
    belowFloor: {},
    usage: { input_tokens: 0, output_tokens: 0 },
    recordedAt: /** @type {string | null} */ (null),
  };
}

/**
 * Ask the layer, record what it said, and act on none of it.
 *
 * **Never throws and never rejects.** Every path returns a `ConsultReport` whose `acted` is
 * `false`, and a caller that ignores the whole return value is behaving correctly rather than
 * sloppily — which is the property the nine failure-mode tests assert directly.
 *
 * @param {object} options
 * @param {import('./jev.mjs').JevState} options.state
 * @param {Record<string, import('./jev.mjs').JevQuestion>} options.questions
 * @param {string} options.set          Names the keep directory a shadow record lands in.
 * @param {string | null} [options.version]
 * @param {unknown} [options.existing]  What the path already in place decided, for the record.
 * @param {boolean} [options.shadow]    Write a record. Off by default, like everything here.
 * @param {number} [options.floor]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {boolean} [options.optIn]
 * @param {import('./jev.mjs').JevBudget} [options.budget]
 * @param {typeof globalThis.fetch} [options.fetchImpl]
 * @param {number} [options.maxRetries] Passed through to the client; injected in tests.
 * @param {(ms: number) => Promise<void>} [options.sleep] Injected in tests, to assert the
 *   backoff rather than wait it out.
 * @param {number} [options.now]
 * @returns {Promise<ConsultReport>}
 */
export async function consult({
  state,
  questions,
  set,
  version = null,
  existing = null,
  shadow = false,
  floor = ABSTENTION_FLOOR,
  env = process.env,
  optIn = false,
  budget,
  fetchImpl,
  maxRetries,
  sleep,
  now = Date.now(),
}) {
  const open = gate({ env, optIn });
  // Both gates are read before anything is composed, so a run that is off costs no work and
  // — the half that matters — sends nothing.
  if (!open.enabled) return noConsult(open, open.reason);

  // `maxRetries` and `sleep` go over as they arrived, undefined included: the client declares
  // both as defaulted parameters, so an absent one resolves to its own default there rather
  // than needing to be omitted here.
  const result = await ask({
    state,
    questions,
    key: env[KEY_VAR],
    budget: budget ?? budgetFrom(env),
    fetchImpl,
    maxRetries,
    sleep,
  });

  /** @type {Record<string, import('./jev.mjs').JevAnswer>} */
  const answers = {};
  /** @type {Record<string, import('./jev.mjs').JevAnswer>} */
  const belowFloor = {};
  for (const [key, answer] of Object.entries(result.answers)) {
    if (meetsFloor(answer, floor)) answers[key] = answer;
    else belowFloor[key] = answer;
  }

  // An answer that arrived and cleared nothing is the ninth failure mode, reported as its own
  // reason rather than as an empty success — a caller reading `reason` gets the same shape it
  // gets from the eight the client reports.
  const answered = Object.keys(answers).length > 0;
  const reason = result.ok ? (answered ? null : 'below-threshold') : result.reason;

  /** @type {string | null} */
  let recordedAt = null;
  if (shadow) {
    // Recorded whatever happened, including a failure: what the layer could not answer is as
    // much a part of the evidence as what it could.
    const written = recordShadow(
      {
        set,
        version,
        acted: false,
        existing,
        judge: {
          ok: result.ok,
          reason,
          detail: result.detail,
          attempts: result.attempts,
          answers,
          belowFloor,
          usage: result.usage,
          floor,
        },
        recordedAt: new Date(now).toISOString(),
      },
      now,
    );
    recordedAt = written.file;
  }

  return {
    acted: false,
    gate: open,
    asked: true,
    reason,
    detail: result.detail,
    attempts: result.attempts,
    silent: false,
    answers,
    belowFloor,
    usage: result.usage,
    recordedAt,
  };
}
