// The eval harness is networked and nondeterministic; this repository's gates are neither.
//
// Everything in the first block below asserts the harness CANNOT BE REACHED from a gate, and each
// assertion reads the real file rather than a restatement of it — `verify`'s own discovery rule
// out of `verify.mjs`, the test globs out of `package.json`, the jobs out of the workflow. A
// later edit that wires the eval into any of the three fails here.
//
// This file is itself deterministic and offline: it makes no network call, and importing the
// harness runs nothing, which is the guard it also checks.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SCRIPT = 'judge:eval';
const HARNESS = 'src/toolkit/eval/judge-eval.mjs';

/** @returns {Record<string, string>} */
function scripts() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return manifest.scripts;
}

test('the harness has a package.json script of its own', () => {
  assert.equal(scripts()[SCRIPT], `node ${HARNESS}`);
});

test('verify cannot discover the eval script', () => {
  // The discovery rule, lifted from the verb rather than described: the PREFERRED list plus every
  // script whose name starts with `check:`.
  const verb = readFileSync(join(ROOT, 'src/toolkit/verbs/verify.mjs'), 'utf8');
  const preferred = /const PREFERRED = \[([^\]]*)\]/.exec(verb);
  assert.ok(preferred, 'verify.mjs no longer declares PREFERRED — re-read its discovery rule');
  const names = [...preferred[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(names.length > 0);

  const discovered = [...names, ...Object.keys(scripts()).filter((s) => s.startsWith('check:'))];
  assert.ok(!discovered.includes(SCRIPT), `${SCRIPT} is discoverable by verify`);

  // And the rule itself is still the one asserted above, so a rewritten discovery cannot pass this
  // test by accident.
  assert.match(verb, /Object\.keys\(scripts\)\.filter\(\(s\) => s\.startsWith\('check:'\)\)/);
});

test('pnpm test cannot reach the harness', () => {
  const command = scripts().test;
  const globs = [...command.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(globs.length > 0, 'the test script no longer carries quoted globs');

  // `**/` spans directories, a lone `*` does not, and everything else is literal. Built by
  // scanning rather than by chained splits, so no placeholder character is needed and the
  // formatter has nothing to rewrite.
  const matches = (/** @type {string} */ glob, /** @type {string} */ path) => {
    let pattern = '';
    let i = 0;
    while (i < glob.length) {
      if (glob.startsWith('**/', i)) {
        pattern += '(?:.*/)?';
        i += 3;
        continue;
      }
      if (glob[i] === '*') {
        pattern += '[^/]*';
        i += 1;
        continue;
      }
      pattern += glob[i].replace(/[.+^${}()|[\]\\?]/, '\\$&');
      i += 1;
    }
    return new RegExp(`^${pattern}$`).test(path);
  };

  // The matcher is only trustworthy if it agrees with the globs on a file the suite really does
  // run, so it is checked against this very file before it is used to clear the harness.
  assert.ok(
    globs.some((g) => matches(g, 'src/toolkit/eval/judge-eval.test.mjs')),
    'the matcher does not match this test file, so its verdict on the harness means nothing',
  );
  for (const glob of globs) {
    assert.ok(!matches(glob, HARNESS), `${glob} matches the harness`);
  }
});

test('no CI workflow runs the eval', () => {
  const dir = join(ROOT, '.github/workflows');
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const yaml = readFileSync(join(dir, file), 'utf8');
    assert.ok(!yaml.includes(SCRIPT), `${file} references ${SCRIPT}`);
    assert.ok(!yaml.includes('judge-eval'), `${file} references the harness`);
  }
});

test('check-commands.sh does not run the eval', () => {
  const sh = readFileSync(join(ROOT, 'scripts/check-commands.sh'), 'utf8');
  assert.ok(!sh.includes(SCRIPT));
  assert.ok(!sh.includes('judge-eval'));
});

test('importing the harness runs nothing', async () => {
  // main() is guarded on argv[1]; under the test runner that is this file, not the harness.
  const mod = await import('./judge-eval.mjs');
  assert.ok(mod.runEval instanceof Function);
  assert.ok(mod.format instanceof Function);
});

// ---------------------------------------------------------------------------------------------
// The mirrored gate regex, and the arithmetic.
// ---------------------------------------------------------------------------------------------

test('the mirrored UNJUDGEABLE regex still matches the gate it copies', async () => {
  const { UNJUDGEABLE, UNJUDGEABLE_SOURCE } = await import('./subject-b.mjs');
  const source = readFileSync(join(ROOT, UNJUDGEABLE_SOURCE), 'utf8');
  const declared = /const UNJUDGEABLE = (\/.*\/);/.exec(source);
  assert.ok(declared, `${UNJUDGEABLE_SOURCE} no longer declares UNJUDGEABLE`);
  assert.equal(UNJUDGEABLE.source, new RegExp(declared[1].slice(1, -1)).source);
});

test('agreement splits by band and measures coverage against the whole corpus', async () => {
  const { agreement } = await import('./metrics.mjs');
  /** @param {string} e @param {string | null} a @param {number} c */
  const row = (e, a, c) => ({
    expected: e,
    actual: a,
    confidence: c,
    latencyMs: 10,
    inputTokens: 0,
    outputTokens: 0,
    displacedTokens: 0,
  });

  const got = agreement([row('keep', 'keep', 0.95), row('keep', 'delete', 0.95), row('keep', 'keep', 0.1)], 0.9);
  assert.equal(got.size, 3);
  assert.equal(got.reached, 2);
  assert.equal(got.atBand, 0.5);
  // Two of three rows reached the band, not two of two — an abstaining classifier must not report
  // full coverage.
  assert.equal(got.coverage, 2 / 3);
});

test('an unanswered row counts against coverage but not against agreement', async () => {
  const { agreement } = await import('./metrics.mjs');
  const got = agreement(
    [
      {
        expected: 'keep',
        actual: 'keep',
        confidence: 0.95,
        latencyMs: 1,
        inputTokens: 0,
        outputTokens: 0,
        displacedTokens: 0,
      },
      {
        expected: 'keep',
        actual: null,
        confidence: 0,
        latencyMs: 1,
        inputTokens: 0,
        outputTokens: 0,
        displacedTokens: 0,
      },
    ],
    0.9,
  );
  assert.equal(got.atBand, 1);
  assert.equal(got.coverage, 0.5);
  assert.equal(got.answered, 1);
});

test('percentile never invents a value nobody observed', async () => {
  const { percentile } = await import('./metrics.mjs');
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([5], 0.95), 5);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2);
  assert.equal(percentile([1, 2, 3, 4], 0.95), 4);
});

