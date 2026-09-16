// The screenshot pipeline's decisions, proven without a network or a GitHub remote:
// which diffs count as frontend, which filenames pair into a before/after row, and what
// the rendered section looks like. The publish itself is git plumbing over a real remote
// and is covered by the `pr` verb's own tests.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { after, test } from 'node:test';
import {
  baselineOf,
  claimRun,
  collectShots,
  commentId,
  findShots,
  groupShots,
  isBrowserTier,
  keepRunDirs,
  noteFor,
  openedRunDirs,
  openRunDir,
  pruneKeep,
  readVerdict,
  readVerdicts,
  renderShots,
  runDir,
  runsFor,
  sideOf,
  verifyRendered,
  writeVerdict,
} from './shots.mjs';

/** @type {string[]} */
const made = [];
const realKeep = process.env.MY_COMMAND_SHOTS_DIR;
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
  if (realKeep === undefined) delete process.env.MY_COMMAND_SHOTS_DIR;
  else process.env.MY_COMMAND_SHOTS_DIR = realKeep;
});

/** @returns {string} */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'mct-shots-test-'));
  made.push(dir);
  return dir;
}

/**
 * Point the device-wide keep at a throwaway directory for the rest of this test. Every keep
 * path is resolved at call time, so setting it here is enough and no real home is written to.
 * @returns {string}
 */
