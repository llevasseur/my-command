// End-to-end verb tests against a throwaway git repo, so the guards that matter
// (never commit on the default branch, never stage the whole tree) are proven rather
// than assumed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { porcelain } from '../lib/repo.mjs';
import { run as commit } from './commit.mjs';
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
