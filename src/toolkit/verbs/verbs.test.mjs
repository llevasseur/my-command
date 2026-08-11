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
import { run as commit } from './commit.mjs';
import { run as concepts, line as conceptsLine } from './concepts.mjs';
import { run as pr } from './pr.mjs';
import { run as scope } from './scope.mjs';
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
 * to the answer for it, so a test states only the probes it cares about and every other
 * probe 404s the way an empty corpus does.
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

  const realFetch = globalThis.fetch;
  globalThis.fetch = /** @type {typeof fetch} */ (
    /** @type {unknown} */ (
      async (/** @type {unknown} */ url) => {
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
    return { result: /** @type {any} */ (result), line: conceptsLine(result) };
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
  // The dedicated term endpoint misses on case; search still answers with the record
  // itself, and a row whose term *is* the query is a hit rather than a neighbour.
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

  // Through the CLI, not the module: this is also the proof that the record travels on
  // stdin and the token on the environment, so neither ever reaches a command line.
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  const args = [cli, 'concepts', 'save'];
  try {
    // Spawned, never `execFileSync`: the store answering this child is the server above,
    // running on this same event loop, so a synchronous wait here deadlocks the pair.
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
