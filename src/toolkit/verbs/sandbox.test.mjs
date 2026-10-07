// `sandbox` against a stub `gh` and a stub `git clone`, so every path is exercised with no
// GitHub account and no network. The stub `gh` keeps the repos it "created" as files, which
// is what lets init's idempotence and destroy's ordering be checked as state, not as calls.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { flagsFrom } from '../lib/flags.mjs';
import { run as sandbox } from './sandbox.mjs';

const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();

/** @type {{dir: string, root: string, repos: string, log: string, restore: () => void}} */
let h;

/**
 * @param {string[]} positionals @param {Record<string, string | true>} [flags]
 * @returns {{sandboxes: any[], [field: string]: any}} one subcommand's report; each test reads the fields its subcommand prints
 */
const call = (positionals, flags = {}) =>
  sandbox(
    /** @type {never} */ ({ verb: 'sandbox', cwd: h.dir, positionals, flags: flagsFrom({ root: h.root, ...flags }) }),
  );

const calls = () => (existsSync(h.log) ? readFileSync(h.log, 'utf8') : '');
/** @param {string} slug */
const repoFile = (slug) => join(h.repos, slug.replace('/', '__'));

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'mct-sandbox-'));
  const bin = join(dir, 'bin');
  const repos = join(dir, 'repos');
  const root = join(dir, 'sandboxes');
  const log = join(dir, 'calls.log');
  mkdirSync(bin);
  mkdirSync(repos);

  // The reset script a template-generated clone carries: echo what it was handed, in the
  // real script's output shape.
  const resetScript = join(dir, 'reset-scenario.sh');
  writeFileSync(
    resetScript,
    `#!/usr/bin/env bash
echo "reset $* GH_TOKEN=\${GH_TOKEN:-}" >> ${JSON.stringify(log)}
while [ $# -gt 0 ]; do
  case "$1" in
    --scenario) s="$2"; shift 2 ;; --repo) r="$2"; shift 2 ;; --dry-run) d=true; shift ;; *) shift ;;
  esac
done
printf '{"scenario":"%s","repo":"%s","mainSha":"abc","dryRun":%s,"source":"fixture","prs":[]}\\n' "$s" "$r" "\${d:-false}"
`,
  );

  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh
echo "gh $* GH_TOKEN=\${GH_TOKEN:-}" >> ${JSON.stringify(log)}
f="${repos}/$(echo "$3" | sed 's|/|__|')"
case "$1 $2" in
  'auth token') echo "tok-$4" ;;
  'repo view')
    if [ -f "$f" ]; then
      printf '{"nameWithOwner":"%s","url":"https://github.com/%s","defaultBranchRef":{"name":"main"}}\\n' "$3" "$3"
    else
      echo "GraphQL: Could not resolve to a Repository with the name '$3'. (repository)" >&2; exit 1
    fi ;;
  'repo create') touch "$f" ;;
  'repo delete')
    if [ -f ${JSON.stringify(join(dir, 'no-scope'))} ]; then
      echo 'HTTP 403: Must have admin rights to Repository. This API operation needs the "delete_repo" scope.' >&2; exit 1
    fi
    rm -f "$f" ;;
  *) echo "unexpected gh call" >&2; exit 1 ;;
esac
`,
  );

  // Real git for everything except the two network calls: clone makes a local repo whose
  // origin is the URL it was handed, and fetch succeeds without going anywhere.
  writeFileSync(
    join(bin, 'git'),
    `#!/bin/sh
case "$1" in
  clone)
    echo "git $*" >> ${JSON.stringify(log)}
    url="$3"; dest="$4"
    ${realGit} init -q "$dest" && ${realGit} -C "$dest" remote add origin "$url"
    mkdir -p "$dest/scripts" && cp ${JSON.stringify(resetScript)} "$dest/scripts/reset-scenario.sh"
    exit 0 ;;
