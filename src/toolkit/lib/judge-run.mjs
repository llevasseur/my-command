// What `/task --jev` opens: one run's question sites, one recorder session, one spend cap,
// and a report of what was asked. **No site is wired in this unit and no site acts.**
//
// **Why a record-only surface is worth building at zero promotion.**
// `docs/adrs/0014-the-eval-returned-no.md` abandoned Subject B at 3 labelled commands against
// a floor of 200, and the cause was not the classifier: the proxy transcript store records
// tool *calls* and assistant prose, and no results, no exit codes and no error text. It holds
// calls without outcomes, so the pairing rule
// `docs/adrs/0012-two-eval-subjects-not-five.md` depends on has nothing on disk to pair with.
// `/task` is the other kind of thing. It watches a branch from criteria to a merged PR, so it
// sees the ground truth — the gate that failed, the review finding, the conflict — minutes
// later and on the same branch as the question. Asking here and writing the answer down beside
// what the run actually did is what manufactures the outcome-labelled corpus whose absence
// killed Subject B. That is the whole return, and it is collected without anything acting.
//
// **Nothing here acts, and the flag is not what holds that.**
// `docs/adrs/0008-no-question-set-acts-in-this-campaign.md` still stands unchanged. What holds
// it is `acts` on each site below: promotion is **per question set**, so one set could be let
// through later while `--jev` as a whole stays record-only, and the flag would not have to
// change for that to happen — nor would it grant it. `SITES` ships empty, so there is nothing
// to promote yet, and `actingSites()` is the one door. No shipped site opens it, and
// `judge-run.test.mjs` asserts that rather than trusting it.
//
// **Recording is not separately optional.** `--jev` implies `--record`: a run whose answers
// were not written down produces no corpus, which is the only reason to ask at all. So
// `judgeRun()` refuses to send anything without a recorder endpoint, and reports that refusal
// as `not-recorded` — this module's own gate reason, deliberately *not* a tenth entry in
// `judge-runtime.mjs`'s `FAILURE_MODES`. Those nine are ways a call declined to answer; this
// is a run declining to make the call.
//
// **The two gates are unchanged**, and this module adds no third.
// `docs/adrs/0009-conversation-derived-state-leaves-the-device.md` fixes them: a
// `TYPESAFE_API_KEY` in the environment means the layer *can* run, and the explicit `--jev` on
// the invocation means it *does*. Neither alone sends anything, and with no key a run behaves
// byte-identically to one on a device where this file was never written — that is `gate()`'s
// existing `silent` contract, reused rather than restated.

import { buildRequest, createBudget, ENDPOINT } from './jev.mjs';
import { consult, gate } from './judge-runtime.mjs';

/**
 * One place in a `/task` run where a question set may be asked.
 *
 * @typedef {object} JudgeSite
 * @property {string} id        Where in the run this sits, for the report. Never sent.
 * @property {string} set       Names the keep directory a shadow record lands in.
 * @property {string | null} version
 * @property {boolean} acts     **Always false on a shipped site.** The per-set promotion door.
 * @property {Record<string, import('./jev.mjs').JevQuestion>} questions
 */

/**
 * The sites `/task --jev` asks at. **Empty, deliberately.**
 *
 * This unit ships the flag, the session, the budget and the report-writing path; the sites
 * themselves land in follow-up units. An empty list is a working run that asks nothing, which
 * is a better starting state than a site nobody has read yet — and it makes the no-key path
 * and the wired path the same path, since both send nothing.
 * @type {readonly JudgeSite[]}
 */
export const SITES = Object.freeze([]);

/**
 * Caps one `/task` run's spend, separately from the process-wide default.
 *
 * `MY_COMMAND_JUDGE_TOKEN_CAP` bounds a *process*, and one process can carry many runs; this
 * bounds a *run*, which is the unit a person authorises. A run that has spent its own cap stops
 * asking while the process-wide budget is still nowhere near its own.
 */
export const RUN_CAP_VAR = 'MY_COMMAND_TASK_JUDGE_TOKEN_CAP';

/**
 * What one run may spend when nothing says otherwise. An order below
 * `judge-runtime.mjs`'s `DEFAULT_TOKEN_CAP`, because a run asks a handful of questions at a
 * handful of sites and a cap that no realistic run reaches is not a cap.
 */
export const DEFAULT_RUN_TOKEN_CAP = 25_000;

/** The exact command `/task --jev` runs to open a recorder. Stated once, read by prose and code. */
export const START_COMMAND = 'my-command-tools jev-record start';

/** And to close it. `--session <name>` names the one this run opened. */
export const STOP_COMMAND = 'my-command-tools jev-record stop';

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
 * This run's token budget, built through the client's own `createBudget` so there is one
 * definition of what a budget is.
 *
 * Absent is not zero, for the reason `budgetFrom` gives: `Number('')` is 0 and 0 is the
 * spelling that means "no cap", so an unset variable read through one conversion would uncap
 * every run that never asked to be.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {import('./jev.mjs').JevBudget}
 */
