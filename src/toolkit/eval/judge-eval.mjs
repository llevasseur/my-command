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

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBudget, NOUL_HIGH_CONFIDENCE_DISTANCE } from '../lib/jev.mjs';
import { SUBJECT_A_BAND, scoreSubjectA, scoreSubjectB, verdictOf } from './bars.mjs';
import { allMetrics } from './metrics.mjs';
import { runSubjectA } from './subject-a.mjs';
import { buildCorpus as buildSubjectB, storePath } from './subject-b.mjs';

/** Results land outside the repository, per the ticket's constraints. */
const OUT_DIR = join(homedir(), '.my-command', 'judge-eval');

/**
 * @param {string[]} argv
 * @returns {{limit: number | undefined, json: boolean, out: string}}
 */
export function parseArgs(argv) {
  let limit;
  let json = false;
  let out = OUT_DIR;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) limit = n;
      i += 1;
      continue;
    }
    if (arg === '--json') json = true;
    if (arg === '--out') {
      out = String(argv[i + 1] ?? out);
      i += 1;
    }
  }
  return { limit, json, out };
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
  for (const bar of bars) {
    const mark = bar.status === 'pass' ? 'PASS' : bar.status === 'fail' ? 'FAIL' : 'NOT MEASURED';
    lines.push(`    [${mark}] ${bar.id} — ${bar.detail}`);
    if (bar.status === 'fail') lines.push(`             abandon if: ${bar.statement}`);
  }
}

/**
 * Run both subjects and build the whole report.
 * @param {string} root
 * @param {{limit: number | undefined}} opts
 */
export async function runEval(root, opts) {
  const key = process.env.TYPESAFE_API_KEY;
  const haveKey = key !== undefined && key !== '';
  const budget = createBudget();

  // ---- Subject A ----------------------------------------------------------------
  const a = await runSubjectA(root, { limit: opts.limit, budget, replay: haveKey });
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
    subjectA: { corpus: a.summary, batches: a.batches, metrics: aMetrics, bars: aBars, ...aVerdict },
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
  lines.push(`    batched calls:        ${a.batches}`);
  lines.push('');
  lines.push('  METRICS');
  lines.push(`    agreement overall:    ${pct(a.metrics.agreement.overall)}`);
  lines.push(`    agreement at >=${SUBJECT_A_BAND}:  ${pct(a.metrics.agreement.atBand)}`);
  lines.push(
    `    coverage at >=${SUBJECT_A_BAND}:   ${pct(a.metrics.agreement.size === 0 ? null : a.metrics.agreement.coverage)}`,
  );
  lines.push(
    `    price:                ${a.metrics.price.totalTokens} tokens from returned usage over ${a.metrics.price.counted} calls`,
  );
  lines.push(`    latency p50 / p95:    ${ms(a.metrics.latency.p50)} / ${ms(a.metrics.latency.p95)}`);
  lines.push(`    displaced context:    ${a.metrics.displacedContext.total} tokens`);
  lines.push('');
  lines.push(`  VERDICT: ${a.verdict.toUpperCase()}`);
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
  const { limit, json, out } = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = await runEval(root, { limit });

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
