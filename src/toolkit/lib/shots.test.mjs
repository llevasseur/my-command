// The screenshot pipeline's decisions, proven without a network or a GitHub remote:
// which diffs count as frontend, which filenames pair into a before/after row, and what
// the rendered section looks like. The publish itself is git plumbing over a real remote
// and is covered by the `pr` verb's own tests.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import {
  collectShots,
  commentId,
  groupShots,
  isBrowserTier,
  keepBranchDirs,
  pruneKeep,
  readVerdict,
  renderShots,
  sideOf,
  verifyRendered,
  writeVerdict,
} from './shots.mjs';

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

/**
 * The section for `names`, each described unless `notes` says otherwise.
 * @param {string[]} names @param {(name: string) => string} url
 * @param {{notes?: import('./shots.mjs').ShotNote[], gaps?: string[]}} [extra]
 */
function render(names, url, extra = {}) {
  const notes =
    extra.notes ?? names.map((name) => ({ name, label: `Label for ${name}`, description: `Proves ${name}.` }));
  return renderShots({ groups: groupShots(names), url, notes, gaps: extra.gaps ?? [], caption: 'Captured.' });
}

test('a comparison renders as one table row per view, before column then after', () => {
  const section = render(['home-before.png', 'home-after.png'], (n) => `https://host/${n}`);
  const rows = section.split('\n');
  assert.equal(rows[0], '## Screenshots');
  assert.equal(rows[2], 'Captured.');
  assert.equal(rows[4], '| View | Before | After |');
  assert.match(
    rows[6],
    /^\| home \| \*\*Label for home-before\.png\*\*<br>!\[home-before\.png\]\(https:\/\/host\/home-before\.png\)<br>Proves home-before\.png\. \| \*\*Label for home-after\.png\*\*<br>!\[home-after\.png\]\(https:\/\/host\/home-after\.png\)<br>Proves home-after\.png\. \|$/,
  );
});

test('a missing side says so rather than rendering an empty cell', () => {
  const section = render(['home-before.png'], (n) => `https://host/${n}`);
  assert.match(section, /\| home \| \*\*[^|]+\| not captured \|/);
});

test('unpaired shots render as a grid, padded to the column count', () => {
  const section = render(['a.png', 'b.png', 'c.png'], (n) => `https://host/${n}`);
  const rows = section.split('\n').filter((l) => l.startsWith('|'));
  assert.equal(rows[0], '| | |');
  assert.equal(rows[1], '| --- | --- |');
  assert.match(rows[2], /a\.png\).+b\.png\)/);
  assert.match(rows[3], /c\.png\).+\|\s+\|$/);
});

test('a lone shot still sits in a table, one column wide', () => {
  const rows = render(['only.png'], (n) => n)
    .split('\n')
    .filter((l) => l.startsWith('|'));
  assert.deepEqual(rows, ['| |', '| --- |', '| **Label for only.png**<br>![only.png](only.png)<br>Proves only.png. |']);
});

test('a comparison and a grid appear in that order, and the gaps close the section', () => {
  const section = render(['home-before.png', 'home-after.png', 'nav.png'], (n) => `u/${n}`, {
    gaps: ['Mobile widths were not captured.', 'The empty state — no orders — was not reached.'],
  });
  assert.equal(section.indexOf('## Screenshots'), 0);
  assert.ok(section.indexOf('| View | Before | After |') < section.indexOf('nav.png'));
  assert.match(
    section,
    /\n### What these shots do not prove\n\n- Mobile widths were not captured\.\n- The empty state, no orders, was not reached\.\n$/,
  );
});

test('an undescribed shot is labelled as such rather than given a filename or a made-up claim', () => {
  const section = render(['nav.png'], (n) => n, { notes: [] });
  assert.match(
    section,
    /\| \*\*Unlabelled screenshot\*\*<br>!\[nav\.png\]\(nav\.png\)<br>The verifier left no read-back for this image, so it proves nothing on its own\. \|/,
  );
  assert.match(section, /- The verifier recorded no gaps\. That means none were written down, not that none exist\./);
});

