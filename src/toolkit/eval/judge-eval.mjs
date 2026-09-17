#!/usr/bin/env node
// `pnpm judge:eval` — the campaign's deliverable.
//
// `docs/adrs/0010-eval-harness-before-the-layer.md` made the eval the thing this campaign ships,
// and `docs/adrs/0008-no-question-set-acts-in-this-campaign.md` means nothing acts, so the numbers
// below are the campaign's only return.
//
// **This script is deliberately unreachable from every gate.** It is networked and
// nondeterministic and this repository's gates are neither, so it is not in `verify`'s discovery
// list, not matched by `pnpm test`'s globs, and named in no CI job. `judge-eval.test.mjs` asserts
// all three against the real files rather than trusting this comment.
//
// It reads `claude-proxy` only as a label source, through `CLAUDE_PROXY_STORE`, and changes
// nothing there. No API key is written anywhere: the client reads it from the environment and the
// report below never carries it.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBudget, NOUL_HIGH_CONFIDENCE_DISTANCE } from '../lib/jev.mjs';
import { SUBJECT_A_BAND, scoreSubjectA, scoreSubjectB, verdictOf } from './bars.mjs';
import { allMetrics } from './metrics.mjs';
import { MAX_QUESTIONS_PER_CALL, MAX_REQUEST_BYTES, runSubjectA } from './subject-a.mjs';
import { buildCorpus as buildSubjectB, storePath } from './subject-b.mjs';

/** Results land outside the repository, per the ticket's constraints. */
const OUT_DIR = join(homedir(), '.my-command', 'judge-eval');

/**
 * Where `jev-record` writes its sessions, per the on-disk format in
 * `docs/specs/command-toolkit.md`. Read here and never written: this harness is one of the two
 * readers that spec names.
 */
function recordDir() {
  const override = process.env.MY_COMMAND_JEV_RECORD_DIR;
  return override === undefined || override === '' ? join(homedir(), '.my-command', 'jev-record') : override;
}

/**
 * The newest `jev-record` session still listening, or null when none is.
 *
 * Session directories are named UTC-first, so the lexical sort is chronological. A session that
 * has written `endedAt` has stopped and its `url` no longer answers; one whose `port` is still
 * null was never listening. Both are skipped rather than returned as a URL that would fail.
 * @param {string} [dir]
 * @returns {{url: string, session: string, dir: string, endpoint: string} | null}
 */
export function findRecorder(dir = recordDir()) {
  /** @type {string[]} */
  let names;
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    return null;
  }

  for (const name of names) {
    /** @type {Record<string, unknown>} */
    let session;
    try {
      session = JSON.parse(readFileSync(join(dir, name, 'session.json'), 'utf8'));
    } catch {
      continue;
    }
    // The spec says a reader that does not recognise `v` skips the record rather than guessing.
    if (session.v !== 1) continue;
    if (session.endedAt !== undefined && session.endedAt !== null) continue;
    const url = session.url;
    if (String(url) !== url || url === '') continue;
    return {
      url,
      session: String(session.session ?? name),
      dir: join(dir, name),
      endpoint: String(session.endpoint ?? ''),
    };
  }
  return null;
}

/**
 * What `--help` prints, and what an unrecognised argument is answered with.
 *
 * It is the whole flag list rather than a pointer to one, because the failure this exists to stop
 * is a run that spent real money before anyone could read anything.
 */
export const USAGE = `pnpm judge:eval [options]

Replay the pre-registered eval. With TYPESAFE_API_KEY set, this makes real API calls
against a real endpoint and spends real budget.

  --limit <n>     Score at most n corpus rows. Use this before any full run.
  --chunk <n>     Questions per call (default ${MAX_QUESTIONS_PER_CALL}).
  --bytes <n>     Bytes per request (default ${MAX_REQUEST_BYTES}). The endpoint refuses
                  a request over its input-token ceiling with a 400.
  --record [url]  Route every call through a jev-record proxy so the whole exchange is
                  written down. Bare, it finds the running session; with a url, it uses
                  that one. No live recorder is an error, not a fall-through.
  --json          Print the report as JSON instead of as text.
  --out <dir>     Write the report here instead of ${OUT_DIR}.
  --help, -h      Print this and exit, without calling anything.
`;

/**
 * An argument this harness does not recognise.
 *
 * It is a thrown error rather than a return value because every caller must stop: the recorded
 * failure is a `--help` that parsed as nothing, fell through to a full replay, and spent the
 * budget on 103 calls nobody asked for.
 */
export class UsageError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

/**
 * @param {string[]} argv
 * @returns {{limit: number | undefined, json: boolean, out: string, chunk: number,
 *   bytes: number, record: boolean, recordUrl: string | undefined, help: boolean}}
 * @throws {UsageError} On any argument this harness does not recognise, before anything is sent.
 */
