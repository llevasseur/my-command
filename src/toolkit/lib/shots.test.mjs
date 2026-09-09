// The screenshot pipeline's decisions, proven without a network or a GitHub remote:
// which diffs count as frontend, which filenames pair into a before/after row, and what
// the rendered section looks like. The publish itself is git plumbing over a real remote
// and is covered by the `pr` verb's own tests.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { collectShots, groupShots, isFrontendPath, renderShots, sideOf, touchesFrontend } from './shots.mjs';

/** @type {string[]} */
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** @returns {string} */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'mct-shots-test-'));
  made.push(dir);
  return dir;
}

test('markup and stylesheets are frontend wherever they sit', () => {
  for (const path of ['src/App.tsx', 'lib/Card.vue', 'a/b/theme.scss', 'index.html', 'x/y/z.svelte']) {
    assert.equal(isFrontendPath(path), true, path);
  }
});

test('a script file is frontend only under a directory that serves a UI', () => {
  assert.equal(isFrontendPath('src/components/Button.ts'), true);
  assert.equal(isFrontendPath('app/routes/home/loader.ts'), true);
  assert.equal(isFrontendPath('src/toolkit/verbs/pr.mjs'), false);
  assert.equal(isFrontendPath('scripts/build.js'), false);
});

test('a diff of markdown and CLI verbs touches no frontend', () => {
  assert.equal(touchesFrontend(['src/commands/pr.md', 'src/toolkit/lib/shots.mjs', 'CHANGELOG.md']), false);
  assert.equal(touchesFrontend(['README.md', 'web/pages/index.tsx']), true);
});

test('a before/after marker resolves to a view whichever end of the stem it is on', () => {
  assert.deepEqual(sideOf('home-before.png'), { view: 'home', side: 'before' });
  assert.deepEqual(sideOf('after_home.png'), { view: 'home', side: 'after' });
  assert.deepEqual(sideOf('round-2/settings.after.png'), { view: 'round-2/settings', side: 'after' });
  assert.equal(sideOf('settings-round-3.png'), null);
});

test('grouping keeps a one-sided view as a row rather than dropping it into the grid', () => {
  const groups = groupShots(['home-after.png', 'home-before.png', 'settings-before.png', 'nav-round-1.png']);
  assert.deepEqual(groups.pairs, [
    { view: 'home', before: 'home-before.png', after: 'home-after.png' },
    { view: 'settings', before: 'settings-before.png', after: null },
  ]);
  assert.deepEqual(groups.grid, ['nav-round-1.png']);
});

test('a re-captured side never displaces the first one', () => {
  const groups = groupShots(['home-before.png', 'home-before-2.png']);
  assert.deepEqual(groups.pairs, [{ view: 'home', before: 'home-before.png', after: null }]);
});

test('a comparison renders as one table row per view, before column then after', () => {
  const section = renderShots(groupShots(['home-before.png', 'home-after.png']), (n) => `https://host/${n}`);
  const rows = section.split('\n');
  assert.equal(rows[0], '## Screenshots');
  assert.equal(rows[2], '| View | Before | After |');
  assert.match(rows[4], /^\| home \| <img src="https:\/\/host\/home-before\.png"/);
  assert.match(rows[4], /<img src="https:\/\/host\/home-after\.png" width="\d+" alt="home-after\.png"> \|$/);
});

test('a missing side says so rather than rendering an empty cell', () => {
  const section = renderShots(groupShots(['home-before.png']), (n) => `https://host/${n}`);
  assert.match(section, /\| home \| <img [^|]+\| not captured \|/);
});

test('unpaired shots render as a grid, padded to the column count', () => {
  const section = renderShots(groupShots(['a.png', 'b.png', 'c.png']), (n) => `https://host/${n}`);
  const rows = section.split('\n').filter((l) => l.startsWith('|'));
  assert.equal(rows[0], '| | |');
  assert.equal(rows[1], '| --- | --- |');
  assert.match(rows[2], /a\.png".+b\.png"/);
  assert.match(rows[3], /c\.png".+\|\s+\|$/);
});

test('a comparison and a grid appear in that order in one section', () => {
  const section = renderShots(groupShots(['home-before.png', 'home-after.png', 'nav.png']), (n) => `u/${n}`);
  assert.equal(section.indexOf('## Screenshots'), 0);
  assert.ok(section.indexOf('| View | Before | After |') < section.indexOf('nav.png'));
});

test('nothing to show renders no section at all', () => {
  assert.equal(
    renderShots(groupShots([]), (n) => n),
    '',
  );
});

test('collecting a shots directory finds nested images and ignores everything else', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'round-2'));
  writeFileSync(join(dir, 'home.png'), 'pixels');
  writeFileSync(join(dir, 'trace.zip'), 'not an image');
  writeFileSync(join(dir, 'round-2', 'settings.PNG'), 'pixels');
  assert.deepEqual(collectShots(dir), ['home.png', 'round-2/settings.PNG']);
  assert.deepEqual(collectShots(join(dir, 'absent')), []);
});
