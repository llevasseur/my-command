// The question sets are data, so what can rot is the data: a file that stops parsing, a
// criterion whose cited line drifts, a set that grows an eval number with no labels. The
// request shape is asserted here rather than imported because the client and the judge verb
// land in their own tickets.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const judgeDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(judgeDir, '..', '..', '..');

const files = readdirSync(judgeDir)
  .filter((name) => name.endsWith('.json'))
  .sort();

/** @type {Map<string, any>} */
const sets = new Map();

const KINDS = new Set(['noul', 'choice']);
const LABELS = new Set(['recoverable', 'none']);

// A question set is JSON on disk, so every field arrives as `unknown`. These two are the
// parsers at that boundary: each answers with the domain value the checks below are actually
// about — the prose a criterion carries, or the entries a list holds — or with undefined when
// the field carried no such value. The assertions then branch on that value rather than
// re-narrowing the representation it arrived in.

/**
 * The prose a field carried, or undefined when it carried none. `String(value) === value`
 * holds for a string primitive and nothing else.
 * @param {unknown} value @returns {string | undefined}
 */
const prose = (value) => {
  const text = String(value) === value ? value : '';
  return text.length > 0 ? text : undefined;
};

/**
 * The entries a field carried, or undefined when it carried none.
 * @param {unknown} value @returns {unknown[] | undefined}
 */
const filled = (value) => (Array.isArray(value) && value.length > 0 ? value : undefined);

/** Sets that ADR 0012 leaves without recoverable labels. Each must say so in its own file. */
const NO_LABELS = ['trim', 'dispatch-route', 'verify-regression'];

/** Sets ADR 0010 leaves wired into nothing. */
const UNWIRED = ['dispatch-route', 'bash-shape'];

test('every set parses as JSON', () => {
  assert.ok(files.length > 0, 'no question sets found');
  for (const name of files) {
    const raw = readFileSync(join(judgeDir, name), 'utf8');
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(raw);
    }, `${name} does not parse`);
    sets.set(name, parsed);
  }
});

test('every planned set is present, including the two wired into a run', () => {
  assert.deepEqual(files, [
    'bash-shape.json',
    'clean-comment.json',
    'complexity-triage.json',
    'dispatch-route.json',
    'trim.json',
    'verify-regression.json',
    'verify-surface.json',
  ]);
});

test('every set matches the request shape the client and the judge verb consume', () => {
  for (const [name, set] of sets) {
    const stem = name.replace(/\.json$/, '');
    assert.equal(set.set, stem, `${name}: set field must match the filename stem`);
    assert.match(set.version, /^\d+\.\d+\.\d+$/, `${name}: version must be semver`);
    assert.ok(KINDS.has(set.kind), `${name}: kind must be noul or choice`);
    for (const field of ['title', 'description']) {
      assert.ok(prose(set[field]), `${name}: ${field} must be a non-empty string`);
    }

    // ADR 0008: nothing acts in this campaign.
    assert.equal(set.acts, false, `${name}: acts must be false`);
    assert.ok(Array.isArray(set.wiredInto), `${name}: wiredInto must be an array`);

    for (const field of ['sources', 'adrs']) {
      assert.ok(filled(set[field]), `${name}: ${field} must be a non-empty array`);
    }

    assert.ok(LABELS.has(set.eval?.labels), `${name}: eval.labels must be recoverable or none`);
    assert.ok(prose(set.eval.statement), `${name}: eval.statement must say where the numbers stand`);
    assert.ok(filled(set.state?.carries), `${name}: state.carries must be a non-empty array`);

    const entries = set.kind === 'noul' ? set.questions : set.options;
    assert.ok(filled(entries), `${name}: a ${set.kind} set needs its entries`);

    /** The fields each kind's entries must carry for the judge verb to build a request. */
    const required = set.kind === 'noul' ? ['id', 'noul', 'answerMeans'] : ['id', 'label', 'rubric', 'source'];
    const ids = new Set();
    for (const entry of entries) {
      for (const field of required) {
        assert.ok(prose(entry[field]), `${name}: entry ${entry.id} is missing ${field}`);
      }
      assert.ok(!ids.has(entry.id), `${name}: duplicate entry id ${entry.id}`);
      ids.add(entry.id);
    }

    if (set.kind === 'choice') {
      assert.ok(prose(set.question), `${name}: a choice set needs the question it is choosing over`);
      assert.ok(entries.length >= 2, `${name}: a choice set needs 2+ options`);
    }
  }
});

