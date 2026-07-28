// End-to-end verb tests against a throwaway git repo, so the guards that matter
// (never commit on the default branch, never stage the whole tree) are proven rather
// than assumed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { porcelain } from '../lib/repo.mjs';
import { run as commit } from './commit.mjs';
import { run as pr } from './pr.mjs';
import { run as state } from './state.mjs';
import { run as worktree } from './worktree.mjs';

/** @type {string[]} */
const made = [];

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'mct-'));
  made.push(dir);
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  // A throwaway repo must not inherit the developer's commit signing: a hardware or
  // agent-backed key blocks on a prompt that never comes in a test run, and the commit
  // then fails outright.
  git(['config', 'commit.gpgsign', 'false']);
  git(['config', 'tag.gpgsign', 'false']);
  writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
  git(['add', 'a.ts']);
  git(['commit', '-qm', 'init']);
  return { dir, git };
}

/** @param {string} cwd @param {string[]} positionals @param {Record<string, unknown>} flags */
const ctx = (cwd, positionals = [], flags = {}) => /** @type {never} */ ({ verb: '', cwd, positionals, flags });

after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

test('state reports no work on a clean default branch', () => {
  const { dir } = repo();
  const s = state(ctx(dir, [], { base: 'HEAD' }));
  assert.equal(s.branch, 'main');
  assert.equal(s.onDefaultBranch, true);
  assert.equal(s.hasWork, false);
});

test('state separates tracked edits from untracked strays', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  writeFileSync(join(dir, 'a.ts'), 'export const a = 2;\n');
  writeFileSync(join(dir, 'stray.log'), 'carried over\n');

  const s = state(ctx(dir, [], { base: 'main' }));
  assert.deepEqual(
    s.changes.tracked.map((c) => c.path),
    ['a.ts'],
  );
  assert.deepEqual(s.changes.untracked, ['stray.log']);
  assert.equal(s.hasWork, true);
});

test('commit refuses the default branch', () => {
  const { dir } = repo();
  writeFileSync(join(dir, 'a.ts'), 'export const a = 3;\n');
  assert.throws(() => commit(ctx(dir, ['a.ts'], { message: 'nope' })), /default branch/);
});

test('commit refuses whole-tree staging', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  assert.throws(() => commit(ctx(dir, ['.'], { message: 'nope' })), /whole-tree/);
});

test('commit stages only the listed paths', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  writeFileSync(join(dir, 'a.ts'), 'export const a = 4;\n');
  writeFileSync(join(dir, 'stray.log'), 'carried over\n');

  const r = commit(ctx(dir, ['a.ts'], { message: 'feat: bump a' }));
  assert.equal(r.committed, true);
  assert.deepEqual(r.files, ['a.ts']);
  // The stray was never this run's work, so it is still sitting there untracked.
  assert.deepEqual(r.remaining, ['stray.log']);
});

test('commit leaves pre-staged carryover out of the commit', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  writeFileSync(join(dir, 'mine.ts'), 'export const mine = 1;\n');
  writeFileSync(join(dir, 'theirs.ts'), 'export const theirs = 1;\n');
  // Someone else's work, already sitting in the index before this run starts.
  git(['add', 'theirs.ts']);

  const r = commit(ctx(dir, ['mine.ts'], { message: 'feat: mine' }));
  assert.equal(r.committed, true);
  assert.deepEqual(r.files, ['mine.ts']);

  const committed = execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], { cwd: dir, encoding: 'utf8' });
  assert.deepEqual(committed.split('\n').filter(Boolean), ['mine.ts']);
  // Still staged, untouched — the whole point of the explicit path list.
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: dir, encoding: 'utf8' });
  assert.deepEqual(staged.split('\n').filter(Boolean), ['theirs.ts']);
});

test('a rename is one entry, not a phantom second file', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  git(['mv', 'a.ts', 'renamed.ts']);

  const entries = porcelain(dir);
  assert.deepEqual(
    entries.map((e) => e.path),
    ['renamed.ts'],
  );
  assert.equal(entries[0].status[0], 'R');
});

test('commit reports a no-op instead of failing when nothing is staged', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  const r = commit(ctx(dir, ['a.ts'], { message: 'nothing changed' }));
  assert.equal(r.committed, false);
});

