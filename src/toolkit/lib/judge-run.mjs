// What `/task --jev` opens: one run's question sites, one recorder session, one spend cap,
// and a report of what was asked. **Two sites are wired, and no site acts.**
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
// change for that to happen — nor would it grant it. `actingSites()` is the one door, no
// shipped site opens it, and `judge-run.test.mjs` asserts that rather than trusting it.
//
// **The two wired sites are at opposite ends of the promotion order, and neither ordering
// follows from its label.** The rule both obey is
// `docs/adrs/0019-the-load-shedding-site-is-promoted-last.md`'s: **Jev may add work, Jev may
// never skip work.** Promotion order is set by what a wrong answer costs, not by how good the
// label is, and here the two come apart completely.
//
// `step-2.6/surface` asks whether the diff reaches a surface the app serves — a question whose
// answer, if anything ever acted on it, would decide a **skip**. A wrong high answer costs one
// wasted verification round; a wrong low answer silently loses a verification and leaves no
// artefact anywhere. It was wired first for its label, which is the cleanest and highest-volume
// one in the campaign — the verifier's own verdict, computed minutes later and recorded
// regardless, so collecting it is free — and it is promoted **last** for its blast radius.
//
// `step-2.5/complexity` is the mirror image. Its labels are the worse of the two: four partial
// signals, every one of them arriving after the question was asked, which
// `src/toolkit/judge/complexity-triage.json`'s `eval` block sets out rather than glossing. But
// its answer would **add** a rework pass rather than skip one, so a wrong high answer costs a
// wasted pass the run report shows and a wrong low answer costs nothing that was not already
// the status quo. Under the rule above that makes it the site that could act **soonest**,
// ahead of `step-2.6/surface`, despite the worse label —
// `docs/adrs/0020-the-adding-work-site-is-promoted-first.md` records why.
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
 * @property {((state: import('./jev.mjs').JevState) => Record<string, import('./jev.mjs').JevQuestion>) | undefined} [questionsFor]
 *   A site whose question map depends on what the run changed builds it here, and `questions`
 *   is then the empty fallback rather than the thing sent. Present only on a per-file site.
 */

/**
 * The changed files a state carries, or none when it carries no such list.
 *
 * Tolerant on purpose: the state is assembled by the command rather than by a schema, so a
 * missing or malformed `changedFiles` means this site asks nothing rather than throwing inside
 * a layer whose whole contract is that it never changes an outcome.
 * @param {import('./jev.mjs').JevState} state
 * @returns {string[]}
 */
export function changedFilesOf(state) {
  // Parsed at the boundary rather than narrowed: `Object()` gives every input a property bag
  // to read through — a string, an array and a bare object all answer `undefined` here unless
  // they really carry the field — and `Array.isArray` then settles whether what came back is
  // the list this function is about. What leaves is the domain value: paths, or none.
  const carried = /** @type {Record<string, unknown>} */ (Object(state ?? {})).changedFiles;
  const entries = Array.isArray(carried) ? carried : [];

  /** @type {string[]} */
  const paths = [];
  for (const entry of entries) {
    const path = (asText(entry) ?? '').trim();
    if (path !== '') paths.push(path);
  }
  return paths;
}

/**
 * One `noul` per changed file, which is what `step-2.5/complexity` asks.
 *
 * The per-file shape is the question: complexity is a property of a change to a file, and a
 * single answer over a whole diff would average a hard change to one file together with a
 * rename applied to nine others. Keys carry the path so a recorded row can be paired back to
 * the file it was about, which is the whole of what makes the corpus labellable.
 * @param {import('./jev.mjs').JevState} state
 * @returns {Record<string, import('./jev.mjs').JevQuestion>}
 */
export function complexityQuestions(state) {
  /** @type {Record<string, import('./jev.mjs').JevQuestion>} */
  const questions = {};
  for (const path of changedFilesOf(state)) {
    questions[`NEEDS_REWORK::${path}`] = {
      type: /** @type {const} */ ('noul'),
      instructions:
        `The change to \`${path}\` is complex enough to warrant a rework pass before it is ` +
        'verified: it is intricate, wide-reaching, or subtle enough that a second look at the ' +
        'code would likely find something a verification round would not. Judge the change, ' +
        'not the file — a one-line edit to a shared guard can be the hardest thing on a branch, ' +
        'and a three-hundred-line edit can be a rename a tool applied.',
      criteria: {
        true: 'A rework pass over this file before verification would be worth its cost.',
        false: 'The change is straightforward and a rework pass would find nothing.',
      },
    };
  }
  return questions;
}

