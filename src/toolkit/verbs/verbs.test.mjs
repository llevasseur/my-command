// End-to-end verb tests against a throwaway git repo, so the guards that matter
// (never commit on the default branch, never stage the whole tree) are proven rather
// than assumed.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { porcelain } from '../lib/repo.mjs';
import { run as cleanup } from './cleanup.mjs';
import { run as commit, usage as commitUsage } from './commit.mjs';
import { run as concepts, line as conceptsLine } from './concepts.mjs';
import { run as pr, usage as prUsage } from './pr.mjs';
import { run as scope } from './scope.mjs';
import { run as state } from './state.mjs';
import { run as verify } from './verify.mjs';
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

test('commit takes a multi-line message from --message-file', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  writeFileSync(join(dir, 'a.ts'), 'export const a = 5;\n');
  const msgFile = join(dir, 'msg.txt');
  // The shape this flag exists for: prose too long for a shell argument, handed over as a
  // path rather than composed into a heredoc, which is refused outright inside a worktree.
  writeFileSync(msgFile, 'feat: bump a\n\nA second paragraph, and a third line.\n');

  const r = commit(ctx(dir, ['a.ts'], { 'message-file': msgFile }));
  assert.equal(r.committed, true);
  const subject = execFileSync('git', ['log', '-1', '--format=%B'], { cwd: dir, encoding: 'utf8' });
  assert.match(subject, /^feat: bump a\n\nA second paragraph, and a third line\./);
});

test('commit refuses --message together with --message-file, and an unreadable file', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  writeFileSync(join(dir, 'a.ts'), 'export const a = 6;\n');
  const msgFile = join(dir, 'msg.txt');
  writeFileSync(msgFile, 'feat: one way only\n');

  assert.throws(() => commit(ctx(dir, ['a.ts'], { message: 'inline', 'message-file': msgFile })), /mutually exclusive/);
  assert.throws(() => commit(ctx(dir, ['a.ts'], { 'message-file': join(dir, 'absent.txt') })), /absent\.txt/);
});

test('pr refuses --body together with --body-file', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  const bodyFile = join(dir, 'body.md');
  writeFileSync(bodyFile, '## Summary\n\nOne way only.\n');

  assert.throws(() => pr(ctx(dir, [], { body: 'inline', 'body-file': bodyFile })), /mutually exclusive/);
});

test('the usage strings do not prescribe the stdin form the gate refuses', () => {
  // Three recorded sessions lost a turn to this: the gate refused `--body -`, and the verb's
  // own usage text — the prose the agent reads to find the flag — offered it as a route. Where
  // the stdin form is mentioned at all it has to say it is refused, in the same breath.
  for (const [usage, flag] of [
    [prUsage, '--body -'],
    [commitUsage, '--message -'],
  ]) {
    for (const line of usage.split('\n')) {
      if (!line.includes(flag)) continue;
      const sentence = usage.slice(usage.indexOf(line));
      assert.match(sentence, /refuses/, `${flag} is offered without saying the gate refuses it`);
    }
  }
  assert.match(prUsage, /--body-file/);
  assert.match(commitUsage, /--message-file/);
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

test('commit takes a multi-line message from --message-file', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  writeFileSync(join(dir, 'a.ts'), 'export const a = 2;\n');

  const msgPath = join(dir, 'msg.txt');
  writeFileSync(msgPath, 'feat: land the thing\n\nA body paragraph the shell would need a heredoc for.\n');

  const r = commit(ctx(dir, ['a.ts'], { 'message-file': msgPath }));
  assert.equal(r.committed, true);
  assert.equal(r.subject, 'feat: land the thing');
  assert.match(git(['log', '-1', '--format=%B']), /A body paragraph/);
});

test('commit refuses --message with --message-file, and an unreadable file', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  writeFileSync(join(dir, 'a.ts'), 'export const a = 3;\n');

  assert.throws(
    () => commit(ctx(dir, ['a.ts'], { message: 'one', 'message-file': '/nope.txt' })),
    /mutually exclusive/,
  );
  assert.throws(() => commit(ctx(dir, ['a.ts'], { 'message-file': '/nope/definitely-not.txt' })), /could not read/);
  // Present as a bare switch is a usage error, not a silent fall through to stdin.
  assert.throws(() => commit(ctx(dir, ['a.ts'], { 'message-file': true })), /needs a path/);
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
 * A process carrying `marker` in its argv, orphaned rather than spawned as a child:
 * a reaped child of the test run would linger as a zombie and still read back alive.
 * @param {string} marker @returns {number} pid
 */
function stray(marker) {
  const script = `${process.execPath} -e 'setTimeout(() => {}, 60000)' "$1" >/dev/null 2>&1 & echo $!`;
  const pid = Number(execFileSync('sh', ['-c', script, 'sh', marker], { encoding: 'utf8' }).trim());
  strays.push(pid);
  for (let waited = 0; waited < 5000; waited += 50) {
    if (execFileSync('ps', ['-eo', 'command='], { encoding: 'utf8' }).includes(marker)) return pid;
    execFileSync('sleep', ['0.05']);
  }
  throw new Error(`stray carrying ${marker} never appeared in ps`);
}

/** @type {number[]} */
const strays = [];

/** @param {number} pid @returns {boolean} */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

after(() => {
  for (const pid of strays) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already reaped by the test that was meant to reap it.
    }
  }
});