export function parseArgs(argv) {
  let limit;
  let json = false;
  let out = OUT_DIR;
  let chunk = MAX_QUESTIONS_PER_CALL;
  let bytes = MAX_REQUEST_BYTES;
  let record = false;
  let help = false;
  /** @type {string | undefined} */
  let recordUrl;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--limit') {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) limit = n;
      i += 1;
      continue;
    }
    if (arg === '--chunk') {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) chunk = n;
      i += 1;
      continue;
    }
    if (arg === '--bytes') {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) bytes = n;
      i += 1;
      continue;
    }
    if (arg === '--record') {
      record = true;
      // A bare `--record` finds the running session itself; `--record <url>` names one outright.
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        recordUrl = next;
        i += 1;
      }
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--out') {
      out = String(argv[i + 1] ?? out);
      i += 1;
      continue;
    }
    // Anything left is unrecognised, and the run stops here rather than at the endpoint. Silently
    // ignoring it is what turned a `--help` into 103 billed calls.
    throw new UsageError(`unrecognised argument: ${arg}`);
  }
  return { limit, json, out, chunk, bytes, record, recordUrl, help };
}

/** @param {number | null} n */
function pct(n) {
  return n === null ? 'not measured' : `${(n * 100).toFixed(1)}%`;
}

/** @param {number | null} n */
function ms(n) {
  return n === null ? 'not measured' : `${Math.round(n)}ms`;
}

/**
 * @param {import('./bars.mjs').BarOutcome[]} bars
 * @param {string[]} lines
 */
function printBars(bars, lines) {
  /** @type {Record<string, string>} */
  const marks = { pass: 'PASS', fail: 'FAIL', inconclusive: 'INCONCLUSIVE', 'not-measured': 'NOT MEASURED' };
  for (const bar of bars) {
    lines.push(`    [${marks[bar.status] ?? 'NOT MEASURED'}] ${bar.id} — ${bar.detail}`);
    // Only a real failure quotes the abandonment clause. An inconclusive bar has not met it — it
    // has not been tested against it — and printing the clause there is the conflation ADR 0016
    // exists to stop.
    if (bar.status === 'fail') lines.push(`             abandon if: ${bar.statement}`);
  }
}

/**
 * What the run's calls did, printed before the metrics they produced.
 *
 * It comes first for the same reason ADR 0012 and ADR 0013 put the corpus size before any
 * agreement number: a reader who sees the agreement figure first has already formed a view by the
 * time they reach the caveat.
 * @param {ReturnType<typeof import('./subject-a.mjs').summariseCalls>} integrity
 * @param {import('./subject-a.mjs').CallRecord[]} calls
 * @param {string[]} lines
 */
function printIntegrity(integrity, calls, lines) {
  lines.push('  RUN INTEGRITY (reported before any metric it affects)');
  lines.push(`    calls made:           ${integrity.calls}`);
  lines.push(`    questions asked:      ${integrity.questionsAsked}`);
  lines.push(`    answers returned:     ${integrity.answersReturned}`);
  lines.push(`    UNANSWERED:           ${integrity.questionsUnanswered}`);
  lines.push(`    calls that failed:    ${integrity.callsFailed}`);
  lines.push(`    calls short:          ${integrity.callsShortOfAnswers}`);

  if (integrity.reasons.length > 0) {
    lines.push('    failure reasons:');
    for (const r of integrity.reasons) {
      lines.push(`      ${r.calls} call(s) — ${r.reason}: ${r.detail}`);
    }
  }

  // Name the individual short calls, so "7 of 125" is a line a reader sees rather than a
  // subtraction they have to do.
  const short = calls.filter((c) => c.unansweredIds.length > 0);
  if (short.length > 0) {
    lines.push('    short calls:');
    for (const c of short.slice(0, 20)) {
      lines.push(
        `      ${c.file} [chunk ${c.chunkIndex + 1}/${c.chunkCount}] answered ${c.answerCount} of ${c.questionCount}` +
          `${c.reason === null ? '' : ` — ${c.reason}: ${c.detail}`}`,
      );
    }
    if (short.length > 20) lines.push(`      ... and ${short.length - 20} more`);
  }

  if (!integrity.complete && integrity.calls > 0) {
    lines.push('');
    lines.push('    This run did not answer every question it asked, so the numbers below describe');
    lines.push('    the run and not the classifier. The bars report INCONCLUSIVE rather than FAIL.');
  }
}

/**
 * Run both subjects and build the whole report.
 * @param {string} root
 * @param {object} opts
 * @param {number | undefined} opts.limit
 * @param {number} [opts.chunk]
 * @param {number} [opts.bytes]
 * @param {{url: string, session: string, dir: string, endpoint: string} | null} [opts.recorder]
 *   A running `jev-record` proxy to route every call through, or null for the real endpoint.
 */
