// The pre-filter's whole value is that it cannot be talked out of a keep, so each of the four
// mandatory keeps is asserted here against the shape it actually appears in — and against the
// near-miss that must still reach the classifier, because a rule that keeps everything removes
// the questions the eval exists to measure.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isMandatoryKeep, partitionComments, RULES, scanComments } from './clean-prefilter.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

/** @param {string} source @returns {string[]} */
function keptRules(source) {
  return partitionComments(source).kept.map((k) => k.rule);
}

/** @param {string} source @returns {string[]} */
function judgeableText(source) {
  return partitionComments(source).judgeable.map((c) => c.text);
}

test('keep 1 — a license header is kept without being judged', () => {
  const source = `/*
 * Copyright (c) 2026 Example Corp. All rights reserved.
 * Licensed under the MIT License.
 */
export const x = 1;
`;
  assert.deepEqual(keptRules(source), ['license-header']);
  assert.deepEqual(judgeableText(source), []);
});

test('keep 1 — a copyright mentioned deep in a file is not a header and stays judgeable', () => {
  // The rule is positional as well as textual: prose further down that happens to say
  // "copyright" is an ordinary comment and the classifier should be asked about it.
  const source = [
    'const a = 1;',
    'const b = 2;',
    'const c = 3;',
    'const d = 4;',
    'const e = 5;',
    '',
    '// Copyright law is why this vendored blob stays.',
    'const f = 6;',
  ].join('\n');
  assert.deepEqual(keptRules(source), []);
  assert.equal(judgeableText(source).length, 1);
});

test('keep 2 — linter directives and JSDoc annotation tags are kept without being judged', () => {
  const source = `// biome-ignore lint/suspicious/noExplicitAny: the wire type is genuinely unknown here.
const a = 1;
// eslint-disable-next-line no-console
console.log(a);
/**
 * @param {string} name
 * @returns {string}
 */
function greet(name) {
  return name;
}
`;
  assert.deepEqual(keptRules(source), ['linter-directive', 'linter-directive', 'linter-directive']);
  assert.deepEqual(judgeableText(source), []);
});

test('keep 2 — a doc block with no annotation tag is prose and still reaches the classifier', () => {
  // `/**` alone does not earn the keep. Ceremony written as a doc block is exactly what /clean
  // is being measured on, so it must not be filtered out from under the eval.
  const source = `/** This function greets the user. */
function greet(name) {
  return name;
}
`;
  assert.deepEqual(keptRules(source), []);
  assert.deepEqual(judgeableText(source), ['/** This function greets the user. */']);
});

test('keep 2 — prose merely mentioning a directive is not a directive', () => {
  const source = '// We used to reach for eslint-disable here, and it hid a real bug.\nconst a = 1;\n';
  assert.deepEqual(keptRules(source), []);
});

test('keep 3 — a JSX structural section header is kept without being judged', () => {
  const source = `export function Page() {
  return (
    <main>
      {/* Header */}
      <Header />
      {/* Sidebar */}
      <Sidebar />
    </main>
  );
}
`;
  assert.deepEqual(keptRules(source), ['jsx-section-header', 'jsx-section-header']);
  assert.deepEqual(judgeableText(source), []);
});

test('keep 3 — the same words outside JSX are an ordinary section banner', () => {
  // JSX earns this keep because it has no other lightweight way to label a region. A bare
  // `/* Header */` in plain code is the ceremony /clean deletes, so it must stay judgeable.
  const source = '/* Header */\nconst header = 1;\n';
  assert.deepEqual(keptRules(source), []);
  assert.deepEqual(judgeableText(source), ['/* Header */']);
});

test('keep 3 — a JSX comment carrying a sentence is prose, not a section label', () => {
  const source = `<main>
  {/* This panel is rendered twice because the mobile layout needs its own copy. */}
  <Panel />
</main>
`;
  assert.deepEqual(keptRules(source), []);
  assert.equal(judgeableText(source).length, 1);
});

test('keep 4 — the sole comment inside an intentionally empty block is kept', () => {
  const source = `try {
  risky();
} catch {
  // Nothing to do — the caller polls for this anyway.
}
`;
  assert.deepEqual(keptRules(source), ['empty-block-sole-comment']);
  assert.deepEqual(judgeableText(source), []);
});

test('keep 4 — the same comment in a block with code in it is judgeable', () => {
  // The keep is load-bearing only when the comment is what stops the block being empty.
  // Biome's noEmptyBlockStatements has nothing to say about a block that already has a
  // statement, so this comment is an ordinary one.
  const source = `try {
  risky();
} catch {
  // Nothing to do — the caller polls for this anyway.
  report();
}
`;
  assert.deepEqual(keptRules(source), []);
  assert.equal(judgeableText(source).length, 1);
});

test('keep 4 — an empty else block counts too', () => {
  const source = 'if (a) {\n  go();\n} else {\n  // Deliberately nothing.\n}\n';
  assert.deepEqual(keptRules(source), ['empty-block-sole-comment']);
});

test('a comment inside a string literal is not a comment', () => {
  const source = `const url = 'https://example.com/path';\nconst re = /a\\/\\/b/;\nconst t = \`no // comment \${x} here\`;\n// A real one.\n`;
  const found = scanComments(source);
  assert.deepEqual(
    found.map((c) => c.text),
    ['// A real one.'],
  );
});

test('an ordinary narrating comment is judgeable — the pre-filter keeps the eval honest', () => {
  // If this were filtered the corpus would lose the cases the classifier is actually asked
  // about, which is the failure ADR 0011 is guarding against from the other direction.
  const source = '// Now we loop over the items.\nfor (const i of items) use(i);\n';
  const { kept, judgeable } = partitionComments(source);
  assert.deepEqual(kept, []);
  assert.equal(judgeable.length, 1);
  assert.equal(isMandatoryKeep(judgeable[0], source.split('\n')), false);
});

test('the rule list agrees with the question set ticket 03 landed', () => {
  // Two files state the same rules — ADR 0011 names that as this decision's cost — so the
  // agreement is asserted rather than trusted.
  const set = JSON.parse(readFileSync(join(repoRoot, 'src/toolkit/judge/clean-comment.json'), 'utf8'));
  const entries = set.preFilter.keptWithoutBeingJudged;
  assert.ok(Array.isArray(entries) && entries.length > 0, 'the set states no pre-filter entries');

  // Every source line the set cites for a *comment* keep is covered by a rule here. The set's
  // fourth entry is clean.md:68, "never add a new comment" — a ban on an option rather than a
  // comment that gets kept, so it has no pre-filter rule and must not gain one.
  const ruleSources = new Set(RULES.map((r) => r.source));
  const neverAdd = entries.filter((e) => e.source === 'src/commands/clean.md:68');
  assert.equal(neverAdd.length, 1, 'the never-add entry moved; re-check what the pre-filter owns');

  for (const entry of entries) {
    if (entry.source === 'src/commands/clean.md:68') continue;
    assert.ok(ruleSources.has(entry.source), `no pre-filter rule covers ${entry.source}`);
  }

  // And nothing here claims a rule the set does not state.
  const setSources = new Set(entries.map((/** @type {{source: string}} */ e) => e.source));
  for (const rule of RULES) {
    assert.ok(setSources.has(rule.source), `rule ${rule.id} cites ${rule.source}, which the set does not state`);
  }
});

test('every rule id is distinct and reachable', () => {
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
});
