// The corpus is recovered from real git history, so it is tested against a real throwaway
// repository with a real /clean commit in it rather than against a fixture of diff text.
//
// The assertion this file exists for is the exclusion one: a comment the pre-filter would have
// kept must be ABSENT from the corpus, not present carrying a Keep label. ADR 0011 makes that
// the half that protects the campaign's one metric, and it is also the half that would pass
// unnoticed if it silently stopped working — the rows would still look right.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildCorpus, findCleanCommits, isCleanSubject, majorityClassBaseline } from './clean-corpus.mjs';
import { run } from './proc.mjs';

/** @type {string[]} */
const made = [];

/** @returns {string} */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'mct-clean-corpus-'));
  made.push(dir);
  git(dir, ['init', '--initial-branch=main']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}

/** @param {string} cwd @param {string[]} args @returns {import('./proc.mjs').RunResult} */
function git(cwd, args) {
  return run('git', args, { cwd });
}

/** @param {string} cwd @param {string} message */
function commit(cwd, message) {
  git(cwd, ['add', '-A']);
  const r = git(cwd, ['commit', '-m', message]);
  assert.ok(r.ok, `commit failed: ${r.stderr}`);
}

process.on('exit', () => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

// The file as the branch left it, before /clean ran. Four comments here are mandatory keeps and
// four are genuine questions.
const BEFORE = `/*
 * Copyright (c) 2026 Example Corp. All rights reserved.
 */
// biome-ignore lint/suspicious/noExplicitAny: the wire shape is genuinely unknown.
import { load } from './load.mjs';

/**
 * @param {string} id
 * @returns {number}
 */
export function total(id) {
  // Now we loop over every row and add it up.
  let sum = 0;
  // The upstream feed pads short ids with spaces, which breaks the lookup unless we trim,
  // and this has bitten us twice already in production.
  const rows = load(id.trim());
  for (const row of rows) sum += row.n;
  // Return the sum.
  return sum;
}

export function safe(id) {
  try {
    return total(id);
  } catch {
    // Nothing to do — the caller already reports this.
  }
  return 0;
}
`;

// The same file after a /clean pass: one narrating comment deleted, one verbose comment
// tightened, one non-obvious comment kept, one ceremony comment deleted — and every mandatory
// keep left exactly as it was.
const AFTER = `/*
 * Copyright (c) 2026 Example Corp. All rights reserved.
 */
// biome-ignore lint/suspicious/noExplicitAny: the wire shape is genuinely unknown.
import { load } from './load.mjs';

/**
 * @param {string} id
 * @returns {number}
 */
export function total(id) {
  let sum = 0;
  // The upstream feed pads short ids with spaces, which breaks the lookup.
  const rows = load(id.trim());
  for (const row of rows) sum += row.n;
  return sum;
}

export function safe(id) {
  try {
    return total(id);
  } catch {
    // Nothing to do — the caller already reports this.
  }
  return 0;
}
`;

/** @returns {import('./clean-corpus.mjs').Corpus} */
function corpusFromCleanPass() {
  const dir = repo();
  writeFileSync(join(dir, 'total.mjs'), BEFORE);
  commit(dir, 'feat: add the total helper');
  writeFileSync(join(dir, 'total.mjs'), AFTER);
  commit(dir, "chore: clean the helper's comments");
  return buildCorpus(dir);
}

test('a /clean commit is recognised from its subject, and ordinary commits are not', () => {
  assert.equal(isCleanSubject("chore: clean the refactor's comments"), true);
  assert.equal(isCleanSubject('chore: clean comments on the four-fix branch'), true);
  assert.equal(isCleanSubject('chore: clean the opencode commands step comments'), true);
  assert.equal(isCleanSubject('feat(pr): embed a branch Playwright screenshots'), false);
  assert.equal(isCleanSubject('fix: clean up the temp directory on exit'), false);
});

test('only /clean commits are walked', () => {
  const dir = repo();
  writeFileSync(join(dir, 'a.mjs'), '// One.\nconst a = 1;\n');
  commit(dir, 'feat: add a');
  writeFileSync(join(dir, 'a.mjs'), '// One.\nconst a = 2;\n');
  commit(dir, 'fix: bump a');
  writeFileSync(join(dir, 'a.mjs'), 'const a = 2;\n');
  commit(dir, "chore: clean a's comments");

  const found = findCleanCommits(dir);
  assert.equal(found.length, 1);
  assert.match(found[0].subject, /clean a's comments/);
});

test('the recorded outcome is recovered for each label /clean can record', () => {
  const corpus = corpusFromCleanPass();
  const byText = new Map(corpus.entries.map((e) => [e.comment.trim(), e]));

  const narrating = byText.get('// Now we loop over every row and add it up.');
  assert.ok(narrating, 'the narrating comment was not recovered');
  assert.equal(narrating.label, 'delete');

  const ceremony = byText.get('// Return the sum.');
  assert.ok(ceremony, 'the ceremony comment was not recovered');
  assert.equal(ceremony.label, 'delete');

  const verbose = [...byText.values()].find((e) => e.comment.includes('pads short ids'));
  assert.ok(verbose, 'the verbose comment was not recovered');
  assert.equal(verbose.label, 'tighten');
  assert.match(String(verbose.rewrittenTo), /breaks the lookup\./);
});

test('a pre-filtered comment is ABSENT from the corpus rather than present with a label', () => {
  // The assertion ADR 0011 turns on. Scoring these would hand the classifier questions it
  // cannot get wrong and inflate agreement with cases the runtime path never asks about, so
  // "absent" is the requirement — a Keep row for any of them is the failure.
  const corpus = corpusFromCleanPass();
  const texts = corpus.entries.map((e) => e.comment);

  for (const excluded of ['Copyright (c) 2026', 'biome-ignore', '@param', '@returns']) {
    assert.equal(
      texts.some((t) => t.includes(excluded)),
      false,
      `${excluded} reached the corpus; the pre-filter is not being applied to it`,
    );
  }

  // The empty-block comment survived the pass untouched, so without the pre-filter it would be
  // sitting here as a free Keep.
  assert.equal(
    texts.some((t) => t.includes('the caller already reports this')),
    false,
    'the sole comment in an empty block was scored instead of excluded',
  );

  // And they were removed by rule rather than simply missed.
  assert.ok(corpus.preFiltered.total >= 4, `expected at least 4 pre-filtered, saw ${corpus.preFiltered.total}`);
  for (const rule of ['license-header', 'linter-directive', 'empty-block-sole-comment']) {
    assert.ok((corpus.preFiltered.byRule[rule] ?? 0) > 0, `no comment was excluded by ${rule}`);
  }
});

test('every surviving entry carries the comment, the surrounding diff, and the outcome', () => {
  const corpus = corpusFromCleanPass();
  assert.ok(corpus.size > 0, 'the corpus is empty');
  for (const entry of corpus.entries) {
    assert.ok(entry.comment.length > 0, 'an entry carries no comment');
    assert.ok(['delete', 'tighten', 'keep'].includes(entry.label), `bad label ${entry.label}`);
    assert.ok(entry.surroundingDiff.includes('total.mjs'), 'an entry carries no surrounding diff');
    assert.ok(entry.codeContext.length > 0, 'an entry carries no code context');
    assert.equal(entry.file, 'total.mjs');
  }
});

test('the majority-class baseline is the share held by the largest label', () => {
  assert.deepEqual(majorityClassBaseline({ keep: 8, delete: 2 }, 10), { label: 'keep', share: 0.8 });
  assert.deepEqual(majorityClassBaseline({}, 0), { label: 'none', share: 0 });
});

test('a corpus run reports its size and baseline', () => {
  const corpus = corpusFromCleanPass();
  assert.equal(corpus.size, corpus.entries.length);
  assert.equal(
    Object.values(corpus.counts).reduce((a, b) => a + b, 0),
    corpus.size,
  );
  assert.ok(corpus.baseline.share > 0 && corpus.baseline.share <= 1);
});

test('the extractor writes nothing into the repository it reads', () => {
  const dir = repo();
  writeFileSync(join(dir, 'a.mjs'), '// One.\nconst a = 1;\n');
  commit(dir, 'feat: add a');
  writeFileSync(join(dir, 'a.mjs'), 'const a = 1;\n');
  commit(dir, "chore: clean a's comments");

  buildCorpus(dir);
  const status = git(dir, ['status', '--porcelain']);
  assert.equal(status.stdout, '', 'the extractor left changes behind');
});