test('price is summed from returned usage and skips rows that carried none', async () => {
  const { price, priceRatio } = await import('./metrics.mjs');
  const got = price([
    { expected: 'k', actual: 'k', confidence: 1, latencyMs: 1, inputTokens: 100, outputTokens: 20, displacedTokens: 0 },
    { expected: 'k', actual: 'k', confidence: 1, latencyMs: 1, inputTokens: 0, outputTokens: 0, displacedTokens: 0 },
  ]);
  assert.equal(got.totalTokens, 120);
  assert.equal(got.counted, 1);
  // An unmeasured displaced pass yields no ratio rather than a divide-by-zero or a guess.
  assert.equal(priceRatio(120, 0), null);
  assert.equal(priceRatio(10, 100), 0.1);
});

// ---------------------------------------------------------------------------------------------
// The pre-registered bars.
// ---------------------------------------------------------------------------------------------

test('an unmeasured bar never reports a pass', async () => {
  const { scoreSubjectA, verdictOf } = await import('./bars.mjs');
  const bars = scoreSubjectA({
    labelledSize: 1911,
    baseline: 0.865,
    agreementAtBand: null,
    coverageAtBand: null,
    priceRatio: null,
    latencyP95Ms: null,
  });
  assert.ok(bars.every((b) => b.status === 'not-measured'));
  assert.equal(verdictOf(bars).verdict, 'incomplete');
});