test('worktree begin --existing checks out a branch instead of creating one', () => {
  const { dir, git } = repo();
  git(['branch', 'feat/existing']);
  writeFileSync(join(dir, 'a.ts'), 'export const a = 9;\n');
  git(['add', 'a.ts']);
  git(['commit', '-qm', 'main moves on']);

  // `run` returns the union of every subverb's shape; the positional picks the branch one.
  const r = /** @type {{ existing: boolean; branch: string; path: string }} */ (
    worktree(ctx(dir, ['begin'], { branch: 'feat/existing', existing: true }))
  );
  assert.equal(r.existing, true);
  assert.equal(r.branch, 'feat/existing');
  // The checkout is the branch's own tip, not main's.
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: r.path, encoding: 'utf8' }).trim();
  assert.equal(head, execFileSync('git', ['rev-parse', 'feat/existing'], { cwd: dir, encoding: 'utf8' }).trim());
});

/**
 * A repo with a real `origin` to push to, plus a stub `gh` on PATH that answers
 * `pr view` with `json` and records every invocation. Returns the log reader, so a
 * test can assert on what the verb did *not* call as well as what it did.
 * @param {Record<string, unknown>} json  What `gh pr view --json ...` should report.
 */
function repoWithFakeGh(json) {
  const { dir, git } = repo();
  const remote = mkdtempSync(join(tmpdir(), 'mct-origin-'));
  made.push(remote);
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(['remote', 'add', 'origin', remote]);
  git(['push', '-q', '-u', 'origin', 'main']);
  git(['checkout', '-qb', 'feat/x']);

  const bin = join(dir, '.fakebin');
  mkdirSync(bin);
  const log = join(dir, 'gh.log');
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh\necho "$@" >> ${JSON.stringify(log)}\n[ "$1 $2" = "pr view" ] && cat <<'JSON'\n${JSON.stringify(json)}\nJSON\nexit 0\n`,
  );
  chmodSync(join(bin, 'gh'), 0o755);

  const previous = process.env.PATH;
  process.env.PATH = `${bin}:${previous}`;
  const restore = () => {
    process.env.PATH = previous;
  };
  const calls = () => readFileSync(log, 'utf8');
  return { dir, git, calls, restore };
}

test('pr leaves an existing draft as a draft', () => {
  const { dir, calls, restore } = repoWithFakeGh({
    number: 7,
    url: 'https://example.test/pr/7',
    isDraft: true,
    title: 'Existing',
    state: 'OPEN',
  });
  try {
    const r = pr(ctx(dir, [], { title: 'New title', body: 'body' }));
    assert.equal(r.action, 'updated');
    assert.equal(r.draft, true);
    // The whole point: updating a draft never promotes it to ready for review.
    assert.doesNotMatch(calls(), /pr ready/);
    // And a title is only rewritten on request.
    assert.doesNotMatch(calls(), /--title/);
  } finally {
    restore();
  }
});

test('pr --draft converts a non-draft PR toward draft', () => {
  const { dir, calls, restore } = repoWithFakeGh({
    number: 8,
    url: 'https://example.test/pr/8',
    isDraft: false,
    title: 'Existing',
    state: 'OPEN',
  });
  try {
    const r = pr(ctx(dir, [], { title: 'New title', body: 'body', draft: true }));
    assert.equal(r.draft, true);
    assert.match(calls(), /pr ready 8 --undo/);
  } finally {
    restore();
  }
});

test('worktree begin --existing refuses a branch that does not exist', () => {
  const { dir } = repo();
  assert.throws(() => worktree(ctx(dir, ['begin'], { branch: 'feat/nope', existing: true })), /does not exist/);
});

test('worktree begin points at --existing when the branch is already there', () => {
  const { dir, git } = repo();
  git(['branch', 'feat/existing']);
  assert.throws(() => worktree(ctx(dir, ['begin'], { branch: 'feat/existing' })), /pass --existing/);
});

test('worktree begin rejects --base together with --existing', () => {
  const { dir, git } = repo();
  git(['branch', 'feat/existing']);
  assert.throws(
    () => worktree(ctx(dir, ['begin'], { branch: 'feat/existing', existing: true, base: 'main' })),
    /--base cannot apply/,
  );
});