test('every cited source resolves to a real file, and a cited line really exists', () => {
  /** @type {string[]} */
  const citations = [];
  for (const set of sets.values()) {
    citations.push(...set.sources);
    for (const q of set.questions ?? []) if (q.source) citations.push(q.source);
    for (const o of set.options ?? []) if (o.source) citations.push(o.source);
    for (const g of set.excluded?.gates ?? []) if (g.source) citations.push(g.source);
    for (const k of set.preFilter?.keptWithoutBeingJudged ?? []) if (k.source) citations.push(k.source);
  }
  assert.ok(citations.length > 0, 'no citations found');

  for (const citation of citations) {
    const match = citation.match(/^(.*?):(\d+)$/);
    const path = match ? match[1] : citation;
    const absolute = join(repoRoot, path);
    assert.ok(existsSync(absolute), `cited path does not exist: ${path}`);
    if (match) {
      const lines = readFileSync(absolute, 'utf8').split('\n');
      const lineNo = Number(match[2]);
      assert.ok(lineNo <= lines.length, `${citation}: file has only ${lines.length} lines`);
      assert.ok(lines[lineNo - 1].trim().length > 0, `${citation}: cited line is blank`);
    }
  }
});

test('trim carries only the four residual gates, never the four deterministic ones', () => {
  const trim = sets.get('trim.json');
  const ids = trim.questions.map((/** @type {any} */ q) => q.id).sort();
  assert.deepEqual(ids, ['C1_MID_SEQUENCE', 'C2_RECOVERABLE', 'N1_NEGATIVE_EVIDENCE', 'N3_VERIFIED']);

  // ADR 0007: these four are a facts verb's job and must never reach the classifier.
  const excludedIds = trim.excluded.gates.map((/** @type {any} */ g) => g.id).sort();
  assert.deepEqual(excludedIds, ['C1_CLOSED', 'C3_PROGRESS', 'N1_STUCK', 'N2_LIVE']);
  const asked = new Set(ids);
  for (const id of excludedIds) assert.ok(!asked.has(id), `${id} is deterministic and must not be asked`);

  // The Speculative Fan-Out pattern: several nouls, one call.
  assert.equal(trim.batch, true, 'the four trim nouls go out in one call');
});

test('trim lifts its criteria verbatim from the rubric prose', () => {
  const trim = sets.get('trim.json');
  const rubric = readFileSync(join(repoRoot, 'src/commands/trim.md'), 'utf8').split('\n');
  const byId = new Map(trim.questions.map((/** @type {any} */ q) => [q.id, q]));

  const fragments = {
    C1_MID_SEQUENCE: 'mid-tool sequence',
    C2_RECOVERABLE: 'A replacement summary can preserve the original goal and acceptance criteria',
    N1_NEGATIVE_EVIDENCE: 'would hide useful negative evidence',
    N3_VERIFIED: 'has received the relevant verification',
  };

  for (const [id, fragment] of Object.entries(fragments)) {
    const question = byId.get(id);
    assert.ok(question.noul.includes(fragment), `${id}: noul does not carry the lifted fragment`);
    const lineNo = Number(question.source.split(':')[1]);
    assert.ok(rubric[lineNo - 1].includes(fragment), `${id}: cited line does not contain the fragment`);
  }
});

test('clean-comment is a three-option choice and excludes the four mandatory keeps', () => {
  const clean = sets.get('clean-comment.json');
  assert.deepEqual(
    clean.options.map((/** @type {any} */ o) => o.id),
    ['delete', 'tighten', 'keep'],
  );

  // ADR 0011: four questions the classifier cannot get wrong stay out of the set.
  const keeps = clean.preFilter.keptWithoutBeingJudged;
  assert.equal(keeps.length, 4, 'all four mandatory keeps must be recorded as pre-filtered');
  assert.match(clean.preFilter.statement, /ABSENT FROM THIS SET BY DESIGN/);
  assert.ok(clean.preFilter.corpusNote.length > 0, 'the corpus exclusion is the half that protects the metric');

  const optionIds = new Set(clean.options.map((/** @type {any} */ o) => o.id));
  for (const forbidden of ['license-header', 'linter-directive', 'jsx-section-header', 'empty-block', 'add']) {
    assert.ok(!optionIds.has(forbidden), `${forbidden} is pre-filtered and must not be an option`);
  }

  const prose = readFileSync(join(repoRoot, 'src/commands/clean.md'), 'utf8').split('\n');
  for (const option of clean.options) {
    const lineNo = Number(option.source.split(':')[1]);
    const line = prose[lineNo - 1];
    assert.ok(line.includes(`**${option.label}**`), `${option.id}: cited line does not state that verdict`);
  }
});