esac
if [ "$1" = -C ] && [ "$3" = fetch ]; then echo "git $*" >> ${JSON.stringify(log)}; exit 0; fi
exec ${realGit} "$@"
`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  chmodSync(join(bin, 'git'), 0o755);

  const saved = {
    PATH: process.env.PATH,
    FIXTURE_REMOTE: process.env.FIXTURE_REMOTE,
    MY_COMMAND_GIT_HOST: process.env.MY_COMMAND_GIT_HOST,
  };
  process.env.PATH = `${bin}:${saved.PATH}`;
  delete process.env.FIXTURE_REMOTE;
  delete process.env.MY_COMMAND_GIT_HOST;
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  h = { dir, root, repos, log, restore };
});

afterEach(() => {
  h.restore();
  rmSync(h.dir, { recursive: true, force: true });
});

test('init creates both repos from the template as the owner and clones them over the git host', () => {
  const r = call(['init'], { 'git-host': 'github-personal' });
  assert.equal(r.identity, 'owner-scoped token (llevasseur)');
  assert.deepEqual(
    r.sandboxes.map((s) => [s.arm, s.nameWithOwner, s.created, s.cloned]),
    [
      ['a', 'llevasseur/my-command-ab-a', true, true],
      ['b', 'llevasseur/my-command-ab-b', true, true],
    ],
  );
  const log = calls();
  assert.match(
    log,
    /gh repo create llevasseur\/my-command-ab-a --template llevasseur\/my-command-fixture --private --include-all-branches GH_TOKEN=tok-llevasseur/,
  );
  assert.match(log, /git clone --quiet git@github-personal:llevasseur\/my-command-ab-b\.git /);

  const a = r.sandboxes[0];
  assert.equal(a.clone, join(h.root, 'a'));
  assert.equal(a.url, 'https://github.com/llevasseur/my-command-ab-a');
  assert.equal(a.defaultBranch, 'main');
  assert.equal(a.local.state, 'clone');
  assert.deepEqual(a.env, {
    CLAUDE_PROXY_STORE: join(h.root, 'a', 'fixtures', 'claude-proxy-store', 'logs', 'sessions'),
    LOG_DIR: join(h.root, 'a', 'fixtures', 'claude-proxy-store', 'logs'),
  });
});

test('init a second time reuses both repos and both clones', () => {
  call(['init']);
  writeFileSync(h.log, '');
  const r = call(['init']);
  assert.deepEqual(
    r.sandboxes.map((s) => [s.created, s.cloned]),
    [
      [false, false],
      [false, false],
    ],
  );
  assert.doesNotMatch(calls(), /repo create|git clone/);
});

test('init refuses a clone path that holds another repo, or something that is not a clone', () => {
  mkdirSync(join(h.root, 'a'), { recursive: true });
  writeFileSync(join(h.root, 'a', 'notes.txt'), 'mine\n');
  assert.throws(() => call(['init']), /is not a git clone/);

  rmSync(join(h.root, 'a'), { recursive: true });
  execFileSync(realGit, ['init', '-q', join(h.root, 'a')]);
  execFileSync(realGit, ['-C', join(h.root, 'a'), 'remote', 'add', 'origin', 'git@github.com:someone/else.git']);
  assert.throws(() => call(['init']), /is a clone of git@github\.com:someone\/else\.git/);
});

test('owner and names come from flags', () => {
  const r = call(['init'], { owner: 'me', 'name-a': 'left', 'name-b': 'right' });
  assert.deepEqual(
    r.sandboxes.map((s) => s.nameWithOwner),
    ['me/left', 'me/right'],
  );
  assert.equal(r.sandboxes[0].cloneUrl, 'git@github.com:me/left.git');
});

test('the git host falls back to MY_COMMAND_GIT_HOST', () => {
  process.env.MY_COMMAND_GIT_HOST = 'gh-alias';
  const r = call(['status']);
  assert.equal(r.sandboxes[1].cloneUrl, 'git@gh-alias:llevasseur/my-command-ab-b.git');
});

test('status reports without creating, cloning, or fetching anything', () => {
  const r = call(['status']);
  assert.deepEqual(
    r.sandboxes.map((s) => [s.arm, s.repo, s.local.state, s.url]),
    [
      ['a', 'absent', 'absent', null],
      ['b', 'absent', 'absent', null],
    ],
  );
  assert.doesNotMatch(calls(), /repo create|repo delete|git clone|fetch/);
  assert.equal(existsSync(h.root), false);
});

test('reset fetches each clone, then runs its own reset script with the fixture remote', () => {
  call(['init'], { 'git-host': 'github-personal' });
  writeFileSync(h.log, '');
  const r = call(['reset'], { scenario: 'stacked-prs', 'git-host': 'github-personal', 'dry-run': true });
  assert.equal(r.fixtureRemote, 'git@github-personal:llevasseur/my-command-fixture.git');
  assert.deepEqual(
    r.sandboxes.map((s) => [s.arm, s.reset.scenario, s.reset.repo, s.reset.dryRun]),
    [
      ['a', 'stacked-prs', 'llevasseur/my-command-ab-a', true],
      ['b', 'stacked-prs', 'llevasseur/my-command-ab-b', true],
    ],
  );
  const lines = calls().split('\n');
  const fetchA = lines.findIndex((l) => l.startsWith('git -C') && l.includes(join(h.root, 'a')) && l.includes('fetch'));
  const resetA = lines.findIndex((l) => l.startsWith('reset') && l.includes('my-command-ab-a'));
  assert.ok(fetchA !== -1 && resetA > fetchA, 'arm a is fetched before its reset runs');
  assert.match(
    lines[resetA],
    /--fixture-remote git@github-personal:llevasseur\/my-command-fixture\.git --dry-run GH_TOKEN=tok-llevasseur/,
  );
});

test('reset takes the fixture remote from the flag, then FIXTURE_REMOTE', () => {
  call(['init']);
  process.env.FIXTURE_REMOTE = 'file:///env/fixture.git';
  assert.equal(call(['reset'], { scenario: 'baseline' }).fixtureRemote, 'file:///env/fixture.git');
  assert.equal(
    call(['reset'], { scenario: 'baseline', 'fixture-remote': 'file:///flag.git' }).fixtureRemote,
    'file:///flag.git',
  );
});

test('reset refuses without a scenario, and before init', () => {
  assert.throws(() => call(['reset']), /--scenario/);
  assert.throws(() => call(['reset'], { scenario: 'baseline' }), /sandbox init/);
});

test('destroy refuses without --yes and calls nothing', () => {
  call(['init']);
  writeFileSync(h.log, '');
  assert.throws(() => call(['destroy']), /--yes/);
  assert.equal(calls(), '');
  assert.equal(existsSync(join(h.root, 'a')), true);
});

test('destroy deletes both repos, then both clones, and a second destroy finds nothing', () => {
  call(['init']);
  const r = call(['destroy'], { yes: true });
  assert.deepEqual(
    r.sandboxes.map((s) => [s.arm, s.repo, s.local]),
    [
      ['a', 'deleted', 'removed'],
      ['b', 'deleted', 'removed'],
    ],
  );
  assert.equal(existsSync(repoFile('llevasseur/my-command-ab-a')), false);
  assert.equal(existsSync(join(h.root, 'b')), false);

  const again = call(['destroy'], { yes: true });
  assert.deepEqual(
    again.sandboxes.map((s) => [s.repo, s.local]),
    [
      ['already-absent', 'already-absent'],
      ['already-absent', 'already-absent'],
    ],
  );
});

test('destroy without the delete_repo scope reports it, never requests it, and keeps the clone', () => {
  call(['init']);
  writeFileSync(join(h.dir, 'no-scope'), '');
  assert.throws(
    () => call(['destroy'], { yes: true }),
    (/** @type {any} */ err) => err.detail.missingScope === 'delete_repo' && /delete_repo/.test(err.message),
  );
  assert.doesNotMatch(calls(), /auth refresh/);
  assert.equal(existsSync(join(h.root, 'a')), true);
});

test('an unknown subcommand is a usage error', () => {
  assert.throws(
    () => call(['nuke']),
    (/** @type {any} */ err) => err.exitCode === 2,
  );
});