test('worktree reap stops a process still rooted in the worktree', () => {
  const { dir, git } = repo();
  git(['branch', 'feat/stale']);
  const tree = /** @type {{ path: string }} */ (
    worktree(ctx(dir, ['begin'], { branch: 'feat/stale', existing: true }))
  );
  const pid = stray(tree.path);

  const r = /** @type {{ path: string; reaped: { pid: number }[] }} */ (
    worktree(ctx(dir, ['reap'], { branch: 'feat/stale' }))
  );
  assert.equal(r.path, tree.path);
  assert.deepEqual(
    r.reaped.map((p) => p.pid),
    [pid],
  );
  assert.equal(alive(pid), false);
  // Reaping does not remove the checkout — that is `end`'s job.
  assert.equal(existsSync(tree.path), true);
});

test('worktree reap leaves processes rooted elsewhere alone', () => {
  const { dir, git } = repo();
  git(['branch', 'feat/stale']);
  const tree = /** @type {{ path: string }} */ (
    worktree(ctx(dir, ['begin'], { branch: 'feat/stale', existing: true }))
  );
  const bystander = stray(join(dir, 'some-other-place'));

  const r = /** @type {{ reaped: { pid: number }[] }} */ (worktree(ctx(dir, ['reap'], { path: tree.path })));
  assert.deepEqual(r.reaped, []);
  assert.equal(alive(bystander), true);
});

test('worktree end reaps by default and --no-reap opts out', () => {
  const { dir, git } = repo();
  git(['branch', 'feat/kept']);
  const kept = /** @type {{ path: string }} */ (worktree(ctx(dir, ['begin'], { branch: 'feat/kept', existing: true })));
  const survivor = stray(kept.path);
  worktree(ctx(dir, ['end'], { branch: 'feat/kept', force: true, 'no-reap': true }));
  assert.equal(alive(survivor), true);

  git(['branch', 'feat/reaped']);
  const gone = /** @type {{ path: string }} */ (
    worktree(ctx(dir, ['begin'], { branch: 'feat/reaped', existing: true }))
  );
  const doomed = stray(gone.path);
  const r = /** @type {{ reaped: { pid: number }[] }} */ (
    worktree(ctx(dir, ['end'], { branch: 'feat/reaped', force: true }))
  );
  assert.deepEqual(
    r.reaped.map((p) => p.pid),
    [doomed],
  );
  assert.equal(alive(doomed), false);
});

/** A repo whose `main` is pushed to a real bare `origin`, still checked out on `main`. */
function repoWithOrigin() {
  const { dir, git } = repo();
  const remote = mkdtempSync(join(tmpdir(), 'mct-origin-'));
  made.push(remote);
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(['remote', 'add', 'origin', remote]);
  git(['push', '-q', '-u', 'origin', 'main']);
  return { dir, git };
}

/** @param {unknown} r @returns {{comparedWith: string|null, worktrees: {branch: string|null, reclaimable: boolean|null}[]}} */
const listed = (r) => /** @type {never} */ (r);

test('worktree list marks a merged branch reclaimable and leaves live work alone', () => {
  const { dir, git } = repoWithOrigin();
  // Never moved off main's tip, so already an ancestor of origin/main.
  git(['branch', 'feat/merged']);
  // Carries a commit origin/main has never seen.
  git(['checkout', '-qb', 'feat/live']);
  writeFileSync(join(dir, 'b.ts'), 'export const b = 1;\n');
  git(['add', 'b.ts']);
  git(['commit', '-qm', 'work in progress']);
  git(['checkout', '-q', 'main']);

  worktree(ctx(dir, ['begin'], { branch: 'feat/merged', existing: true }));
  worktree(ctx(dir, ['begin'], { branch: 'feat/live', existing: true }));

  const r = listed(worktree(ctx(dir, ['list'])));
  assert.equal(r.comparedWith, 'origin/main');
  const by = new Map(r.worktrees.map((w) => [w.branch, w.reclaimable]));
  assert.equal(by.get('feat/merged'), true);
  assert.equal(by.get('feat/live'), false);
});

test('worktree list never marks the default branch reclaimable', () => {
  const { dir } = repoWithOrigin();
  // `main` sits exactly on origin/main, so it is trivially its own ancestor.
  const r = listed(worktree(ctx(dir, ['list'])));
  assert.equal(r.worktrees.find((w) => w.branch === 'main')?.reclaimable, false);
});

test('worktree list cannot judge a detached worktree', () => {
  const { dir, git } = repoWithOrigin();
  git(['worktree', 'add', '-q', '--detach', join(dir, '.claude', 'worktrees', 'loose'), 'HEAD']);

  const r = listed(worktree(ctx(dir, ['list'])));
  // No branch means no merge to read — null, not a `false` that would read as live work.
  assert.equal(r.worktrees.find((w) => w.branch === null)?.reclaimable, null);
});

test('worktree list cannot judge a branch ref git can no longer resolve', () => {
  const { dir, git } = repoWithOrigin();
  git(['branch', 'feat/gone']);
  worktree(ctx(dir, ['begin'], { branch: 'feat/gone', existing: true }));
  // The worktree outlives its ref: git still lists the branch, but merge-base exits 128
  // instead of answering, and 128 is not a "no".
  git(['update-ref', '-d', 'refs/heads/feat/gone']);

  const r = listed(worktree(ctx(dir, ['list'])));
  assert.equal(r.worktrees.find((w) => w.branch === 'feat/gone')?.reclaimable, null);
});

test('worktree list says it could not compare rather than claiming nothing is reclaimable', () => {
  const { dir, git } = repo();
  git(['branch', 'feat/x']);
  worktree(ctx(dir, ['begin'], { branch: 'feat/x', existing: true }));

  const r = listed(worktree(ctx(dir, ['list'])));
  // With no origin/main on disk the answer is "unknown — fetch first", not `false`.
  assert.equal(r.comparedWith, null);
  assert.equal(r.worktrees.find((w) => w.branch === 'feat/x')?.reclaimable, null);
  // The default branch still needs no ref to judge.
  assert.equal(r.worktrees.find((w) => w.branch === 'main')?.reclaimable, false);
});