test('Subject A abandons on a margin under 10 points even with high absolute agreement', async () => {
  const { scoreSubjectA, verdictOf } = await import('./bars.mjs');
  const bars = scoreSubjectA({
    labelledSize: 1911,
    baseline: 0.865,
    agreementAtBand: 0.93,
    coverageAtBand: 0.5,
    priceRatio: 0.05,
    latencyP95Ms: 1000,
  });
  const got = verdictOf(bars);
  assert.equal(got.verdict, 'abandon');
  assert.deepEqual(got.failing, ['A.agreement']);
});

test('Subject A passes only when every bar clears', async () => {
  const { scoreSubjectA, verdictOf } = await import('./bars.mjs');
  const bars = scoreSubjectA({
    labelledSize: 1911,
    baseline: 0.865,
    agreementAtBand: 0.97,
    coverageAtBand: 0.5,
    priceRatio: 0.05,
    latencyP95Ms: 1000,
  });
  assert.equal(verdictOf(bars).verdict, 'pass');
});

test('Subject B abandons on a labelled corpus under 200, with no network involved', async () => {
  const { scoreSubjectB, verdictOf } = await import('./bars.mjs');
  const bars = scoreSubjectB({
    labelledSize: 12,
    baseline: null,
    agreementAtBand: null,
    coverageAtBand: null,
    priceRatio: null,
    latencyP95Ms: null,
  });
  const got = verdictOf(bars);
  assert.equal(got.verdict, 'abandon');
  assert.deepEqual(got.failing, ['B.corpus']);
  assert.equal(bars[0].status, 'fail');
});

// ---------------------------------------------------------------------------------------------
// Subject B's labeller, against transcript text rather than the real store.
// ---------------------------------------------------------------------------------------------

const TRANSCRIPT = [
  '# Session test',
  '- decided: starting',
  '- ▸ Bash(command=grep -rn "{foo}" src/a.mjs)',
  '- decided: that was refused for its shape, retrying smaller',
  '- Bash(command=grep -rn foo src/a.mjs)',
  '- ▸ Bash(command=ls -la ~/.claude/commands)',
  '- decided: fine, moving on',
  '- Bash(command=ls -la /tmp)',
].join('\n');

test('a candidate is labelled only when a reissue and a recorded failure both appear', async () => {
  const { parseTranscript, labelSession } = await import('./subject-b.mjs');
  const calls = parseTranscript('s1', TRANSCRIPT);
  assert.equal(calls.length, 4);
  assert.equal(calls.filter((c) => c.candidate).length, 2);

  const rows = labelSession(calls);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].label, 'should-have-been-refused');
  // The tilde call was reissued smaller too, but nothing recorded that the original was refused,
  // so it stays unlabelled rather than being assumed either way.
  assert.equal(rows[1].label, null);
  assert.match(rows[1].reason, /nothing records that the original was refused/);
});

test('a candidate with no outcome recorded is never labelled allow by default', async () => {
  const { parseTranscript, labelSession } = await import('./subject-b.mjs');
  const rows = labelSession(parseTranscript('s2', '- ▸ Bash(command=echo "$HOME")'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, null);
  assert.match(rows[0].reason, /no recorded outcome/);
});

test('a truncated command is recorded as truncated', async () => {
  const { parseTranscript } = await import('./subject-b.mjs');
  const calls = parseTranscript('s3', "- ▸ Bash(command=cd /tmp && jq -r '.diff[] | . as $f…)");
  assert.equal(calls[0].truncated, true);
  assert.equal(calls[0].candidate, true);
});
