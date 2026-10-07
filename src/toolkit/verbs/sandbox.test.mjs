// `sandbox` against a stub `gh` and stub `git clone`/`fetch`: no GitHub, no network. The stub
// `gh` keeps the repos it "created" as files, so idempotence is checked as state. HOME points
// into the scratch dir, so ~/.my-command/ab/config.json is the test's own.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { flagsFrom } from '../lib/flags.mjs';
import { run as sandbox } from './sandbox.mjs';

const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();

/** @type {{dir: string, home: string, root: string, repos: string, log: string, restore: () => void}} */
let h;

/**
 * Every call names a template unless the test passes `template: undefined`, since most tests
 * are about something else.
 * @param {string[]} positionals @param {Record<string, string | true | undefined>} [flags]
 * @returns {{sandboxes: any[], [field: string]: any}}
 */
const call = (positionals, flags = {}) => {
  /** @type {Record<string, string | true>} */
  const merged = {};
  for (const [k, v] of Object.entries({ root: h.root, template: 'octo/fixture-template', ...flags })) {
    if (v !== undefined) merged[k] = v;
  }
  return sandbox(/** @type {never} */ ({ verb: 'sandbox', cwd: h.dir, positionals, flags: flagsFrom(merged) }));
};

const calls = () => (existsSync(h.log) ? readFileSync(h.log, 'utf8') : '');
/** @param {string} slug */
const repoFile = (slug) => join(h.repos, slug.replace('/', '__'));
/** @param {string} body */
const writeConfig = (body) => {
  mkdirSync(join(h.home, '.my-command', 'ab'), { recursive: true });
  writeFileSync(join(h.home, '.my-command', 'ab', 'config.json'), body);
};
/** The github.com logins `gh auth status` reports. @param {string[]} logins */
const loggedIn = (logins) => writeFileSync(join(h.dir, 'accounts'), logins.map((l) => `${l}\n`).join(''));

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'mct-sandbox-'));
  const bin = join(dir, 'bin');
  const repos = join(dir, 'repos');
  const root = join(dir, 'sandboxes');
  const home = join(dir, 'home');
  const log = join(dir, 'calls.log');
  mkdirSync(bin);
  mkdirSync(repos);
  mkdirSync(home);
  writeFileSync(join(dir, 'accounts'), 'octo\n');

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

  const accounts = join(dir, 'accounts');
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh
echo "gh $* GH_TOKEN=\${GH_TOKEN:-}" >> ${JSON.stringify(log)}
f="${repos}/$(echo "$3" | sed 's|/|__|')"
case "$1 $2" in
  'auth token') echo "tok-$4" ;;
  'auth status')
    echo "github.com"
    first=true
    while read -r login; do
      echo "  ✓ Logged in to github.com account $login (keyring)"
      echo "  - Active account: $first"
      first=false
    done < ${JSON.stringify(accounts)} ;;
  'api user') head -n 1 ${JSON.stringify(accounts)} ;;
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
  // origin is the URL it was handed, carrying the reset script and, unless the test removed
  // it, the synthetic store; fetch succeeds without going anywhere.
  writeFileSync(
    join(bin, 'git'),
    `#!/bin/sh
case "$1" in
  clone)
    echo "git $*" >> ${JSON.stringify(log)}
    url="$3"; dest="$4"
    ${realGit} init -q "$dest" && ${realGit} -C "$dest" remote add origin "$url"
    mkdir -p "$dest/scripts" && cp ${JSON.stringify(resetScript)} "$dest/scripts/reset-scenario.sh"
    [ -f ${JSON.stringify(join(dir, 'no-store'))} ] || mkdir -p "$dest/fixtures/claude-proxy-store/logs/sessions"
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
    HOME: process.env.HOME,
    FIXTURE_REMOTE: process.env.FIXTURE_REMOTE,
    MY_COMMAND_GIT_HOST: process.env.MY_COMMAND_GIT_HOST,
    MY_COMMAND_SANDBOX_ROOT: process.env.MY_COMMAND_SANDBOX_ROOT,
    MY_COMMAND_AB_OWNER: process.env.MY_COMMAND_AB_OWNER,
    MY_COMMAND_AB_TEMPLATE: process.env.MY_COMMAND_AB_TEMPLATE,
  };
  process.env.PATH = `${bin}:${saved.PATH}`;
  process.env.HOME = home;
  for (const k of Object.keys(saved)) if (k !== 'PATH' && k !== 'HOME') delete process.env[k];
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  h = { dir, home, root, repos, log, restore };
});

afterEach(() => {
  h.restore();
  rmSync(h.dir, { recursive: true, force: true });
});

test('init creates both repos from the template as the owner and clones them over the git host', () => {
  const r = call(['init'], { owner: 'octo', 'git-host': 'github-personal' });
  assert.equal(r.identity, 'owner-scoped token (octo)');
  assert.deepEqual(
    r.sandboxes.map((s) => [s.arm, s.nameWithOwner, s.created, s.cloned]),
    [
      ['a', 'octo/my-command-ab-a', true, true],
      ['b', 'octo/my-command-ab-b', true, true],
    ],
  );
  const log = calls();
  assert.match(
    log,
    /gh repo create octo\/my-command-ab-a --template octo\/fixture-template --private --include-all-branches GH_TOKEN=tok-octo/,
  );
  assert.match(log, /git clone --quiet git@github-personal:octo\/my-command-ab-b\.git /);

  const a = r.sandboxes[0];
  assert.equal(a.clone, join(h.root, 'a'));
  assert.equal(a.url, 'https://github.com/octo/my-command-ab-a');
  assert.equal(a.defaultBranch, 'main');
  assert.equal(a.local.state, 'clone');
  assert.deepEqual(a.env, {
    CLAUDE_PROXY_STORE: join(h.root, 'a', 'fixtures', 'claude-proxy-store', 'logs', 'sessions'),
    LOG_DIR: join(h.root, 'a', 'fixtures', 'claude-proxy-store', 'logs'),
  });
  assert.equal(a.warning, undefined);
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

test('names come from flags', () => {
  const r = call(['init'], { owner: 'me', 'name-a': 'left', 'name-b': 'right' });
  assert.deepEqual(
    r.sandboxes.map((s) => s.nameWithOwner),
    ['me/left', 'me/right'],
  );
  assert.equal(r.sandboxes[0].cloneUrl, 'git@github.com:me/left.git');
});

test('init and reset refuse with no template, naming all three sources and /ab-bootstrap', () => {
  for (const args of [['init'], ['reset']]) {
    assert.throws(
      () => call(args, { template: undefined, scenario: 'baseline' }),
      (/** @type {any} */ err) =>
        err.exitCode === 2 &&
        /--template/.test(err.message) &&
        /MY_COMMAND_AB_TEMPLATE/.test(err.message) &&
        /~\/\.my-command\/ab\/config\.json/.test(err.message) &&
        /\/ab-bootstrap/.test(err.message),
    );
  }
  assert.doesNotMatch(calls(), /gh /, 'a missing template is refused before any gh call');
});

test('status and destroy need no template', () => {
  const r = call(['status'], { template: undefined });
  assert.equal(r.template, null);
  assert.equal(call(['destroy'], { template: undefined, yes: true }).sandboxes.length, 2);
});

test('the template comes from the flag, then MY_COMMAND_AB_TEMPLATE, then the config file', () => {
  writeConfig(JSON.stringify({ template: 'cfg/template' }));
  assert.equal(call(['status'], { template: undefined }).template, 'cfg/template');
  process.env.MY_COMMAND_AB_TEMPLATE = 'env/template';
  assert.equal(call(['status'], { template: undefined }).template, 'env/template');
  assert.equal(call(['status'], { template: 'flag/template' }).template, 'flag/template');
});

test('a template that is not owner/name is a usage error', () => {
  assert.throws(
    () => call(['init'], { template: 'just-a-name' }),
    (/** @type {any} */ err) => err.exitCode === 2 && /<owner\/name>/.test(err.message),
  );
});

test('the owner comes from the flag, then MY_COMMAND_AB_OWNER, then the config file, then the gh login', () => {
  const owner = () => {
    const r = call(['status']);
    return [r.owner, r.ownerSource];
  };
  assert.deepEqual(owner(), ['octo', 'gh-login']);
  assert.match(calls(), /gh api user --jq \.login/);

  writeConfig(JSON.stringify({ owner: 'cfg-owner' }));
  assert.deepEqual(owner(), ['cfg-owner', 'config']);
  process.env.MY_COMMAND_AB_OWNER = 'env-owner';
  assert.deepEqual(owner(), ['env-owner', 'env']);
  const r = call(['status'], { owner: 'flag-owner' });
  assert.deepEqual([r.owner, r.ownerSource], ['flag-owner', 'flag']);
  assert.equal(r.sandboxes[0].nameWithOwner, 'flag-owner/my-command-ab-a');
});

test('the gh-login fallback is refused when more than one github.com account is logged in', () => {
  loggedIn(['octo', 'octo-work']);
  assert.throws(
    () => call(['status']),
    (/** @type {any} */ err) =>
      err.exitCode === 2 &&
      /more than one gh account/.test(err.message) &&
      /--owner/.test(err.message) &&
      /config\.json/.test(err.message),
  );
  assert.doesNotMatch(calls(), /api user/);
  // A named owner never reaches the fallback, so two logins are fine.
  assert.equal(call(['status'], { owner: 'octo' }).ownerSource, 'flag');
});

test('root and git host fall back to their env vars, then the config file', () => {
  writeConfig(JSON.stringify({ root: join(h.dir, 'cfg-root'), gitHost: 'cfg-host' }));
  let r = call(['status'], { root: undefined });
  assert.equal(r.root, join(h.dir, 'cfg-root'));
  assert.equal(r.sandboxes[1].cloneUrl, 'git@cfg-host:octo/my-command-ab-b.git');

  process.env.MY_COMMAND_SANDBOX_ROOT = join(h.dir, 'env-root');
  process.env.MY_COMMAND_GIT_HOST = 'gh-alias';
  r = call(['status'], { root: undefined });
  assert.equal(r.root, join(h.dir, 'env-root'));
  assert.equal(r.sandboxes[1].cloneUrl, 'git@gh-alias:octo/my-command-ab-b.git');

  assert.equal(
    call(['status'], { 'git-host': 'flag-host' }).sandboxes[0].cloneUrl,
    'git@flag-host:octo/my-command-ab-a.git',
  );
});

test('a malformed config file is a clear error, and a missing one is fine', () => {
  assert.equal(call(['status']).ownerSource, 'gh-login');
  writeConfig('{ "owner": ');
  assert.throws(() => call(['status']), /config\.json is not valid JSON/);
  writeConfig('["octo"]');
  assert.throws(() => call(['status']), /config\.json must hold a JSON object/);
  writeConfig(JSON.stringify({ owner: 42 }));
  assert.throws(() => call(['status']), /"owner" must be a non-empty string/);
});

test('a template with no synthetic store exports no env and says why', () => {
  writeFileSync(join(h.dir, 'no-store'), '');
  const r = call(['init']);
  for (const s of r.sandboxes) {
    assert.deepEqual(s.env, {});
    assert.match(s.warning, /no synthetic store/);
  }
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
  // No clone yet means no store to point at, and nothing to warn about.
  assert.deepEqual(r.sandboxes[0].env, {});
  assert.equal(r.sandboxes[0].warning, undefined);
  assert.doesNotMatch(calls(), /repo create|repo delete|git clone|fetch/);
  assert.equal(existsSync(h.root), false);
});

test('reset fetches each clone, then runs its own reset script with the fixture remote', () => {
  call(['init'], { 'git-host': 'github-personal' });
  writeFileSync(h.log, '');
  const r = call(['reset'], { scenario: 'stacked-prs', 'git-host': 'github-personal', 'dry-run': true });
  assert.equal(r.fixtureRemote, 'git@github-personal:octo/fixture-template.git');
  assert.deepEqual(
    r.sandboxes.map((s) => [s.arm, s.reset.scenario, s.reset.repo, s.reset.dryRun]),
    [
      ['a', 'stacked-prs', 'octo/my-command-ab-a', true],
      ['b', 'stacked-prs', 'octo/my-command-ab-b', true],
    ],
  );
  const lines = calls().split('\n');
  const fetchA = lines.findIndex((l) => l.startsWith('git -C') && l.includes(join(h.root, 'a')) && l.includes('fetch'));
  const resetA = lines.findIndex((l) => l.startsWith('reset') && l.includes('my-command-ab-a'));
  assert.ok(fetchA !== -1 && resetA > fetchA, 'arm a is fetched before its reset runs');
  assert.match(
    lines[resetA],
    /--fixture-remote git@github-personal:octo\/fixture-template\.git --dry-run GH_TOKEN=tok-octo/,
  );
});

test('reset takes the fixture remote from the flag, then FIXTURE_REMOTE, and then needs no template', () => {
  call(['init']);
  process.env.FIXTURE_REMOTE = 'file:///env/fixture.git';
  assert.equal(call(['reset'], { scenario: 'baseline', template: undefined }).fixtureRemote, 'file:///env/fixture.git');
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
  assert.equal(existsSync(repoFile('octo/my-command-ab-a')), false);
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