/**
 * A repo with a real `origin` to push to, plus a stub `gh` on PATH that answers
 * `pr view` with `json` and records every invocation. Returns the log reader, so a
 * test can assert on what the verb did *not* call as well as what it did.
 * @param {Record<string, unknown>} json  What `gh pr view --json ...` should report.
 */
function repoWithFakeGh(json) {
  const { dir, git } = repoWithOrigin();
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

test('pr takes its title from the first commit when --title is absent', () => {
  const { dir, git, calls, restore } = repoWithFakeGh({
    number: 11,
    url: 'https://example.test/pr/11',
    isDraft: false,
    title: 'Existing',
    state: 'OPEN',
  });
  try {
    writeFileSync(join(dir, 'b.ts'), 'export const b = 1;\n');
    git(['add', 'b.ts']);
    git(['commit', '-qm', 'fix: stop losing the closing turn']);
    writeFileSync(join(dir, 'c.ts'), 'export const c = 1;\n');
    git(['add', 'c.ts']);
    git(['commit', '-qm', 'a later commit nobody titles a PR after']);

    const r = pr(ctx(dir, [], { body: 'body', retitle: true }));
    assert.equal(r.action, 'updated');
    assert.match(calls(), /--title fix: stop losing the closing turn/);
  } finally {
    restore();
  }
});

test('pr still refuses when there is no commit to take a title from', () => {
  const { dir, restore } = repoWithFakeGh({
    number: 12,
    url: 'https://example.test/pr/12',
    isDraft: false,
    title: 'Existing',
    state: 'OPEN',
  });
  try {
    assert.throws(() => pr(ctx(dir, [], { body: 'body' })), /--title is required/);
  } finally {
    restore();
  }
});

const SHOT = 'https://github.com/user-attachments/assets/1111-2222';
const CLIP = 'https://github.com/user-attachments/assets/3333-4444';

/** @param {Record<string, unknown>} extra */
const openPr = (extra) => ({
  number: 9,
  url: 'https://example.test/pr/9',
  isDraft: false,
  title: 'T',
  state: 'OPEN',
  ...extra,
});

test("pr carries an existing description's assets into the rewritten body", () => {
  const { dir, calls, restore } = repoWithFakeGh(
    openPr({ body: `Old prose\n\n![screenshot](${SHOT})\n\n<video src="${CLIP}"></video>\n` }),
  );
  try {
    const r = pr(ctx(dir, [], { title: 'T', body: '- rewrote the thing' }));
    assert.equal(r.assetsPreserved, 2);
    const log = calls();
    assert.match(log, /- rewrote the thing/);
    assert.match(log, /## Assets/);
    assert.ok(log.includes(`![screenshot](${SHOT})`));
    assert.ok(log.includes(`<video src="${CLIP}"></video>`));
    assert.doesNotMatch(log, /Old prose/);
  } finally {
    restore();
  }
});

test('pr does not re-append an asset the new body already carries', () => {
  const { dir, calls, restore } = repoWithFakeGh(openPr({ body: `![shot](${SHOT})` }));
  try {
    const r = pr(ctx(dir, [], { title: 'T', body: `- new prose\n\n![shot](${SHOT})` }));
    assert.equal(r.assetsPreserved, 0);
    assert.doesNotMatch(calls(), /## Assets/);
  } finally {
    restore();
  }
});

test('pr treats a bare attachment link as an asset and keeps one heading across updates', () => {
  // Second pass: the previous body already has the heading, plus a new bare URL.
  const { dir, calls, restore } = repoWithFakeGh(
    openPr({ body: `Prose\n\n## Assets\n\n![shot](${SHOT})\n\n${CLIP}\n` }),
  );
  try {
    const r = pr(ctx(dir, [], { title: 'T', body: `- prose\n\n## Assets\n\n![shot](${SHOT})` }));
    assert.equal(r.assetsPreserved, 1);
    const log = calls();
    assert.ok(log.includes(CLIP));
    assert.equal(log.match(/## Assets/g)?.length, 1);
  } finally {
    restore();
  }
});

test('pr adds nothing when the previous description had no assets', () => {
  const { dir, calls, restore } = repoWithFakeGh(
    openPr({ body: 'Just prose, and a [plain link](https://example.test/docs).' }),
  );
  try {
    const r = pr(ctx(dir, [], { title: 'T', body: '- new prose' }));
    assert.equal(r.assetsPreserved, 0);
    assert.doesNotMatch(calls(), /## Assets/);
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

test('commit retries an unapproved signing prompt exactly once', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/signed']);
  writeFileSync(join(dir, 'a.ts'), 'export const a = 11;\n');

  // A signer that always fails the way an unapproved 1Password prompt does, counting its
  // invocations so the retry is proven bounded rather than merely present.
  const attempts = join(dir, 'sign-attempts');
  const signer = join(dir, 'fake-gpg');
  writeFileSync(
    signer,
    `#!/bin/sh\necho x >> ${JSON.stringify(attempts)}\necho "1Password: failed to fill whole buffer" >&2\nexit 1\n`,
  );
  chmodSync(signer, 0o755);
  git(['config', 'commit.gpgsign', 'true']);
  // The format is pinned because the developer's global config may select ssh signing,
  // which would route around `gpg.program` and never reach the stub.
  git(['config', 'gpg.format', 'openpgp']);
  git(['config', 'gpg.program', signer]);
  git(['config', 'user.signingkey', 'ABCD1234']);

  assert.throws(() => commit(ctx(dir, ['a.ts'], { message: 'feat: signed' })), /twice on an unapproved signing prompt/);
  // Two attempts, never three: a third would only stack another prompt.
  assert.equal(readFileSync(attempts, 'utf8').split('\n').filter(Boolean).length, 2);
  // The failed attempts wrote nothing, so the tree is exactly as it was.
  assert.equal(
    execFileSync('git', ['log', '--oneline'], { cwd: dir, encoding: 'utf8' }).split('\n').filter(Boolean).length,
    1,
  );
});

test('commit does not retry an ordinary failure', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/x']);
  writeFileSync(join(dir, 'a.ts'), 'export const a = 12;\n');
  const r = commit(ctx(dir, ['a.ts'], { message: 'feat: fine' }));
  assert.equal(r.committed, true);
  assert.equal(r.signingRetried, false);
});

test('scope reports a branch’s own commits and files without checking anything out', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/scoped']);
  writeFileSync(join(dir, 'b.ts'), 'export const b = 1;\n');
  git(['add', 'b.ts']);
  git(['commit', '-qm', 'feat: add b']);
  writeFileSync(join(dir, 'c.ts'), 'export const c = 1;\n');

  const s = scope(ctx(dir, [], { base: 'main' }));
  assert.equal(s.branch, 'feat/scoped');
  assert.equal(s.isCurrentBranch, true);
  assert.deepEqual(
    s.commits.map((c) => c.subject),
    ['feat: add b'],
  );
  assert.deepEqual(
    s.files.map((f) => f.path),
    ['b.ts'],
  );
  // One ref to hand a single `git diff`, rather than a merge-base captured into a
  // command substitution.
  assert.match(s.diffRef, /^[0-9a-f]{40}\.\.\.feat\/scoped$/);
  // The current branch also has a working tree, and it is reported apart from the commits.
  assert.equal(s.workingTree, true);
  const stillOnMain = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  assert.equal(stillOnMain, 'feat/scoped');
});

test('scope --diff returns the whole branch diff, hunk-annotated, in that one call', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/diffed']);
  writeFileSync(join(dir, 'b.ts'), 'export const b = 1;\n// a comment\nexport const c = 2;\n');
  git(['add', 'b.ts']);
  git(['commit', '-qm', 'feat: add b']);
  writeFileSync(join(dir, 'b.ts'), 'export const b = 1;\n// a comment\nexport const c = 3;\n');

  const s = scope(ctx(dir, [], { base: 'main', diff: true }));
  assert.ok(s.diff, '--diff should return diff content');

  // The committed half: the branch's own work, with content rather than a file list.
  const committed = s.diff.committed.find((/** @type {{path: string}} */ f) => f.path === 'b.ts');
  assert.ok(committed, 'b.ts should be in the committed diff');
  assert.equal(committed.hunks.length, 1);
  assert.match(committed.hunks[0].header, /^@@ /);
  assert.equal(committed.hunks[0].newStart, 1);
  // Every line carries its own line number, so an edit needs no counting pass over the file.
  assert.deepEqual(committed.hunks[0].lines, [
    '+1\texport const b = 1;',
    '+2\t// a comment',
    '+3\texport const c = 2;',
  ]);

  // The uncommitted half is reported apart from it, and only for the current branch.
  const pending = s.diff.workingTree.find((/** @type {{path: string}} */ f) => f.path === 'b.ts');
  assert.ok(pending, 'the uncommitted edit should be in the working-tree diff');
  assert.ok(pending.hunks[0].lines.includes('-3\texport const c = 2;'));
  assert.ok(pending.hunks[0].lines.includes('+3\texport const c = 3;'));
  assert.ok(pending.hunks[0].lines.includes(' 1\texport const b = 1;'), 'context lines are numbered too');

  assert.equal(s.diff.truncated, false);
  assert.deepEqual(s.diff.omitted, []);
  assert.equal(s.diff.limit, 200_000);

  // Still read-only: no checkout, no switch.
  const still = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  assert.equal(still, 'feat/diffed');
});

test('scope --diff is bounded, and says which files it dropped', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/big']);
  for (const name of ['one.ts', 'two.ts', 'three.ts']) {
    writeFileSync(join(dir, name), `export const x = '${'y'.repeat(200)}';\n`);
    git(['add', name]);
  }
  git(['commit', '-qm', 'feat: three files']);

  const s = scope(ctx(dir, [], { base: 'main', diff: true, 'diff-limit': '150' }));
  assert.ok(s.diff, '--diff should return diff content');

  assert.equal(s.diff.truncated, true);
  assert.ok(s.diff.omitted.length > 0, 'the dropped files are named');
  // Dropped whole, never mid-hunk: a half-written hunk reads as a complete one.
  assert.equal(s.diff.committed.length + s.diff.omitted.length, 3);
  assert.ok(s.diff.committed.every((/** @type {{hunks: {lines: string[]}[]}} */ f) => f.hunks[0].lines.length > 0));
});

test('scope without --diff carries no diff content at all', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/quiet']);
  writeFileSync(join(dir, 'b.ts'), 'export const b = 1;\n');
  git(['add', 'b.ts']);
  git(['commit', '-qm', 'feat: add b']);

  assert.equal(scope(ctx(dir, [], { base: 'main' })).diff, undefined);
});

test('scope refuses a branch that is not there', () => {
  const { dir } = repo();
  assert.throws(() => scope(ctx(dir, [], { branch: 'feat/nope' })), /no such branch/);
});

test('pr resolves a wrong-identity rejection itself instead of returning it', () => {
  const { dir, git } = repo();
  const remote = mkdtempSync(join(tmpdir(), 'mct-origin-'));
  made.push(remote);
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(['remote', 'add', 'origin', remote]);
  git(['push', '-q', '-u', 'origin', 'main']);
  git(['checkout', '-qb', 'feat/identity']);

  // GraphQL refuses the active account, no owner login exists on the device, and REST
  // accepts the same credential — the recorded shape of this failure.
  const bin = join(dir, '.fakebin');
  mkdirSync(bin);
  const log = join(dir, 'gh.log');
  writeFileSync(
    join(bin, 'gh'),
    [
      '#!/bin/sh',
      `echo "$@" >> ${JSON.stringify(log)}`,
      'case "$1 $2" in',
      '  "pr view") exit 1 ;;',
      '  "auth token") exit 1 ;;',
      '  "pr create")',
      '    echo "pull request create failed: GraphQL: must be a collaborator" >&2; exit 1 ;;',
      '  "api --method")',
      '    echo \'{"number": 42, "html_url": "https://example.test/pr/42"}\'; exit 0 ;;',
      'esac',
      'exit 0',
    ].join('\n'),
  );
  chmodSync(join(bin, 'gh'), 0o755);

  const previous = process.env.PATH;
  process.env.PATH = `${bin}:${previous}`;
  try {
    const r = pr(ctx(dir, [], { title: 'T', body: '- body' }));
    assert.equal(r.action, 'created');
    // Resolved, and it says how — the condition never reaches the caller as an error.
    assert.equal(r.identity, 'REST');
    const calls = readFileSync(log, 'utf8');
    assert.match(calls, /pr create/);
    assert.match(calls, /api --method POST/);
  } finally {
    process.env.PATH = previous;
  }
});

// --- concepts ---------------------------------------------------------------

/** The four variables the verb resolves the store from, cleared and restored per test. */
const STORE_ENV = ['IDEAS_URL', 'IDEAS_TOKEN', 'CONCEPTS_URL', 'CONCEPTS_TOKEN'];

/**
 * One `concepts` call against a stubbed store. `routes` maps a substring of the request URL
 * to the answer for it; an unmatched probe 404s the way an empty corpus does. A `POST` is
 * answered `201` and its parsed body is collected in `posted`, so a write can be asserted on
 * field by field.
 * @param {string[]} positionals
 * @param {{env?: Record<string, string>, routes?: Record<string, {status?: number, body?: unknown}>, flags?: Record<string, string | boolean | string[]>}} [opts]
 */
async function conceptsRun(positionals, opts = {}) {
  const env = opts.env ?? { CONCEPTS_URL: 'https://store.test', CONCEPTS_TOKEN: 'secret' };
  const routes = opts.routes ?? {};
  /** @type {Record<string, string | undefined>} */
  const before = {};
  for (const key of STORE_ENV) {
    before[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, env);

  /** @type {any[]} */
  const posted = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = /** @type {typeof fetch} */ (
    /** @type {unknown} */ (
      async (/** @type {unknown} */ url, /** @type {any} */ init) => {
        if (init?.method === 'POST') {
          posted.push(JSON.parse(String(init.body)));
          return new Response(JSON.stringify({ ok: true }), { status: 201 });
        }
        const key = Object.keys(routes).find((k) => String(url).includes(k));
        const answer = key === undefined ? { status: 404, body: {} } : routes[key];
        return new Response(JSON.stringify(answer.body ?? {}), {
          status: answer.status ?? 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    )
  );

  try {
    const result = await concepts(ctx(process.cwd(), positionals, opts.flags ?? {}));
    return { result: /** @type {any} */ (result), line: conceptsLine(result), posted };
  } finally {
    globalThis.fetch = realFetch;
    for (const key of STORE_ENV) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

test('concepts lookup answers a term hit with the stored sentence unmodified', async () => {
  const { result, line } = await conceptsRun(['lookup', 'scrim'], {
    routes: {
      '/api/concepts/concept': {
        body: {
          concept: { term: 'scrim', field: 'UI motion', sentence: 'The dimmed layer behind a modal.' },
          versions: [1, 2],
        },
      },
    },
  });
  assert.equal(result.outcome, 'term hit');
  assert.equal(
    line,
    'term hit: scrim [UI motion] (2 versions, newest shown)\nsentence: The dimmed layer behind a modal.',
  );
});

test('concepts lookup promotes an exact search match, trimmed and case-insensitively', async () => {
  // The dedicated term endpoint misses on case; a search row whose term *is* the query is
  // still a hit rather than a neighbour.
  const { result, line } = await conceptsRun(['lookup', '  Scrim '], {
    routes: {
      '/api/concepts/search': {
        body: { results: [{ term: 'scrim', field: 'UI motion', sentence: 'The dimmed layer behind a modal.' }] },
      },
    },
  });
  assert.equal(result.outcome, 'term hit');
  assert.match(line, /^term hit: scrim \[UI motion\]\nsentence: The dimmed layer behind a modal\.$/);
});

test('concepts lookup reports neighbours as a field hit, never as a term hit', async () => {
  const { result, line } = await conceptsRun(['lookup', 'scrim'], {
    routes: {
      '/api/concepts/search': {
        body: { results: [{ term: 'backdrop', field: 'UI motion', sentence: 'The layer a scrim dims.' }] },
      },
    },
  });
  assert.equal(result.outcome, 'field hit');
  assert.equal(result.concept, null);
  assert.match(line, /^field hit: /);
  assert.match(line, /^- backdrop \[UI motion\] The layer a scrim dims\.$/m);
});

test('concepts lookup misses on an empty corpus and names the term', async () => {
  const { result, line } = await conceptsRun(['lookup', 'orchestrator agent']);
  assert.equal(result.outcome, 'miss');
  assert.match(line, /^miss: .*"orchestrator agent"/);
});

test('concepts lookup misses with the cause when CONCEPTS_URL is unset', async () => {
  const { result, line } = await conceptsRun(['lookup', 'scrim'], { env: {} });
  assert.equal(result.outcome, 'miss');
  assert.equal(line, 'miss: CONCEPTS_URL is not set, so the corpus was not read');
});

test('concepts lookup misses with the cause when CONCEPTS_TOKEN is unset', async () => {
  const { result, line } = await conceptsRun(['lookup', 'scrim'], { env: { CONCEPTS_URL: 'https://store.test' } });
  assert.equal(result.outcome, 'miss');
  assert.equal(line, 'miss: CONCEPTS_TOKEN is not set, so the corpus was not read');
});

test('concepts lookup promotes an exact match found only in the field listing', async () => {
  const { result, line } = await conceptsRun(['lookup', 'scrim'], {
    flags: { field: 'UI motion' },
    routes: {
      '/api/concepts?field=': {
        body: {
          concepts: [
            { term: 'backdrop', field: 'UI motion', sentence: 'The layer a scrim dims.' },
            { term: 'Scrim', field: 'UI motion', sentence: 'The dimmed layer behind a modal.' },
          ],
        },
      },
    },
  });
  assert.equal(result.outcome, 'term hit');
  assert.match(line, /^term hit: Scrim \[UI motion\]\nsentence: The dimmed layer behind a modal\.$/);
});

test('concepts save reads the record from --record-file and keeps it off the command line', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'concepts-record-'));
  const recordFile = join(dir, 'concept.json');
  writeFileSync(
    recordFile,
    JSON.stringify({
      term: 'scrim',
      field: 'UI motion',
      sentence: 'A sentence with "quotes", a \\backslash, and\na newline.',
      skills: ['teach'],
    }),
  );

  /** @type {any[]} */
  const seen = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      seen.push(JSON.parse(raw));
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());

  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  try {
    const child = spawn(process.execPath, [cli, 'concepts', 'save', '--record-file', recordFile], {
      env: {
        ...process.env,
        IDEAS_URL: '',
        IDEAS_TOKEN: '',
        CONCEPTS_URL: `http://127.0.0.1:${port}`,
        CONCEPTS_TOKEN: 'secret',
      },
    });
    child.stdin.end();
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    assert.equal(code, 0);
    assert.match(out, /^saved: 201 \(new\)$/m);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }

  assert.equal(seen.length, 1);
  assert.equal(seen[0].sentence, 'A sentence with "quotes", a \\backslash, and\na newline.');
});

test('concepts count carries the stored optionals forward onto the new version', async () => {
  const stored = {
    term: 'scrim',
    field: 'UI motion',
    sentence: 'The dimmed layer behind a modal.',
    skills: ['teach'],
    notes: 'Named for the theatre gauze.',
    tips: ['Dim, never blur.'],
    sources: ['https://example.test/scrim'],
    surfacedSkills: ['apple-design'],
    savedAt: '2026-01-01T00:00:00.000Z',
  };
  const { result, line, posted } = await conceptsRun(['count', 'scrim', 'learn'], {
    routes: { '/api/concepts/concept': { body: { concept: stored } } },
  });
  assert.equal(result.outcome, 'counted');
  assert.match(line, /^counted: 201 — learn on scrim$/);

  assert.equal(posted.length, 1);
  const rec = posted[0];
  assert.deepEqual(rec.skills, ['teach', 'learn']);
  assert.equal(rec.notes, stored.notes);
  assert.deepEqual(rec.tips, stored.tips);
  assert.deepEqual(rec.sources, stored.sources);
  assert.deepEqual(rec.surfacedSkills, stored.surfacedSkills);
  assert.equal(rec.sentence, stored.sentence);
  assert.equal(rec.field, stored.field);
  // A new version, not the stored one replayed.
  assert.notEqual(rec.savedAt, stored.savedAt);
});

test('concepts count omits an optional the stored record never had', async () => {
  const { posted } = await conceptsRun(['count', 'scrim', 'learn'], {
    routes: {
      '/api/concepts/concept': {
        body: {
          concept: { term: 'scrim', field: 'UI motion', sentence: 'The dimmed layer.', skills: [], notes: '  ' },
        },
      },
    },
  });
  assert.equal('notes' in posted[0], false);
  assert.equal('tips' in posted[0], false);
  assert.equal('sources' in posted[0], false);
  assert.equal('surfacedSkills' in posted[0], false);
});

test('concepts count refuses to record find-skills as an applied skill', async () => {
  const { result, line } = await conceptsRun(['count', 'scrim', 'find-skills']);
  assert.equal(result.outcome, 'not counted');
  assert.match(line, /^not counted: find-skills is never recorded/);
});

test('concepts save reads the record on stdin and omits the optionals left empty', async () => {
  /** @type {{path: string, auth: string | undefined, body: any}[]} */
  const seen = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      seen.push({ path: req.url ?? '', auth: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());

  // Through the CLI, not the module: the proof that the record travels on stdin and the
  // token on the environment, so neither ever reaches a command line.
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  const args = [cli, 'concepts', 'save'];
  try {
    // Spawned, never `execFileSync`: the server answering this child runs on this same
    // event loop, so a synchronous wait here deadlocks the pair.
    const child = spawn(process.execPath, args, {
      env: {
        ...process.env,
        IDEAS_URL: '',
        IDEAS_TOKEN: '',
        CONCEPTS_URL: `http://127.0.0.1:${port}`,
        CONCEPTS_TOKEN: 'secret',
      },
    });
    child.stdin.end(
      JSON.stringify({
        term: 'scrim',
        field: 'UI motion',
        sentence: 'The dimmed layer behind a modal.',
        notes: '',
        tips: [],
        skills: ['teach', 'find-skills'],
      }),
    );
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    assert.equal(code, 0);
    assert.match(out, /^saved: 201 \(new\)$/m);
  } finally {
    server.close();
  }

  assert.equal(seen.length, 1);
  const call = seen[0];
  assert.equal(call.path, '/api/concepts');
  assert.equal(call.auth, 'Bearer secret');
  assert.equal(call.body.term, 'scrim');
  assert.equal(call.body.sentence, 'The dimmed layer behind a modal.');
  // find-skills is the finder, never an applied skill.
  assert.deepEqual(call.body.skills, ['teach']);
  // Empty optionals are omitted outright rather than stored as blanks.
  assert.equal('notes' in call.body, false);
  assert.equal('tips' in call.body, false);
  assert.equal('sources' in call.body, false);
  // The secret is on the environment and the header; it is not an argument.
  assert.equal(
    args.some((a) => a.includes('secret')),
    false,
  );
});

// ── cleanup: the two post-merge states, answered from the PR rather than from git ─────

/**
 * Put a fake `gh` first on PATH for the duration of `fn`, so the merged-PR lookup can be
 * driven without a network or an account. `answer` is what `gh pr list --json …` prints.
 * @param {string} answer @param {() => void} fn
 */
function withGh(answer, fn) {
  const bin = mkdtempSync(join(tmpdir(), 'mct-gh-'));
  made.push(bin);
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncat <<'JSON'\n${answer}\nJSON\n`);
  chmodSync(join(bin, 'gh'), 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${bin}:${saved}`;
  try {
    fn();
  } finally {
    process.env.PATH = saved;
  }
}

/** @param {unknown} r @returns {{pass: boolean, cleaned: {local: {deleted: boolean, reason: string, pr: number, detail: string}, remote: {deleted: boolean, reason: string, detail: string}}[]}} */
const cleaned = (r) => /** @type {never} */ (r);

test('cleanup deletes a branch git can see is merged', () => {
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/done']);
  writeFileSync(join(dir, 'b.ts'), 'export const b = 1;\n');
  git(['add', 'b.ts']);
  git(['commit', '-qm', 'b']);
  git(['checkout', '-q', 'main']);
  git(['merge', '-q', '--no-edit', 'feat/done']);

  const r = cleaned(cleanup(ctx(dir, [], { branch: 'feat/done', 'keep-remote': true })));
  assert.equal(r.cleaned[0].local.reason, 'merged');
  assert.equal(r.cleaned[0].local.deleted, true);
  assert.equal(r.pass, true);
});

test('cleanup forces a squash-merged branch on the PR, not on the refusal', () => {
  // The exact recorded failure: the work landed as one squash commit, so `git branch -d`
  // reports the branch unmerged and a hand-run `-D` is the only way past. The verb reaches
  // for `-D` because the PR says MERGED, and reports why.
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/squashed']);
  writeFileSync(join(dir, 'c.ts'), 'export const c = 1;\n');
  git(['add', 'c.ts']);
  git(['commit', '-qm', 'c']);
  git(['checkout', '-q', 'main']);
  git(['merge', '-q', '--squash', 'feat/squashed']);
  git(['commit', '-qm', 'squashed c']);

  withGh('[{"number":42,"state":"MERGED","mergedAt":"2026-08-01T00:00:00Z","mergeCommit":{"oid":"deadbeef"}}]', () => {
    const r = cleaned(cleanup(ctx(dir, [], { branch: 'feat/squashed', 'keep-remote': true })));
    assert.equal(r.cleaned[0].local.deleted, true);
    assert.equal(r.cleaned[0].local.reason, 'squash-merged');
    assert.equal(r.cleaned[0].local.pr, 42);
    assert.equal(r.pass, true);
  });
});

test('cleanup refuses a branch whose work landed nowhere', () => {
  // Without a merged PR the refusal is the right answer: those commits exist only here.
  const { dir, git } = repo();
  git(['checkout', '-qb', 'feat/orphan']);
  writeFileSync(join(dir, 'd.ts'), 'export const d = 1;\n');
  git(['add', 'd.ts']);
  git(['commit', '-qm', 'd']);
  git(['checkout', '-q', 'main']);

  withGh('[]', () => {
    const r = cleaned(cleanup(ctx(dir, [], { branch: 'feat/orphan', 'keep-remote': true })));
    assert.equal(r.cleaned[0].local.deleted, false);
    assert.equal(r.cleaned[0].local.reason, 'not-merged');
    assert.equal(r.pass, false);
  });
  // And it really did not delete it.
  assert.match(
    execFileSync('git', ['branch', '--list', 'feat/orphan'], { cwd: dir, encoding: 'utf8' }),
    /feat\/orphan/,
  );
});

test('cleanup reports an already-auto-deleted remote ref as an outcome, not a failure', () => {
  const { dir, git } = repo();
  const remote = mkdtempSync(join(tmpdir(), 'mct-remote-'));
  made.push(remote);
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(['remote', 'add', 'origin', remote]);
  git(['push', '-q', 'origin', 'main']);
  git(['checkout', '-qb', 'feat/gone']);
  git(['checkout', '-q', 'main']);
  git(['merge', '-q', '--no-edit', 'feat/gone']);

  const r = cleaned(cleanup(ctx(dir, [], { branch: 'feat/gone' })));
  assert.equal(r.cleaned[0].remote.reason, 'already-absent');
  assert.equal(r.cleaned[0].remote.deleted, false);
  assert.equal(r.pass, true);
});

test('cleanup refuses a branch a worktree still holds, naming the path', () => {
  const { dir } = repo();
  const r = cleaned(cleanup(ctx(dir, [], { branch: 'main', 'keep-remote': true })));
  assert.equal(r.cleaned[0].local.reason, 'checked-out');
  // macOS resolves the tmpdir through a /private prefix, so compare the tail, not the string.
  assert.equal(r.cleaned[0].local.detail.endsWith(dir.replace(/^\/private/, '')), true);
});

// ── verify --background: the wait the watched-condition gates were refusing without ───

/** @param {unknown} r @returns {{background: boolean, verdict: string, result: string, wait: {tool: string, next: string, input: {run_in_background: boolean, command: string}}}} */
const backgrounded = (r) => /** @type {never} */ (r);

test('verify --background hands back one ready-to-send wait and a verdict', async () => {
  const { dir } = repo();
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'bg', scripts: { test: 'node -e "process.exit(0)"' } }, null, 2),
  );
  const started = backgrounded(verify(ctx(dir, [], { background: true, only: 'test' })));

  assert.equal(started.background, true);
  assert.equal(started.wait.tool, 'Bash');
  // The whole point: one call, backgrounded, that ends by itself. A foreground wait is
  // refused by the harness and a poll is refused by the gate.
  assert.equal(started.wait.input.run_in_background, true);
  assert.match(started.wait.input.command, /until \[ -s /);
  assert.match(started.wait.next, /Read\(\{file_path/);

  // The detached run writes its JSON result before the verdict, so a waiter that sees the
  // verdict can read a complete result rather than a half-written one.
  const deadline = Date.now() + 60_000;
  while (!existsSync(started.verdict) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(existsSync(started.verdict), true);
  assert.match(readFileSync(started.verdict, 'utf8'), /^PASS /);
  assert.equal(JSON.parse(readFileSync(started.result, 'utf8')).pass, true);
});

// ── verify --wait: the call that *is* the wait ────────────────────────────────────────
//
// `--background` alone hands back a *notified* wait — three calls and a watch to arm — and a
// run with nothing else to do read the report instead: twenty times in one recorded session,
// fifteen in another, two sessions ending inside the loop. One blocking call ends that.

/** @param {unknown} r @returns {any} */
const anyResult = (r) => /** @type {never} */ (r);

test('verify --background offers the blocking wait as a ready-to-send call', () => {
  const { dir } = repo();
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'bg2', scripts: { test: 'node -e "process.exit(0)"' } }, null, 2),
  );
  const started = anyResult(verify(ctx(dir, [], { background: true, only: 'test' })));

  assert.match(started.wait.blocking, /my-command-tools verify --wait /);
  assert.equal(started.wait.blockingCall.tool, 'Bash');
  // Foreground, and with a timeout inside the Bash tool's ceiling: the whole answer arrives in
  // this call's own result, so there is nothing to read afterwards.
  assert.equal(started.wait.blockingCall.input.run_in_background, undefined);
  assert.equal(started.wait.blockingCall.input.timeout, 600_000);
  // The report is written atomically at exit, which is what makes an early read provably
  // useless rather than merely wasteful. The note has to say so or the poll stays tempting.
  assert.match(started.note, /atomic/i);
});

test('verify --wait blocks until the detached run finishes and returns its whole report', () => {
  const { dir } = repo();
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'bg3', scripts: { test: 'node -e "process.exit(0)"' } }, null, 2),
  );
  const started = anyResult(verify(ctx(dir, [], { background: true, only: 'test' })));

  const waited = anyResult(verify(ctx(dir, [], { wait: started.verdict })));
  assert.equal(waited.pass, true);
  assert.equal(waited.waited.timedOut, false);
  assert.equal(waited.waited.verdict, started.verdict);
  // The report itself, not a pointer to it: the wait and the answer are one call.
  assert.ok(Array.isArray(waited.ran));
  assert.deepEqual(
    waited.ran.map((/** @type {any} */ g) => g.script),
    ['test'],
  );
});

test('verify --wait times out without killing the run', () => {
  const { dir } = repo();
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'bg4', scripts: { test: 'node -e "setTimeout(() => process.exit(0), 5000)"' } }, null, 2),
  );
  const started = anyResult(verify(ctx(dir, [], { background: true, only: 'test' })));

  const waited = anyResult(verify(ctx(dir, [], { wait: started.verdict, 'wait-timeout': '1' })));
  assert.equal(waited.pass, false);
  assert.equal(waited.waited.timedOut, true);
  assert.match(waited.reason, /still/i);
});

test('verify --wait says so when there is no detached run to wait on', () => {
  const { dir } = repo();
  const before = process.env.MY_COMMAND_VERIFY_DIR;
  process.env.MY_COMMAND_VERIFY_DIR = join(dir, 'empty');
  try {
    // A bare `--wait` means "the most recent detached run". With none, the error names the
    // command that starts one rather than blocking on a file that will never appear.
    assert.throws(() => verify(ctx(dir, [], { wait: true })), /no detached verify run/);
  } finally {
    if (before === undefined) delete process.env.MY_COMMAND_VERIFY_DIR;
    else process.env.MY_COMMAND_VERIFY_DIR = before;
  }
});