/**
 * What a site actually asks on this run: its builder's output where it has one, its static map
 * otherwise. The one place the two kinds of site are reconciled, so nothing downstream — the
 * live path or the dry run — has to know which kind it is holding.
 * @param {JudgeSite} site
 * @param {import('./jev.mjs').JevState} state
 * @returns {Record<string, import('./jev.mjs').JevQuestion>}
 */
export function questionsAt(site, state) {
  return site.questionsFor ? site.questionsFor(state) : site.questions;
}

/**
 * The sites `/task --jev` asks at, in the order a run reaches them. Two, and neither acts.
 *
 * `step-2.5/complexity` sits between Step 2.5 and Step 2.6 — after the anti-slop lint is clear
 * and before anything boots — and asks one `noul` per changed file: is this change involved
 * enough to warrant a rework pass before it is verified? **No rework pass is scheduled and none
 * is withheld.** Unlike the other site it shadows no deterministic check, because `/task` has
 * never had a pre-verify rework pass; the answer is a first opinion about a decision nobody
 * currently makes, which is why it is asked rather than computed. No line count expresses it.
 *
 * `step-2.6/surface` sits beside Step 2.6's second skip condition, where the run already
 * decides — by matching changed files against the repo's `routes` globs — whether the diff
 * reaches anything the app serves. **The glob still decides.** This answer is recorded beside
 * the glob's in the run report and read by nothing: no branch consults it, and no skip is
 * taken or withheld because of it.
 *
 * The question is worth asking because the glob answers something narrower than the condition
 * it implements. A glob matches a path; the condition is about reachability, and the two come
 * apart in both directions — a shared helper under a non-route path can change every served
 * page, and a file under a routes glob can be dead. Step 2.6 writes the second half in prose
 * ("nothing else in the diff reaches a served surface") precisely because no glob expresses it.
 * @type {readonly JudgeSite[]}
 */
export const SITES = Object.freeze([
  Object.freeze({
    id: 'step-2.5/complexity',
    set: 'complexity-triage',
    version: '1.0.0',
    // ADR 0008 holds, so this is false like every other. ADR 0020 records why it would
    // nonetheless be the first site promoted if ADR 0008 were ever superseded: its answer adds
    // a pass rather than skipping one, and a wasted pass is visible in the run report.
    acts: false,
    // Built per changed file, so the static map is empty and `questionsFor` is what is sent.
    questions: Object.freeze({}),
    questionsFor: complexityQuestions,
  }),
  Object.freeze({
    id: 'step-2.6/surface',
    set: 'verify-surface',
    version: '1.0.0',
    // ADR 0008, and ADR 0019 on top of it: this is the last site in the campaign that may ever
    // be promoted, because its answer would decide a skip rather than an addition.
    acts: false,
    questions: Object.freeze({
      REACHES_SERVED_SURFACE: Object.freeze({
        type: /** @type {const} */ ('noul'),
        instructions:
          'The diff reaches a surface the app serves: something a user is served is rendered ' +
          'differently, behaves differently, or returns different data because of these changes. ' +
          'Judge reachability, not file paths — a shared helper, query, schema or config file ' +
          'that no routes glob matches can still change every served page, and a file sitting ' +
          'under a routes glob can be unreferenced.',
        criteria: Object.freeze({
          true: 'The diff reaches a served surface, so there is something to exercise in the running app.',
          false: 'The diff touches nothing the app serves.',
        }),
      }),
    }),
  }),
]);

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
    const questions = questionsAt(site, state);

    // A per-file site on a run with no changed files has nothing to ask. Sending an empty
    // question map would spend a call to be told nothing, so it is refused here and reported,
    // which keeps the reason readable in the run report rather than arriving as a malformed
    // answer from the far end.
    if (Object.keys(questions).length === 0) {
      reports.push({
        id: site.id,
        set: site.set,
        acts: site.acts === true,
        asked: false,
        reason: 'no-questions',
        answers: {},
        usage: { input_tokens: 0, output_tokens: 0 },
        recordedAt: null,
      });
      continue;
    }

    const report = await consult({
      state,
      questions,
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
      body: buildRequest(state, questionsAt(site, state)),
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
