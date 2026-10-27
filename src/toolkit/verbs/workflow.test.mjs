import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { flagsFrom } from '../lib/flags.mjs';
import { run } from './workflow.mjs';

/** @type {string[]} */
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'mct-workflow-'));
  made.push(dir);
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  git(['add', 'a.txt']);
  git(['commit', '-qm', 'init']);
  return { dir, git };
}

/** @param {string} cwd @param {Record<string, string>} [flags] */
const ctx = (cwd, flags = {}) =>
  /** @type {never} */ ({ verb: 'workflow', cwd, positionals: [], flags: flagsFrom(flags) });

/** @param {string} dir @param {unknown} contract */
function writeLocal(dir, contract) {
  mkdirSync(join(dir, '.git', 'my-command'), { recursive: true });
  writeFileSync(join(dir, '.git', 'my-command', 'workflow.json'), JSON.stringify(contract));
}

test('no contract anywhere answers null and still names the local path', () => {
  const { dir } = repo();
  const out = run(ctx(dir));
  assert.equal(out.source, null);
  assert.equal(out.contract, null);
  assert.match(out.localPath, /\.git\/my-command\/workflow\.json$/);
});

test('the local contract is read from the git common dir, so every worktree sees it', () => {
  const { dir, git } = repo();
  writeLocal(dir, { branches: { model: 'stacked' } });
  const wt = join(dir, '..', `${made.length}-wt-${Date.now()}`);
  made.push(wt);
  git(['worktree', 'add', '-q', '-b', 'feat/x', wt]);

  const out = run(ctx(wt));
  assert.equal(out.source, 'local');
  assert.deepEqual(out.contract, { branches: { model: 'stacked' } });
  assert.equal(git(['status', '--porcelain']).trim(), '', 'the local contract is never a tracked change');
});

test('a local contract outranks the repository one, which answers when there is no local file', () => {
  const { dir } = repo();
  mkdirSync(join(dir, 'scripts'));
  writeFileSync(
    join(dir, 'scripts', 'bootstrap-worktree.sh'),
    `if [ "$1" = --print-workflow-contract ]; then echo '{"review":{"format":"buckets"}}'; fi\n`,
  );
  assert.deepEqual(run(ctx(dir)), {
    localPath: run(ctx(dir)).localPath,
    source: 'repo',
    contract: { review: { format: 'buckets' } },
  });

  writeLocal(dir, { branches: { model: 'single' } });
  assert.equal(run(ctx(dir)).source, 'local');
});

test('an unreadable local contract is an error, not a silent fallback', () => {
  const { dir } = repo();
  mkdirSync(join(dir, '.git', 'my-command'), { recursive: true });
  writeFileSync(join(dir, '.git', 'my-command', 'workflow.json'), '{ nope');
  assert.throws(() => run(ctx(dir)), /is not valid JSON/);
  writeFileSync(join(dir, '.git', 'my-command', 'workflow.json'), '[]');
  assert.throws(() => run(ctx(dir)), /must hold a JSON object/);
});

test('--spec reports open clarifications, task progress, and the branch spec.md names', () => {
  const { dir } = repo();
  const spec = join(dir, 'specs', '001-language-preference');
  mkdirSync(spec, { recursive: true });
  writeFileSync(
    join(spec, 'spec.md'),
    '# Spec\n\n**Feature Branch**: `001-lang`\n\n| Decision | [NEEDS CLARIFICATION: default?] |\n',
  );
  writeFileSync(join(spec, 'tasks.md'), '- [x] T001 one\n- [ ] T002 two\n- [ ] T003 [NEEDS CLARIFICATION: owner]\n');

  const out = run(ctx(dir, { spec: 'specs/001-language-preference' })).spec;
  assert.equal(out?.exists, true);
  assert.deepEqual(out?.files, ['spec.md', 'tasks.md']);
  assert.equal(out?.clarifications, 2);
  assert.deepEqual(out?.tasks, { open: 2, done: 1 });
  assert.equal(out?.branch, '001-lang');
  assert.equal(out?.branchOnOrigin, false);
});

test('--spec without a Feature Branch line falls back to the folder name, and a missing folder says so', () => {
  const { dir } = repo();
  const spec = join(dir, 'specs', '002-thing');
  mkdirSync(spec, { recursive: true });
  writeFileSync(join(spec, 'spec.md'), '# Spec\n');
  assert.equal(run(ctx(dir, { spec: 'specs/002-thing' })).spec?.branch, '002-thing');
  assert.equal(run(ctx(dir, { spec: 'specs/404' })).spec?.exists, false);
});