export function runBudget(env = process.env) {
  const raw = (asText(env[RUN_CAP_VAR]) ?? '').trim();
  if (raw === '') return createBudget(DEFAULT_RUN_TOKEN_CAP);
  const declared = Number(raw);
  if (!Number.isFinite(declared) || declared < 0) return createBudget(DEFAULT_RUN_TOKEN_CAP);
  return createBudget(declared === 0 ? Number.POSITIVE_INFINITY : declared);
}

/**
 * The sites allowed to act, which is the whole of the promotion mechanism.
 *
 * ADR 0008 holds that none is, and every shipped site carries `acts: false`. This reads the
 * flag rather than hard-coding the answer so that promoting one set later is a change to that
 * set and to the ADR that permits it — not a change to `--jev`, which stays record-only either
 * way.
 * @param {readonly JudgeSite[]} [sites]
 * @returns {JudgeSite[]}
 */
export function actingSites(sites = SITES) {
  return sites.filter((site) => site.acts === true);
}

/**
 * Whether an endpoint records. Anything that is not the live endpoint is a local proxy this
 * run was pointed at, which is what `--record` means here.
 *
 * Compared against the client's own exported `ENDPOINT` rather than against a second copy of
 * that URL, so the two cannot drift apart into a check that passes while recording nothing.
 * @param {string | undefined} endpoint
 * @returns {boolean}
 */
export function records(endpoint) {
  const url = (asText(endpoint) ?? '').trim();
  return url !== '' && url !== ENDPOINT;
}

/**
 * @typedef {object} SiteReport
 * @property {string} id
 * @property {string} set
 * @property {boolean} acts     What the site declared. False on everything shipped.
 * @property {boolean} asked
 * @property {string | null} reason
 * @property {Record<string, import('./jev.mjs').JevAnswer>} answers
 * @property {import('./jev.mjs').JevUsage} usage
 * @property {string | null} recordedAt
 */

/**
 * @typedef {object} RunReport
 * @property {boolean} acted      Computed from the sites, and false while none declares `acts`.
 * @property {import('./judge-runtime.mjs').Gate} gate
 * @property {boolean} asked      Whether any request was actually sent.
 * @property {boolean} recorded   Whether the calls went through a recorder.
 * @property {string | null} endpoint
 * @property {string | null} reason  Why the run asked nothing, or null when it asked.
 * @property {boolean} silent     No key: say nothing at all, exactly as today.
 * @property {SiteReport[]} sites
 * @property {import('./jev.mjs').JevBudget} budget
 */

/**
 * A run that asked nothing.
 * @param {import('./judge-runtime.mjs').Gate} open
 * @param {string | null} reason
 * @param {import('./jev.mjs').JevBudget} budget
 * @param {string | null} endpoint
 * @returns {RunReport}
 */
function noRun(open, reason, budget, endpoint) {
  return {
    acted: false,
    gate: open,
    asked: false,
    recorded: records(endpoint ?? undefined),
    endpoint: endpoint ?? null,
    reason,
    silent: open.silent,
    sites: [],
    budget,
  };
}

/**
 * Ask every site, record what came back, and act on none of it.
 *
 * **Never throws and never rejects**, because `consult` does not and nothing here adds a path
 * that could. A caller that ignores the whole return value behaves exactly as it did before
 * this module existed, which is the property `judge-runtime.test.mjs` asserts byte for byte
 * against a caller with no layer at all.
 *
 * @param {object} options
 * @param {import('./jev.mjs').JevState} options.state  What the questions are about.
 * @param {readonly JudgeSite[]} [options.sites]
 * @param {string} [options.endpoint]  The recorder's URL. Without one, nothing is sent.
 * @param {unknown} [options.existing] What the run actually did, written beside the answers.
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {boolean} [options.optIn]    The `--jev` flag on this invocation.
 * @param {import('./jev.mjs').JevBudget} [options.budget]
 * @param {typeof globalThis.fetch} [options.fetchImpl]
 * @param {number} [options.maxRetries]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {number} [options.now]
 * @returns {Promise<RunReport>}
 */