export async function runEval(root, opts) {
  const key = process.env.TYPESAFE_API_KEY;
  const haveKey = key !== undefined && key !== '';
  const budget = createBudget();
  const recorder = opts.recorder ?? null;

  // ---- Subject A ----------------------------------------------------------------
  const a = await runSubjectA(root, {
    limit: opts.limit,
    budget,
    replay: haveKey,
    chunkSize: opts.chunk,
    maxBytes: opts.bytes,
    endpoint: recorder === null ? undefined : recorder.url,
  });
  // The generative pass /clean replaces was never run here, so its token count is unknown and the
  // price bar reports not-measured rather than dividing by a guess. ADR 0013 forbids estimating it.
  const aMetrics = allMetrics(a.rows, SUBJECT_A_BAND, 0);
  const aBars = scoreSubjectA({
    labelledSize: a.summary.size,
    baseline: a.summary.baseline.share,
    agreementAtBand: aMetrics.agreement.atBand,
    coverageAtBand: a.rows.length === 0 ? null : aMetrics.agreement.coverage,
    priceRatio: aMetrics.price.ratioOfDisplacedPass,
    latencyP95Ms: aMetrics.latency.p95,
    // The coverage denominator is left exactly as it was — the unanswered rows stay in it and stay
    // counted as not reaching the band. What changes is that a bar computed over them says so
    // instead of reading as a measurement. ADR 0016 refuses the flattering repair on purpose.
    dataComplete: a.integrity.complete,
  });
  const aVerdict = verdictOf(aBars);

  // ---- Subject B ----------------------------------------------------------------
  const store = storePath();
  const b = store === null ? null : buildSubjectB(store);
  const bMetrics = allMetrics([], NOUL_HIGH_CONFIDENCE_DISTANCE, 0);
  const bBars = scoreSubjectB({
    labelledSize: b === null ? 0 : b.labelled,
    baseline: null,
    agreementAtBand: null,
    coverageAtBand: null,
    priceRatio: null,
    latencyP95Ms: null,
  });
  const bVerdict = verdictOf(bBars);
  // ADR 0012: a labelled corpus under 200 drops this subject to question-set-only.
  const bDropped = b === null || b.labelled < 200;

  return {
    generatedAt: new Date().toISOString(),
    apiKeyPresent: haveKey,
    // Where the calls went and, when a recorder was used, where the full exchange was written. The
    // record sits beside the report by reference: this is the pointer from one to the other.
    recorder,
    chunkSize: opts.chunk ?? MAX_QUESTIONS_PER_CALL,
    maxRequestBytes: opts.bytes ?? MAX_REQUEST_BYTES,
    subjectA: {
      corpus: a.summary,
      batches: a.batches,
      // Every call the run made, with its own reason and its own unanswered ids. This is what
      // makes a failed run readable from the report alone, with nothing re-run.
      calls: a.calls,
      integrity: a.integrity,
      metrics: aMetrics,
      bars: aBars,
      ...aVerdict,
    },
    subjectB: {
      store: store === null ? null : 'CLAUDE_PROXY_STORE',
      corpus:
        b === null
          ? null
          : {
              transcripts: b.transcripts,
              bashCalls: b.bashCalls,
              candidates: b.candidates,
              sessionsWithCandidate: b.sessionsWithCandidate,
              truncatedCandidates: b.truncatedCandidates,
              labelled: b.labelled,
              counts: b.counts,
              unlabelledBecause: b.unlabelledBecause,
            },
      metrics: bMetrics,
      bars: bBars,
      droppedToQuestionSetOnly: bDropped,
      ...bVerdict,
    },
  };
}

/**
 * The human-readable report. **The labelled corpus size comes before any agreement number**, for
 * both subjects — ADR 0012 and ADR 0013 both require it, and for Subject B the count is the whole
 * finding.
 * @param {Awaited<ReturnType<typeof runEval>>} report
 * @returns {string}
 */
