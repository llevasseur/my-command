// The changelog gate reads the newest two dated sections and fails a bullet over 80 words.
// It runs under `pnpm test`, which is what `my-command-tools verify` discovers, so a bloated
// entry fails the branch before /pr rather than being noticed in review.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bullets, MAX_WORDS, SECTIONS_CHECKED } from './check-changelog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

const sample = [
  '# Changelog',
  '',
  '## 2026-09-14',
  '',
  '### Changed',
  '',
  `- **Short.** ${words(10)}`,
  `- **Wrapped.** ${words(30)}`,
  `  ${words(30)}`,
  '',
  '## 2026-09-11',
  '',
  '### Added',
  '',
  `- **Long.** ${words(100)}`,
  '',
  '## 2026-09-10',
  '',
  `- **Ancient.** ${words(500)}`,
  '',
].join('\n');

test('reads bullets from the newest two dated sections only', () => {
  const found = bullets(sample);
  assert.deepEqual(
    found.map((b) => [b.section, b.line]),
    [
      ['2026-09-14', 7],
      ['2026-09-14', 8],
      ['2026-09-11', 15],
    ],
  );
  assert.equal(SECTIONS_CHECKED, 2);
});

test('a wrapped bullet is counted whole, and a sub-bullet counts against its parent', () => {
  const [, wrapped] = bullets(sample);
  assert.equal(wrapped.words, 61);

  const nested = ['## 2026-09-14', '', `- **Parent.** ${words(5)}`, `  - ${words(5)}`, ''].join('\n');
  const [parent] = bullets(nested);
  assert.equal(parent.words, 12);
});

test('the limit is 80 words and the sample over it is the one reported', () => {
  assert.equal(MAX_WORDS, 80);
  const over = bullets(sample).filter((b) => b.words > MAX_WORDS);
  assert.deepEqual(
    over.map((b) => b.section),
    ['2026-09-11'],
  );
});

test("the repo's own CHANGELOG.md passes the gate", () => {
  const text = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  const over = bullets(text).filter((b) => b.words > MAX_WORDS);
  assert.deepEqual(
    over.map((b) => `line ${b.line}: ${b.words} words`),
    [],
    'a bullet in the newest two dated sections is over the limit; cut it (src/shared/changelog-entry-shape.md)',
  );

  const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'check-changelog.mjs')], { encoding: 'utf8' });
  assert.match(out, /^check-changelog: \d+ bullet\(s\)/m);
});