export async function judgeRun({
  state,
  sites = SITES,
  endpoint,
  existing = null,
  env = process.env,
  optIn = false,
  budget,
  fetchImpl,
  maxRetries,
  sleep,
  now = Date.now(),
}) {
  const open = gate({ env, optIn });
  const spend = budget ?? runBudget(env);

  // Both gates first, so a run that is off costs no work and sends nothing. With no key this
  // returns `silent`, and a caller that reports nothing on a silent run is a caller whose
  // output is identical to today's.
  if (!open.enabled) return noRun(open, open.reason, spend, endpoint ?? null);

  // Then the recording requirement. Asking without writing the answers down produces no
  // corpus, so it is refused rather than allowed as a lesser mode.
  if (!records(endpoint)) return noRun(open, 'not-recorded', spend, endpoint ?? null);

  /** @type {SiteReport[]} */
  const reports = [];
  for (const site of sites) {
    const report = await consult({
      state,
      questions: site.questions,
      set: site.set,
      version: site.version,
      existing,
      shadow: true,
      endpoint,
      env,
      optIn: true,
      budget: spend,
      fetchImpl,
      maxRetries,
      sleep,
      now,
    });
    reports.push({
      id: site.id,
      set: site.set,
      acts: site.acts === true,
      asked: report.asked,
      reason: report.reason,
      answers: report.answers,
      usage: report.usage,
      recordedAt: report.recordedAt,
    });
  }

  return {
    // Computed rather than fixed, because promotion is per set: a site that one day declares
    // `acts` would show here without `--jev` changing. None does, so this is false.
    acted: actingSites(sites).length > 0,
    gate: open,
    asked: reports.some((report) => report.asked),
    recorded: true,
    endpoint: endpoint ?? null,
    reason: sites.length === 0 ? 'no-sites' : null,
    silent: false,
    sites: reports,
    budget: spend,
  };
}

/**
 * What `--dry-run` prints: the exact body each site would post, and where it would go.
 *
 * **Ungated**, exactly as the verb's own `--dry-run` is. ADR 0009 makes the dry run the
 * mechanism by which a human reads what leaves the device before it leaves, and requiring the
 * opt-in in order to read what the opt-in would send would invert that promise.
 *
 * Composed through the client's own `buildRequest` — the same function the live path calls —
 * so there is no second code path that could drift into printing one thing and sending
 * another.
 * @param {object} options
 * @param {import('./jev.mjs').JevState} options.state
 * @param {readonly JudgeSite[]} [options.sites]
 * @param {string} [options.endpoint]
 * @returns {{endpoint: string, recorded: boolean, upstream: string, sites: {id: string, set: string, acts: boolean, body: ReturnType<typeof buildRequest>}[]}}
 */
export function dryRun({ state, sites = SITES, endpoint }) {
  const destination = (asText(endpoint) ?? '').trim() || ENDPOINT;
  return {
    endpoint: destination,
    recorded: records(destination),
    // Named as well as the destination: with a recorder in front, the host a body reaches is
    // localhost and the host it ends up at is not, and printing only the first would understate
    // the egress this output exists to disclose.
    upstream: ENDPOINT,
    sites: sites.map((site) => ({
      id: site.id,
      set: site.set,
      acts: site.acts === true,
      body: buildRequest(state, site.questions),
    })),
  };
}

/**
 * The run report's `--jev` section: what was asked, what came back, and that nothing acted.
 *
 * Plain lines rather than a rendered block, so the caller writing the report decides the
 * surrounding shape. **A silent run produces none**, which is what keeps a no-key run's report
 * byte-identical to today's.
 * @param {RunReport} run
 * @returns {string[]}
 */
export function reportLines(run) {
  if (run.silent) return [];

  if (!run.asked) {
    const why =
      run.reason === 'not-opted-in'
        ? 'not asked for on this run'
        : run.reason === 'not-recorded'
          ? `no recorder session, so nothing was sent — open one with \`${START_COMMAND}\``
          : run.reason === 'no-sites'
            ? 'no question sites are wired yet, so nothing was asked'
            : `nothing was asked (${run.reason ?? 'unknown'})`;
    return [`jev: ${why}. Nothing acted.`];
  }

  const lines = [`jev: recorded at ${run.endpoint}, ${run.sites.length} site(s). Nothing acted.`];
  for (const site of run.sites) {
    const answered = Object.entries(site.answers);
    const said =
      site.reason !== null
        ? `no answer (${site.reason})`
        : answered.map(([key, answer]) => `${key}=${describe(answer)}`).join(', ') || 'no answer';
    lines.push(`  ${site.id} [${site.set}] ${said}`);
  }
  lines.push(`  spent ${run.budget.spent} of ${run.budget.cap} tokens`);
  return lines;
}

/**
 * One answer as a short phrase for the report. Every type reduces to a value, because the
 * report is read beside what the run actually did and a paragraph per answer would bury it.
 * @param {import('./jev.mjs').JevAnswer} answer
 * @returns {string}
 */
function describe(answer) {
  if (answer.type === 'noul') return answer.noul.toFixed(2);
  if (answer.type === 'choice') return `${answer.choice} (${answer.confidence.toFixed(2)})`;
  return `${answer.score.toFixed(2)} (${answer.confidence.toFixed(2)})`;
}