export function format(report) {
  /** @type {string[]} */
  const lines = [];
  lines.push('# judge:eval — the pre-registered bar');
  lines.push('');
  lines.push(`API key present: ${report.apiKeyPresent ? 'yes' : 'NO — nothing was sent to the endpoint'}`);
  lines.push(`Questions per call: ${report.chunkSize}, and at most ${report.maxRequestBytes} bytes per request`);
  lines.push(
    report.recorder === null
      ? 'Recording: off — calls went straight to the endpoint and nothing was written down'
      : `Recording: ${report.recorder.url} — full exchange in ${report.recorder.dir}`,
  );
  lines.push('');

  const a = report.subjectA;
  lines.push('## Subject A — /clean comment keep/drop');
  lines.push('');
  lines.push(`  CORPUS (reported before any agreement number)`);
  lines.push(`    labelled rows:        ${a.corpus.size}`);
  lines.push(`    /clean commits:       ${a.corpus.commits}`);
  lines.push(`    labels:               ${JSON.stringify(a.corpus.counts)}`);
  lines.push(`    majority-class base:  ${pct(a.corpus.baseline.share)} (${a.corpus.baseline.label})`);
  lines.push(`    pre-filtered out:     ${a.corpus.preFiltered.total} comments never scored`);
  lines.push(`    file batches:         ${a.batches}`);
  lines.push('');
  printIntegrity(a.integrity, a.calls, lines);
  lines.push('');
  lines.push('  METRICS');
  lines.push(`    agreement overall:    ${pct(a.metrics.agreement.overall)}`);
  lines.push(`    agreement at >=${SUBJECT_A_BAND}:  ${pct(a.metrics.agreement.atBand)}`);
  lines.push(
    `    coverage at >=${SUBJECT_A_BAND}:   ${pct(a.metrics.agreement.size === 0 ? null : a.metrics.agreement.coverage)}` +
      ` (${a.metrics.agreement.reached} of ${a.metrics.agreement.size} rows;` +
      ` ${a.metrics.agreement.size - a.metrics.agreement.answered} never answered)`,
  );
  lines.push(
    `    price:                ${a.metrics.price.totalTokens} tokens from returned usage over ${a.metrics.price.counted} calls`,
  );
  lines.push(`    latency p50 / p95:    ${ms(a.metrics.latency.p50)} / ${ms(a.metrics.latency.p95)}`);
  lines.push(`    displaced context:    ${a.metrics.displacedContext.total} tokens`);
  lines.push('');
  lines.push(`  VERDICT: ${a.verdict.toUpperCase()}`);
  if (a.verdict === 'inconclusive') {
    lines.push('  The run did not produce enough data to evaluate the bars. This is NOT an');
    lines.push('  abandonment: no bar was tested against its abandonment clause. Fix the run and');
    lines.push('  measure again before reading anything above as a result about the classifier.');
  }
  printBars(a.bars, lines);
  lines.push('');

  const b = report.subjectB;
  lines.push('## Subject B — the hook UNJUDGEABLE blind spot');
  lines.push('');
  if (b.corpus === null) {
    lines.push('  CLAUDE_PROXY_STORE is unset, so no label source was read.');
  } else {
    lines.push(`  CORPUS (reported before any agreement number)`);
    lines.push(`    transcripts scanned:  ${b.corpus.transcripts}`);
    lines.push(`    recorded Bash calls:  ${b.corpus.bashCalls}`);
    lines.push(`    candidates:           ${b.corpus.candidates} across ${b.corpus.sessionsWithCandidate} sessions`);
    lines.push(`    of those, truncated:  ${b.corpus.truncatedCandidates}`);
    lines.push(`    LABELLED:             ${b.corpus.labelled}`);
    lines.push(`    labels:               ${JSON.stringify(b.corpus.counts)}`);
    lines.push('    unlabelled because:');
    for (const [reason, n] of Object.entries(b.corpus.unlabelledBecause)) {
      lines.push(`      ${n} — ${reason}`);
    }
  }
  lines.push('');
  lines.push(`  VERDICT: ${b.verdict.toUpperCase()}`);
  printBars(b.bars, lines);
  if (b.droppedToQuestionSetOnly) {
    lines.push('');
    lines.push('  Per ADR 0012, a labelled corpus under 200 drops this subject to question-set-only.');
    lines.push('  The campaign has one eval subject.');
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  // Parsed before anything else, and a bad argument stops the run here. Everything below this
  // block can spend money; nothing in it can.
  /** @type {ReturnType<typeof parseArgs>} */
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  const { limit, json, out, chunk, bytes, record, recordUrl } = args;
  const root = process.cwd();

  /** @type {{url: string, session: string, dir: string, endpoint: string} | null} */
  let recorder = null;
  if (record) {
    recorder =
      recordUrl === undefined
        ? findRecorder()
        : { url: recordUrl, session: 'given on the command line', dir: '', endpoint: '' };
    // Falling back to the real endpoint here would spend the budget on exactly the calls the run
    // asked to have written down, and produce a report that looks recorded and is not.
    if (recorder === null) {
      process.stderr.write(
        'no running jev-record session found — start one with `my-command-tools jev-record start`,\n' +
          'or pass its URL as `--record <url>`. Nothing was sent.\n',
      );
      process.exitCode = 1;
      return;
    }
  }

  const report = await runEval(root, { limit, chunk, bytes, recorder });

  mkdirSync(out, { recursive: true });
  const file = join(out, `judge-eval-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));

  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${format(report)}\n`);
  process.stdout.write(`\nresults written to ${file}\n`);
}

// Guarded so the deterministic test suite can import the pure helpers above without this script
// ever running, and so nothing that merely resolves the module can reach the network.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