function keepAt() {
  const root = scratch();
  process.env.MY_COMMAND_SHOTS_DIR = root;
  return root;
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

test('two spellings of one side fill the cell once, the first winning', () => {
  const groups = groupShots(['home-before.png', 'home.before.png']);
  assert.deepEqual(groups.pairs, [{ view: 'home', before: 'home-before.png', after: null }]);
});

test('a trailing number is the verifier’s own naming, not a collision to undo', () => {
  // Nothing renames a screenshot into the keep any more, so `-2` is a view of its own.
  assert.deepEqual(sideOf('home-before-2.png'), { view: 'home-2', side: 'before' });
});

test('each run’s copy of one view is its own row, named for the run it came from', () => {
  const groups = groupShots(['run-1/home-before.png', 'run-2/home-before.png']);
  assert.deepEqual(
    groups.pairs.map((row) => row.view),
    ['run-1/home', 'run-2/home'],
  );
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

test('a recorded verdict round-trips out of this run’s directory in the keep', () => {
  const root = keepAt();
  const work = scratch();
  const written = writeVerdict(work, 'feat/x', { tier: 'playwright', verdict: 'red', rounds: 3 });
  assert.equal(written.run, 'run-1');
  assert.equal(written.file, join(root, basename(work), 'feat', 'x', 'run-1', 'verdict.json'));
  const read = readVerdict(work, 'feat/x');
  assert.equal(read?.tier, 'playwright');
  assert.equal(read?.verdict, 'red');
  assert.equal(read?.rounds, 3);
});

test('recording closes the run, so the next loop in one workspace opens its own directory', () => {
  keepAt();
  const work = scratch();
  const first = runDir(work, 'feat/x');
  assert.equal(openRunDir(work, 'feat/x'), first);
  writeVerdict(work, 'feat/x', { tier: 'playwright', verdict: 'red' });
  assert.equal(openRunDir(work, 'feat/x'), null);
  const second = runDir(work, 'feat/x');
  assert.notEqual(second, first);
  assert.deepEqual(openedRunDirs(work, 'feat/x'), [first, second]);
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
 * A branch verified twice: two run directories in the keep, each with its own verdict.
 * `older` is stamped a day behind `newer` so the read order is the file times, not the order
 * the directory happens to list.
 * @param {object} older @param {object} newer @returns {string} the workspace root
 */
function twiceVerified(older, newer) {
  const work = scratch();
  const first = writeVerdict(work, 'fix/x', /** @type {never} */ (older));
  const second = writeVerdict(work, 'fix/x', /** @type {never} */ (newer));
  assert.deepEqual([basename(first.dir), basename(second.dir)], ['run-1', 'run-2']);
  const day = 24 * 60 * 60;
  const now = Date.now() / 1000;
  utimesSync(first.file, now - day, now - day);
  utimesSync(second.file, now, now);
  return work;
}

test('an earlier run’s read-back survives a later run recording its own', () => {
  keepAt();
  const dir = twiceVerified(
    { tier: 'playwright', verdict: 'green', shots: [{ name: 'banner.png', label: 'Banner', description: 'Amber.' }] },
    { tier: 'playwright', verdict: 'green', shots: [{ name: 'icon.png', label: 'Icon', description: 'White.' }] },
  );
  const read = readVerdict(dir, 'fix/x');
  assert.deepEqual(read?.shots?.map((note) => note.name).sort(), ['run-1/banner.png', 'run-2/icon.png']);
});

test('the newest record decides the tier and verdict, never an older one', () => {
  keepAt();
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
    ['run-1/a.png'],
  );
});

test('two runs naming one screenshot keep both read-backs, each bound to its own image', () => {
  keepAt();
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
  // Keyed by filename alone these were one note, and the newer one silently took the older
  // one's place. The run directory is what keeps them apart.
  assert.deepEqual(read?.shots, [
    { name: 'run-2/icon.png', label: 'Fresh', description: 'Now white.' },
    { name: 'run-1/icon.png', label: 'Stale', description: 'Was solid.' },
  ]);
  assert.equal(noteFor(read?.shots ?? [], 'run-1/icon.png')?.label, 'Stale');
  assert.equal(noteFor(read?.shots ?? [], 'run-2/icon.png')?.label, 'Fresh');
  assert.deepEqual(read?.gaps, ['Mobile widths were not captured.', 'Dark mode was not reached.']);
});

test('a note never reaches out of its own run for an image of the same name', () => {
  const notes = [
    { name: 'run-1/home.png', label: 'One', description: 'Amber.' },
    { name: 'run-2/home.png', label: 'Two', description: 'White.' },
  ];
  assert.equal(noteFor(notes, 'run-2/home.png')?.label, 'Two');
  // A third run described nothing, so its screenshot is undescribed rather than borrowed.
  assert.equal(noteFor(notes, 'run-3/home.png'), undefined);
});

test('a nested shot matches the note its own run wrote, by basename', () => {
  const notes = [
    { name: 'run-1/home.png', label: 'One', description: 'Amber.' },
    { name: 'run-2/home.png', label: 'Two', description: 'White.' },
  ];
  assert.equal(noteFor(notes, 'run-2/round-3/home.png')?.label, 'Two');
});

test('two runs photographing one view keep both images and both sentences', () => {
  keepAt();
  const work = scratch();
  const branch = 'feat/twice';

  const first = runDir(work, branch);
  writeFileSync(join(first, 'home.png'), 'run one pixels');
  writeVerdict(work, branch, {
    tier: 'playwright',
    verdict: 'red',
    shots: [{ name: 'home.png', label: 'Home, first pass', description: 'The banner is amber.' }],
  });

  const second = runDir(work, branch);
  writeFileSync(join(second, 'home.png'), 'run two pixels');
  writeVerdict(work, branch, {
    tier: 'playwright',
    verdict: 'green',
    shots: [{ name: 'home.png', label: 'Home, after the fix', description: 'The banner is white.' }],
  });

  const shots = findShots(work, branch);
  assert.deepEqual(
    shots.map((shot) => shot.name),
    ['run-1/home.png', 'run-2/home.png'],
  );
  assert.equal(readFileSync(shots[0].path, 'utf8'), 'run one pixels');
  assert.equal(readFileSync(shots[1].path, 'utf8'), 'run two pixels');

  const read = readVerdict(work, branch);
  assert.equal(noteFor(read?.shots ?? [], 'run-1/home.png')?.description, 'The banner is amber.');
  assert.equal(noteFor(read?.shots ?? [], 'run-2/home.png')?.description, 'The banner is white.');
});

test('a screenshot outlives a workspace torn down without worktree end', () => {
  keepAt();
  const work = scratch();
  const branch = 'fix/torn-down';
  const dir = runDir(work, branch);
  writeFileSync(join(dir, 'home.png'), 'pixels');
  writeVerdict(work, branch, {
    tier: 'playwright',
    verdict: 'green',
    shots: [{ name: 'home.png', label: 'Home', description: 'The banner is white.' }],
  });

  // What ExitWorktree with discard_changes, or a bare `git worktree remove`, leaves behind.
  rmSync(work, { recursive: true, force: true });

  const shots = findShots(work, branch);
  assert.deepEqual(
    shots.map((shot) => shot.name),
    ['run-1/home.png'],
  );
  assert.equal(readVerdict(work, branch)?.verdict, 'green');
});

test('a keep written before runs had directories is still read', () => {
  const root = keepAt();
  const work = scratch();
  const legacy = join(root, basename(work), 'fix', 'old');
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, 'home.png'), 'pixels');
  writeFileSync(
    join(legacy, 'verdict.json'),
    JSON.stringify({
      tier: 'playwright',
      verdict: 'red',
      shots: [{ name: 'home.png', label: 'Home', description: 'Amber.' }],
    }),
  );
  const read = readVerdict(work, 'fix/old');
  assert.equal(read?.verdict, 'red');
  assert.equal(noteFor(read?.shots ?? [], 'home.png')?.description, 'Amber.');
  assert.deepEqual(
    findShots(work, 'fix/old').map((shot) => shot.name),
    ['home.png'],
  );
});

test('a run claimed while another is open takes the next free number', () => {
  keepAt();
  const work = scratch();
  const open = runDir(work, 'feat/x');
  const swept = claimRun(work, 'feat/x');
  assert.equal(swept.run, 'run-2');
  assert.notEqual(swept.dir, open);
  // Claiming does not close what was open, so the loop still records where it was writing.
  assert.equal(openRunDir(work, 'feat/x'), open);
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

test('a run directory is the one holding files, not the levels routing to it', () => {
  const root = keep([
    { path: join('repo', 'fix', 'a', 'run-1'), ageDays: 0 },
    { path: join('repo', 'solo', 'run-1'), ageDays: 0 },
  ]);
  mkdirSync(join(root, 'repo', 'fix', 'a', 'run-1', 'round-2'));
  writeFileSync(join(root, 'repo', 'fix', 'a', 'run-1', 'round-2', 'nested.png'), 'pixels');
  // The nested round directory sits inside a run, so the walk stops before reaching it.
  assert.deepEqual(
    keepRunDirs(root),
    [join(root, 'repo', 'fix', 'a', 'run-1'), join(root, 'repo', 'solo', 'run-1')].sort(),
  );
});

test('a stale run goes without taking a fresh run on the same branch with it', () => {
  const root = keep([
    { path: join('repo', 'fix', 'x', 'run-1'), ageDays: 30 },
    { path: join('repo', 'fix', 'x', 'run-2'), ageDays: 1 },
  ]);
  const report = pruneKeep({ root, maxAgeDays: 7 });
  assert.equal(report.removedCount, 1);
  assert.equal(report.kept, 1);
  assert.equal(existsSync(join(root, 'repo', 'fix', 'x', 'run-1')), false);
  assert.equal(existsSync(join(root, 'repo', 'fix', 'x', 'run-2', 'verdict.json')), true);
  // The branch is still there for the run that survived, rather than emptied out from under it.
  assert.deepEqual(report.emptied, []);
});

test('the last run to age out takes its branch and repo levels with it', () => {
  const root = keep([{ path: join('repo', 'fix', 'x', 'run-1'), ageDays: 30 }]);
  const report = pruneKeep({ root, maxAgeDays: 7 });
  assert.deepEqual(report.emptied, [join(root, 'repo', 'fix', 'x'), join(root, 'repo', 'fix'), join(root, 'repo')]);
  assert.equal(existsSync(root), true);
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

/**
 * One finished verification run: its images written, its read-back recorded, its directory
 * stamped `ageDays` old so the run order a test asserts is its own rather than the clock's.
 * @param {string} work @param {string} branch
 * @param {{shots: Record<string, string | null>, tier?: string, verdict?: string, ageDays?: number}} round
 * @returns {string} the run directory
 */
function verified(work, branch, round) {
  const dir = runDir(work, branch);
  const notes = [];
  for (const [name, description] of Object.entries(round.shots)) {
    writeFileSync(join(dir, name), `pixels for ${name}`);
    if (description) notes.push({ name, label: `View of ${name}`, description });
  }
  /** @type {import('./shots.mjs').Verdict} */
  const record = {
    tier: round.tier ?? 'playwright',
    verdict: round.verdict ?? 'green',
    rounds: 2,
    recordedAt: new Date().toISOString(),
  };
  // A round that photographed nothing records no `shots` key at all, as `shots record` writes it.
  if (notes.length) record.shots = notes;
  writeVerdict(work, branch, record);
  const at = Date.now() / 1000 - (round.ageDays ?? 0) * 24 * 60 * 60;
  for (const name of [...Object.keys(round.shots), 'verdict.json']) utimesSync(join(dir, name), at, at);
  return dir;
}

test('every run is reported with its own images and the read-back its own round wrote', () => {
  keepAt();
  const work = scratch();
  const branch = 'feat/twice';
  const first = verified(work, branch, { shots: { 'home.png': 'The banner is amber.' }, ageDays: 2 });
  const second = verified(work, branch, {
    shots: { 'home.png': 'The banner is white.', 'nav.png': null },
    verdict: 'red',
    ageDays: 1,
  });

  const runs = runsFor(work, branch);
  assert.deepEqual(
    runs.map((entry) => entry.run),
    ['run-2', 'run-1'],
  );
  assert.deepEqual([runs[0].dir, runs[1].dir], [second, first]);
  assert.equal(runs[0].verdict, 'red');
  assert.equal(runs[1].verdict, 'green');
  assert.equal(runs[0].tier, 'playwright');
  assert.equal(runs[0].rounds, 2);

  assert.deepEqual(
    runs[1].shots.map((shot) => [shot.name, shot.description]),
    [['run-1/home.png', 'The banner is amber.']],
  );
  assert.equal(runs[1].shots[0].path, join(first, 'home.png'));
  // Each run's `home.png` keeps its own sentence rather than the newer one's.
  assert.deepEqual(
    runs[0].shots.map((shot) => [shot.name, shot.label, shot.description]),
    [
      ['run-2/home.png', 'View of home.png', 'The banner is white.'],
      ['run-2/nav.png', null, null],
    ],
  );
});

test('the baseline is the newest earlier run, never the one still open', () => {
  keepAt();
  const work = scratch();
  const branch = 'feat/twice';
  verified(work, branch, { shots: { 'home.png': 'Amber.' }, ageDays: 2 });
  const second = verified(work, branch, { shots: { 'home.png': 'White.' }, ageDays: 1 });

  // A third round opens its directory and has not recorded yet, so it is the open one.
  const third = runDir(work, branch);
  writeFileSync(join(third, 'home.png'), 'pixels');
  const runs = runsFor(work, branch);
  assert.equal(runs.find((entry) => entry.open)?.dir, third);

  const baseline = baselineOf(runs);
  assert.equal(baseline?.dir, second);
  assert.deepEqual(
    baseline?.shots.map((shot) => shot.description),
    ['White.'],
  );
});

test('a branch nobody verified before has no baseline to hand over', () => {
  keepAt();
  const work = scratch();
  const dir = runDir(work, 'feat/first');
  writeFileSync(join(dir, 'home.png'), 'pixels');
  assert.equal(baselineOf(runsFor(work, 'feat/first')), null);
});

test('an earlier run that photographed nothing is not offered as a baseline', () => {
  keepAt();
  const work = scratch();
  const branch = 'feat/quiet';
  verified(work, branch, { shots: {}, tier: 'static', verdict: 'skipped', ageDays: 1 });
  runDir(work, branch);
  assert.equal(runsFor(work, branch).length, 2);
  assert.equal(baselineOf(runsFor(work, branch)), null);
});

test('splitting the read leaves the merged verdict exactly as it was', () => {
  keepAt();
  const work = scratch();
  const branch = 'fix/x';
  verified(work, branch, { shots: { 'icon.png': 'Was solid.' }, verdict: 'red', ageDays: 1 });
  verified(work, branch, { shots: { 'icon.png': 'Now white.' }, ageDays: 0 });

  const found = readVerdicts(work, branch);
  assert.deepEqual(
    found.map((entry) => entry.run),
    ['run-2', 'run-1'],
  );
  // The pairing rides alongside the record, so nothing names its own directory on disk.
  assert.equal('run' in found[0].record, false);

  const merged = readVerdict(work, branch);
  assert.equal(merged?.verdict, 'green');
  assert.deepEqual(merged?.shots?.map((note) => note.name).sort(), ['run-1/icon.png', 'run-2/icon.png']);
});

test('a baseline carried forward renders as one row beside the run it came from', () => {
  const names = ['run-1/home.png', 'run-2/home-before.png', 'run-2/home-after.png'];
  const notes = [
    { name: 'run-1/home.png', label: 'Home, first pass', description: 'The banner is amber.' },
    { name: 'run-2/home-before.png', label: 'Home as run 1 saw it', description: 'The banner was amber.' },
    { name: 'run-2/home-after.png', label: 'Home now', description: 'The banner is white.' },
  ];
  const groups = groupShots(names);
  assert.deepEqual(groups.pairs, [
    { view: 'run-2/home', before: 'run-2/home-before.png', after: 'run-2/home-after.png' },
  ]);
  assert.deepEqual(groups.grid, ['run-1/home.png']);

  const section = renderShots({ groups, url: (n) => `u/${n}`, notes, gaps: [], caption: 'Captured.' });
  assert.match(section, /\| run-2\/home \| \*\*Home as run 1 saw it\*\*.+\*\*Home now\*\*.+banner is white\. \|/);
  // The earlier run's own shot is still published, still carrying its own sentence.
  assert.match(
    section,
    /\*\*Home, first pass\*\*<br>!\[run-1\/home\.png\]\(u\/run-1\/home\.png\)<br>The banner is amber\./,
  );
});