test('nothing to show renders no section at all', () => {
  assert.equal(
    render([], (n) => n),
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

test('only the browser tier counts as having taken a screenshot', () => {
  assert.equal(isBrowserTier('playwright'), true);
  assert.equal(isBrowserTier('http'), false);
  assert.equal(isBrowserTier('static'), false);
  assert.equal(isBrowserTier('anything else'), false);
});

test('a recorded verdict round-trips out of the shots directory', () => {
  const dir = scratch();
  const written = writeVerdict(dir, { tier: 'playwright', verdict: 'red', rounds: 3 });
  assert.equal(written, join(dir, '.my-command', 'shots', 'verdict.json'));
  const read = readVerdict(dir, 'feat/x');
  assert.equal(read?.tier, 'playwright');
  assert.equal(read?.verdict, 'red');
  assert.equal(read?.rounds, 3);
});

test('a branch with no record reads as none rather than throwing', () => {
  assert.equal(readVerdict(scratch(), 'feat/never-verified'), null);
});

test('a mangled record is skipped rather than read as a verdict', () => {
  const dir = scratch();
  const shots = join(dir, '.my-command', 'shots');
  mkdirSync(shots, { recursive: true });
  writeFileSync(join(shots, 'verdict.json'), '{ not json');
  assert.equal(readVerdict(dir, 'feat/x'), null);
});

test('a record naming a tier this repo does not know is not a verdict', () => {
  const dir = scratch();
  const shots = join(dir, '.my-command', 'shots');
  mkdirSync(shots, { recursive: true });
  writeFileSync(join(shots, 'verdict.json'), JSON.stringify({ tier: 'browser', verdict: 'green' }));
  assert.equal(readVerdict(dir, 'feat/x'), null);
});

/**
 * A comment body as GitHub holds it, built through the same renderer that wrote the one
 * `gh` was handed — so a test says what each reference points at and nothing else.
 * @param {Record<string, string>} hrefs @returns {string}
 */
function postedBody(hrefs) {
  return render(Object.keys(hrefs), (name) => hrefs[name]);
}

test('references gh rewrote count as rendered once each URL serves bytes', () => {
  const body = postedBody({
    'home-before.png': 'https://github.com/user-attachments/assets/aaa',
    'home-after.png': 'https://github.com/user-attachments/assets/bbb',
  });
  /** @type {string[]} */
  const asked = [];
  const report = verifyRendered(body, ['home-before.png', 'home-after.png'], (url) => {
    asked.push(url);
    return { ok: true, status: 200, bytes: 12_345 };
  });
  assert.equal(report.count, 2);
  assert.equal(report.rendered, 2);
  assert.equal(report.failed, 0);
  assert.equal(report.warning, undefined);
  assert.deepEqual(asked, [
    'https://github.com/user-attachments/assets/aaa',
    'https://github.com/user-attachments/assets/bbb',
  ]);
});

test('a reference gh left pointing at disk fails without a request being made', () => {
  // What a path mismatch produces: the body keeps the local path and the images are
  // appended under alt text of gh's own choosing.
  const body = `${postedBody({ 'home-after.png': '/tmp/mct-shots-comment-x/home-after.png' })}
![image](https://github.com/user-attachments/assets/aaa)
`;
  let asked = 0;
  const report = verifyRendered(body, ['home-after.png'], () => {
    asked += 1;
    return { ok: true, status: 200, bytes: 12_345 };
  });
  assert.equal(asked, 0);
  assert.equal(report.rendered, 0);
  assert.equal(report.failed, 1);
  assert.match(String(report.warning), /1 of 1 screenshot\(s\) do not render/);
  assert.match(String(report.warning), /home-after\.png.+matched no --attach path/);
});

test('a local path left under a name nobody attached is reported once', () => {
  const body = postedBody({
    'home.png': 'https://github.com/user-attachments/assets/aaa',
    'nav.png': '/tmp/mct-shots-comment-x/nav.png',
  });
  const report = verifyRendered(body, ['home.png'], () => ({ ok: true, status: 200, bytes: 99 }));
  assert.equal(report.rendered, 1);
  assert.equal(report.failed, 0);
  assert.match(String(report.warning), /1 local path\(s\) still in the comment body/);
});

test('an attachment URL that does not resolve is a failure rather than a rendered image', () => {
  const body = postedBody({ 'home.png': 'https://github.com/user-attachments/assets/ccc' });
  const report = verifyRendered(body, ['home.png'], () => ({ ok: false, status: 404, why: 'answered HTTP 404' }));
  assert.equal(report.rendered, 0);
  assert.equal(report.failed, 1);
  assert.equal(report.images[0].status, 404);
  assert.match(String(report.warning), /home\.png: answered HTTP 404/);
});

test('an attachment that answers 2xx with no bytes does not count as rendered', () => {
  const body = postedBody({ 'home.png': 'https://github.com/user-attachments/assets/ddd' });
  const report = verifyRendered(body, ['home.png'], () => ({ ok: true, status: 200, bytes: 0 }));
  assert.equal(report.failed, 1);
  assert.match(String(report.warning), /served no image bytes/);
});

test('an attached file with no reference at all is a failure', () => {
  const report = verifyRendered('## Screenshots\n\nnothing here\n', ['home.png'], () => {
    throw new Error('nothing to request');
  });
  assert.equal(report.failed, 1);
  assert.match(String(report.warning), /no image reference in the posted comment/);
});

test('a comment URL names the comment the body is read back from', () => {
  assert.equal(commentId('https://github.com/o/r/pull/7#issuecomment-3421'), 3421);
  assert.equal(commentId('https://github.com/o/r/pull/7'), null);
});

/**
 * Two verdict files in one shots directory, as a branch verified twice leaves them.
 * `older` is stamped a day behind `newer` so the read order is the file times, not the
 * order the directory happens to list.
 * @param {object} older @param {object} newer @returns {string} the workspace root
 */
function twiceVerified(older, newer) {
  const dir = scratch();
  const shots = join(dir, '.my-command', 'shots');
  mkdirSync(shots, { recursive: true });
  writeFileSync(join(shots, 'verdict.json'), JSON.stringify(older));
  writeFileSync(join(shots, 'verdict-2.json'), JSON.stringify(newer));
  const day = 24 * 60 * 60;
  const now = Date.now() / 1000;
  utimesSync(join(shots, 'verdict.json'), now - day, now - day);
  utimesSync(join(shots, 'verdict-2.json'), now, now);
  return dir;
}

test('an earlier run’s read-back survives a later run recording its own', () => {
  const dir = twiceVerified(
    { tier: 'playwright', verdict: 'green', shots: [{ name: 'banner.png', label: 'Banner', description: 'Amber.' }] },
    { tier: 'playwright', verdict: 'green', shots: [{ name: 'icon.png', label: 'Icon', description: 'White.' }] },
  );
  const read = readVerdict(dir, 'fix/x');
  assert.deepEqual(read?.shots?.map((note) => note.name).sort(), ['banner.png', 'icon.png']);
});

test('the newest record decides the tier and verdict, never an older one', () => {
  const dir = twiceVerified(
    { tier: 'static', verdict: 'red', rounds: 9, shots: [{ name: 'a.png', label: 'A', description: 'A.' }] },
    { tier: 'playwright', verdict: 'green', rounds: 2 },
  );
  const read = readVerdict(dir, 'fix/x');
  assert.equal(read?.tier, 'playwright');
  assert.equal(read?.verdict, 'green');
  assert.equal(read?.rounds, 2);
  // The older record contributed its note without contributing its tier.
  assert.deepEqual(
    read?.shots?.map((note) => note.name),
    ['a.png'],
  );
});

test('the newest note for a shot wins, and a gap said twice is listed once', () => {
  const dir = twiceVerified(
    {
      tier: 'playwright',
      verdict: 'red',
      shots: [{ name: 'icon.png', label: 'Stale', description: 'Was solid.' }],
      gaps: ['Mobile widths were not captured.', 'Dark mode was not reached.'],
    },
    {
      tier: 'playwright',
      verdict: 'green',
      shots: [{ name: 'icon.png', label: 'Fresh', description: 'Now white.' }],
      gaps: ['Mobile widths were not captured.'],
    },
  );
  const read = readVerdict(dir, 'fix/x');
  assert.deepEqual(read?.shots, [{ name: 'icon.png', label: 'Fresh', description: 'Now white.' }]);
  assert.deepEqual(read?.gaps, ['Mobile widths were not captured.', 'Dark mode was not reached.']);
});

/**
 * A keep holding `branches`, each a relative path under the root, with every file in it
 * stamped `ageDays` old.
 * @param {{path: string, ageDays: number}[]} branches @returns {string} the keep root
 */
function keep(branches) {
  const root = scratch();
  for (const { path, ageDays } of branches) {
    const dir = join(root, path);
    mkdirSync(dir, { recursive: true });
    for (const name of ['home.png', 'verdict.json']) {
      const file = join(dir, name);
      writeFileSync(file, 'pixels');
      const at = Date.now() / 1000 - ageDays * 24 * 60 * 60;
      utimesSync(file, at, at);
    }
  }
  return root;
}

test('a branch directory is the one holding files, not the levels routing to it', () => {
  const root = keep([
    { path: join('repo', 'fix', 'a'), ageDays: 0 },
    { path: join('repo', 'solo'), ageDays: 0 },
  ]);
  mkdirSync(join(root, 'repo', 'fix', 'a', 'round-2'));
  writeFileSync(join(root, 'repo', 'fix', 'a', 'round-2', 'nested.png'), 'pixels');
  // The nested round directory sits inside a branch, so the walk stops before reaching it.
  assert.deepEqual(keepBranchDirs(root), [join(root, 'repo', 'fix', 'a'), join(root, 'repo', 'solo')].sort());
});

test('a branch older than the cutoff goes whole, and a fresh one stays', () => {
  const root = keep([
    { path: join('repo', 'fix', 'old'), ageDays: 30 },
    { path: join('repo', 'fix', 'new'), ageDays: 1 },
  ]);
  const report = pruneKeep({ root, maxAgeDays: 7 });
  assert.equal(report.removedCount, 1);
  assert.equal(report.kept, 1);
  assert.equal(existsSync(join(root, 'repo', 'fix', 'old')), false);
  assert.equal(existsSync(join(root, 'repo', 'fix', 'new', 'verdict.json')), true);
});

test('emptying a branch takes its now-empty parents with it, and never the root', () => {
  const root = keep([{ path: join('repo', 'fix', 'only'), ageDays: 30 }]);
  const report = pruneKeep({ root, maxAgeDays: 7 });
  assert.deepEqual(report.emptied, [join(root, 'repo', 'fix'), join(root, 'repo')]);
  assert.equal(existsSync(root), true);
});

test('a dry run reports the same removal and takes none', () => {
  const root = keep([{ path: join('repo', 'fix', 'old'), ageDays: 30 }]);
  const report = pruneKeep({ root, maxAgeDays: 7, dryRun: true });
  assert.equal(report.removedCount, 1);
  assert.equal(report.dryRun, true);
  assert.deepEqual(report.emptied, []);
  assert.equal(existsSync(join(root, 'repo', 'fix', 'old', 'home.png')), true);
});

test('a keep that was never written prunes nothing rather than throwing', () => {
  const report = pruneKeep({ root: join(scratch(), 'never-written'), maxAgeDays: 7 });
  assert.equal(report.removedCount, 0);
  assert.equal(report.kept, 0);
});