test('dispatch-route covers exactly the agent definitions on disk', () => {
  const route = sets.get('dispatch-route.json');
  const onDisk = readdirSync(join(repoRoot, 'agents'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.replace(/\.md$/, ''))
    .sort();
  assert.deepEqual(
    route.options.map((/** @type {any} */ o) => o.id).sort(),
    onDisk,
    'the closed set must be exactly the definitions in agents/',
  );
  assert.equal(route.closedSet, true);

  // Each rubric is that definition's own declared role, not a paraphrase.
  for (const option of route.options) {
    const frontmatter = readFileSync(join(repoRoot, 'agents', `${option.id}.md`), 'utf8');
    assert.ok(
      frontmatter.includes(option.rubric),
      `${option.id}: rubric is not lifted verbatim from its own definition`,
    );
  }
});

test('verify-regression judges provenance only, with both states already in hand', () => {
  const set = sets.get('verify-regression.json');
  assert.equal(set.questions.length, 1, 'a single noul');
  assert.deepEqual(set.questions[0].requires, ['branchLogTail', 'baselineLogTail']);
  assert.match(set.scope.statement, /wants a caching verb rather than a classifier/);
});

test('bash-shape records the measured blind spot', () => {
  const set = sets.get('bash-shape.json');
  assert.equal(set.blindSpot.bailOut, 'src/hooks/lib/bash-shapes.mjs:15');
  assert.equal(set.blindSpot.measured.callsMatchingUnjudgeable, 1054);
  assert.equal(set.blindSpot.measured.distinctSessionsContainingOne, 313);
  assert.equal(set.blindSpot.measured.recordedBashCalls, 12226);
  assert.equal(set.blindSpot.measured.shareOfRecordedBashCalls, '8.6%');

  // 1054 is a candidate count; the labelled count is the eval's first output.
  assert.match(set.eval.candidateCountNote, /CANDIDATE COUNT, NOT THE LABELLED COUNT/);

  // The UNJUDGEABLE bail-out is still where the set says it is.
  const hookLine = readFileSync(join(repoRoot, 'src/hooks/lib/bash-shapes.mjs'), 'utf8').split('\n')[14];
  assert.ok(hookLine.includes('UNJUDGEABLE'), 'the cited bail-out line no longer defines UNJUDGEABLE');
});

test('the three sets with no recoverable labels say so in the file', () => {
  for (const stem of NO_LABELS) {
    const set = sets.get(`${stem}.json`);
    assert.equal(set.eval.labels, 'none', `${stem}: must declare it has no labels`);
    assert.match(
      set.eval.statement,
      /THIS SET CARRIES NO EVAL NUMBERS/,
      `${stem}: must say outright that no number exists, so a reader does not hunt for one`,
    );
    assert.ok(set.eval.adr.includes('0012'), `${stem}: must cite the ADR that decided it`);
  }

  for (const stem of ['clean-comment', 'bash-shape', 'verify-surface', 'complexity-triage']) {
    assert.equal(sets.get(`${stem}.json`).eval.labels, 'recoverable', `${stem}: has a recoverable label`);
  }
});

test('the unwired sets say they are wired into nothing', () => {
  for (const stem of UNWIRED) {
    const set = sets.get(`${stem}.json`);
    assert.deepEqual(set.wiredInto, [], `${stem}: must be wired into nothing`);
    assert.match(set.wiredIntoNote, /wired into nothing/, `${stem}: must say so`);
  }
});

test('verify-surface asks one noul and leaves the glob in charge', () => {
  const set = sets.get('verify-surface.json');
  assert.equal(set.questions.length, 1, 'a single noul');
  assert.equal(set.questions[0].id, 'REACHES_SERVED_SURFACE');
  assert.deepEqual(set.questions[0].requires, ['changedFiles', 'routeGlobMatches']);

  // The whole claim of this set: the deterministic check still decides, and the answer is
  // recorded beside it. A set that stopped saying so would be a set that had been promoted.
  assert.match(set.scope.statement, /THE GLOB DECIDES AND KEEPS DECIDING/);
  assert.equal(set.acts, false);

  // Unlike the unwired sets, this one names where it is asked — and says what wiring means.
  assert.ok(filled(set.wiredInto), 'verify-surface is wired into /task Step 2.6');
  assert.match(set.wiredIntoNote, /asked and recorded, never consulted/);
});

test('verify-surface records that it sheds work, which is why it is promoted last', () => {
  const set = sets.get('verify-surface.json');

  // ADR 0019's rule, carried in the set itself rather than only in the ADR: a reader deciding
  // whether to promote this set reads the set.
  assert.match(set.loadShedding.statement, /Jev may add work; Jev may never skip work\./);
  assert.match(set.loadShedding.statement, /PROMOTED LAST/);
  assert.match(set.loadShedding.consequence, /never let a low answer withhold one the glob would have run/);
  assert.ok(set.loadShedding.adr.includes('0019'), 'must cite the ADR that fixed the rule');
  assert.ok(
    set.adrs.some((/** @type {string} */ adr) => adr.includes('0019')),
    'the ADR list must carry 0019 too',
  );
});

test('verify-surface labels rows with the verifier verdict, and drops the ambiguous ones', () => {
  const set = sets.get('verify-surface.json');

  // The label is the run's own recorded verdict — free, because the run records it anyway.
  assert.match(set.eval.statement, /THE LABEL IS THE VERIFIER'S OWN VERDICT/);
  assert.match(set.eval.statement, /shots record/);
  assert.match(set.eval.cost, /^FREE\./);
  assert.match(set.eval.whyThisLabel, /cleanest and the highest-volume label/);

  // Step 2.6 has two skip conditions and only the second is about surfaces, so a bare
  // `skipped` cannot label a row. Dropping beats scoring, per ADR 0011's precedent.
  assert.match(set.eval.confound.statement, /SKIPPED IS AMBIGUOUS/);
  assert.match(set.eval.confound.resolution, /DROPPED from the corpus rather than scored/);

  // And no bar covers it yet: ADR 0013 pre-registered Subject A and Subject B only.
  assert.match(set.eval.barNote, /NO PRE-REGISTERED BAR COVERS THIS SET/);
  assert.match(set.eval.corpusNote, /NO CORPUS EXISTS YET/);
});

test('verify-surface lifts its noul from the skip condition it sits beside', () => {
  const set = sets.get('verify-surface.json');
  const task = readFileSync(join(repoRoot, 'src/commands/task.md'), 'utf8').split('\n');
  const question = set.questions[0];

  // The clause is the prose half of the skip condition — the half no glob expresses.
  const fragment = 'nothing else in the diff reaches a served surface';
  assert.equal(question.clause, fragment);
  const lineNo = Number(question.source.split(':')[1]);
  assert.ok(task[lineNo - 1].includes(fragment), 'the cited line no longer carries the clause');

  // And the command still says, at that same site, that the answer is recorded and the glob
  // decides. If that sentence goes, this set is no longer describing what the run does.
  const step = task.slice(221, 231).join('\n');
  assert.match(step, /recorded beside what the glob decided/);
  assert.match(step, /The glob still\s+decides\./);

  // The confound's own citation points at the instruction that makes the drop decidable.
  const confoundLine = Number(set.eval.confound.source.split(':')[1]);
  assert.ok(
    task[confoundLine - 1].includes('record whichever fired'),
    'the confound resolution cites the line that requires recording which skip fired',
  );
});

test('complexity-triage asks one noul per changed file and shadows no deterministic check', () => {
  const set = sets.get('complexity-triage.json');
  assert.equal(set.questions.length, 1, 'one template question, expanded per file at call time');
  assert.equal(set.questions[0].id, 'NEEDS_REWORK');
  assert.equal(set.perChangedFile, true);
  assert.equal(set.questions[0].template, true);
  assert.match(set.perChangedFileNote, /TEMPLATE, NOT THE REQUEST/);
  assert.equal(set.acts, false);

  // Unlike verify-surface there is no glob here whose answer this shadows, because /task has
  // never run a pre-verify rework pass. Saying so is what stops a reader assuming a baseline.
  assert.match(set.scope.statement, /NOTHING SCHEDULES A REWORK PASS AND NOTHING WITHHOLDS ONE/);
  assert.match(set.scope.note, /shadows/);
  assert.ok(filled(set.wiredInto), 'complexity-triage is wired between /task Step 2.5 and Step 2.6');
  assert.match(set.wiredIntoNote, /asked and recorded, never consulted/);
});

test('complexity-triage records that it adds work, which is why it could be promoted first', () => {
  const set = sets.get('complexity-triage.json');

  // The same rule ADR 0019 fixed, applied in the opposite direction. A reader deciding whether
  // to promote this set reads the set, so the rule and its consequence live here too.
  assert.match(set.addingWork.statement, /Jev may add work; Jev may never skip work\./);
  assert.match(set.addingWork.statement, /PROMOTED SOONEST/);
  assert.match(set.addingWork.consequence, /blast radius of a wrong answer rather than by the quality of the label/);
  assert.ok(set.addingWork.adr.includes('0020'), 'must cite the ADR that fixed the ordering');
  assert.ok(set.addingWork.otherHalf.includes('0019'), 'must cite the ADR stating the other half');
  assert.ok(
    set.adrs.some((/** @type {string} */ adr) => adr.includes('0020')),
    'the ADR list must carry 0020 too',
  );
});

test('complexity-triage says outright that its labels are weaker and lagging than verify-surface’s', () => {
  const set = sets.get('complexity-triage.json');

  // The whole point of this block: a reader must not take a number from here as comparable
  // with one from verify-surface, whose label is a single value the run computes and writes.
  assert.equal(set.eval.labels, 'recoverable');
  assert.match(set.eval.statement, /WEAKER AND LAGGING COMPARED WITH verify-surface's/);
  assert.match(set.eval.statement, /every one of them is partial/);
  assert.match(set.eval.whyThisLabel, /do not compare a number from this set with a number from verify-surface/);

  // All four signals are named, because "weaker" without the list is not a warning a reader
  // can act on. Each is recoverable from the branch and none is a clean ground truth.
  for (const signal of [/Step 2\.6 went red/, /lint fired/, /later commit in the same run/, /\/review flagged/]) {
    assert.match(set.eval.statement, signal, `a labelling signal is missing from the eval block`);
  }

  // And every one of them lands after the question was asked, which is the other half.
  assert.match(set.eval.statement, /arriving after the question was asked|AFTER the question was asked/);
  assert.match(set.eval.lagging, /EVERY SIGNAL IS AFTER THE FACT/);
  assert.match(set.eval.cost, /^NOT FREE\./, 'unlike verify-surface, labelling this set costs a pass over the branch');

  assert.match(set.eval.confound.resolution, /DROPPED rather than scored/);
  assert.match(set.eval.barNote, /NO PRE-REGISTERED BAR COVERS THIS SET/);
  assert.match(set.eval.corpusNote, /NO CORPUS EXISTS YET/);
});

test('complexity-triage lifts its noul from the section it sits in', () => {
  const set = sets.get('complexity-triage.json');
  const task = readFileSync(join(repoRoot, 'src/commands/task.md'), 'utf8').split('\n');
  const question = set.questions[0];

  const fragment = 'warrant a rework pass before it is verified';
  assert.equal(question.clause, fragment);
  assert.ok(question.noul.includes(fragment), 'the noul does not carry the lifted fragment');
  const lineNo = Number(question.source.split(':')[1]);
  assert.ok(task[lineNo - 1].includes(fragment), 'the cited line no longer carries the clause');

  // And the command still says, at that same site, that nothing reads the answers back. If
  // that sentence goes, this set is no longer describing what the run does.
  const section = task.slice(180, 201).join('\n');
  assert.match(section, /one `noul` per changed file/);
  assert.match(section, /nothing reads the answers back/);
  assert.match(section, /No rework pass\s+is scheduled and none is withheld\./);

  // The confound's own citation points at the instruction that makes the drop decidable, the
  // way verify-surface's does. Without this the citation is both wrong and unguarded, which is
  // exactly how the first version of this file shipped.
  const confoundLine = Number(set.eval.confound.source.split(':')[1]);
  assert.ok(
    task[confoundLine - 1].includes('dropped rather than scored'),
    'the confound resolution must cite the line that states the drop',
  );

  // And the per-run bound is stated in the command as well as in the module, since a reader
  // deciding what one --jev run sends reads the command.
  assert.match(section, /bounded number of files per run/);
  assert.match(set.requestBound.statement, /THE EXPANSION IS CAPPED PER RUN/);
  assert.ok(set.requestBound.adr.includes('0016'), 'must cite the ADR that measured the refusal');
});

test('no set carries a credential', () => {
  for (const name of files) {
    const raw = readFileSync(join(judgeDir, name), 'utf8');
    assert.doesNotMatch(raw, /\b(sk|gh[pousr])[-_][A-Za-z0-9]{16,}\b/, `${name}: looks like it carries a token`);
    assert.doesNotMatch(raw, /"(api_?key|secret|token|password)"\s*:/i, `${name}: carries a credential field`);
    assert.doesNotMatch(raw, /TYPESAFE_API_KEY\s*[=:]\s*\S/, `${name}: carries a key value`);
  }
});
