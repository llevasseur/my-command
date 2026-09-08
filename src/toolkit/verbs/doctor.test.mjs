// `doctor`'s two device-level facts.
//
// Playwright: the probe order, that a missing binary is an answer rather than a throw, and
// that the time bound is real.
//
// Device git excludes: that a partial state reads as one pattern present and one missing,
// and that the installer writing those patterns is idempotent and never touches a
// repository's own `.gitignore` — checked by running the real installer against a
// sandboxed HOME and git config, twice.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  boundedProbe,
  DEVICE_IGNORE_PATTERNS,
  defaultExcludesFile,
  run as doctor,
  expandTilde,
  gitExcludes,
  PLAYWRIGHT_INSTALL_HINT,
  PLAYWRIGHT_PROBES,
  playwright,
} from './doctor.mjs';

/**
 * A stub runner over a map of `cmd` to canned output, recording what it was asked.
 * @param {Record<string, string>} answers
 */
function stub(answers) {
  /** @type {string[][]} */
  const calls = [];
  /** @param {string} cmd @param {string[]} args */
  const runner = (cmd, args) => {
    calls.push([cmd, ...args]);
    const stdout = answers[cmd];
    return stdout === undefined ? { ok: false, stdout: '' } : { ok: true, stdout };
  };
  return { runner, calls };
}

test('the global CLI answers first and nothing else is probed', () => {
  const { runner, calls } = stub({ 'playwright-cli': 'Version 1.49.0\n', npx: '1.40.0\n' });
  assert.deepEqual(playwright(runner), { installed: true, version: '1.49.0', source: 'playwright-cli' });
  // The second probe must not run once the first resolved.
  assert.equal(calls.length, 1);
});

test('npx answers when the global CLI is absent', () => {
  const { runner, calls } = stub({ npx: '1.40.0\n' });
  assert.deepEqual(playwright(runner), { installed: true, version: '1.40.0', source: 'npx' });
  assert.equal(calls.length, 2);
});

test('neither probe resolving is a report, not a failure', () => {
  const { runner } = stub({});
  assert.deepEqual(playwright(runner), { installed: false, version: null, source: null });
});

test('a zero exit that printed no version keeps looking', () => {
  const { runner } = stub({ 'playwright-cli': '  \n', npx: '1.40.0\n' });
  assert.deepEqual(playwright(runner), { installed: true, version: '1.40.0', source: 'npx' });
});

test('the npx probe never installs', () => {
  const npx = PLAYWRIGHT_PROBES.find((p) => p.source === 'npx');
  assert.ok(npx, 'the npx probe is registered');
  assert.ok(npx.args.includes('--no-install'));
  // Every probe is a version read and nothing else.
  for (const p of PLAYWRIGHT_PROBES) assert.ok(p.args.includes('--version'));
  // The installer echoes the hint, so it must stay a single command.
  assert.ok(!PLAYWRIGHT_INSTALL_HINT.includes('\n'));
});

test('a missing binary is answered rather than thrown', () => {
  assert.deepEqual(boundedProbe('my-command-no-such-binary-xyz', ['--version']), { ok: false, stdout: '' });
});

test('a probe that would hang is abandoned at its bound', () => {
  const started = Date.now();
  const r = boundedProbe(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], 300);
  assert.equal(r.ok, false);
  // Generous headroom over the 300ms bound: the assertion is "bounded", not "prompt".
  assert.ok(Date.now() - started < 10_000, 'the probe returned well before the child would have');
});

test('the marketplace installer prints that command, and installs nothing', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const installer = readFileSync(join(repoRoot, 'scripts', 'install-marketplace-personal.sh'), 'utf8');
  // Pinned to the export so the two cannot drift apart.
  assert.ok(installer.includes(PLAYWRIGHT_INSTALL_HINT), 'the installer names the hint verbatim');
  // Every line mentioning Playwright must be a comment, the hint's own assignment, an
  // `echo`, or the non-installing `doctor` probe — never an install.
  for (const line of installer.split('\n')) {
    if (!/playwright/i.test(line)) continue;
    assert.ok(
      /^\s*#/.test(line) ||
        /^\s*PLAYWRIGHT_HINT=/.test(line) ||
        /^\s*DEVICE_IGNORE_PATTERNS=/.test(line) ||
        line.includes('echo') ||
        line.includes('playwright_state') ||
        /"playwright":/.test(line),
      `no line may install Playwright: ${line}`,
    );
  }
  // No browser download, in any wording.
  assert.doesNotMatch(installer, /playwright\s+install/);
});

test('doctor reports the playwright object on this device, whatever it holds', () => {
  const result = /** @type {{playwright: {installed: boolean, version: string | null, source: string | null}}} */ (
    doctor()
  );
  const { installed, version, source } = result.playwright;
  // The three fields agree either way: a probe that resolved names a version and itself,
  // one that did not nulls both.
  if (installed === true) {
    assert.ok(version !== null && version.length > 0, 'an installed Playwright names a version');
    assert.ok(
      PLAYWRIGHT_PROBES.some((p) => p.source === source),
      `source names a probe: ${source}`,
    );
  } else {
    assert.equal(installed, false);
    assert.equal(version, null);
    assert.equal(source, null);
  }
});

// --- device git excludes -----------------------------------------------------------

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const INSTALLER = join(REPO_ROOT, 'scripts', 'install-marketplace-personal.sh');

/**
 * `gitExcludes` over canned IO, so no test reads the real device.
 * @param {string | null} configured
 * @param {string | null} contents
 */
function excludesOver(configured, contents) {
  return gitExcludes({ config: () => configured, readFile: () => contents });
}

test('the default excludes path is derived, never a baked-in home', () => {
  assert.equal(defaultExcludesFile({ XDG_CONFIG_HOME: '/xdg' }, '/home/someone'), join('/xdg', 'git', 'ignore'));
  // Empty is as good as unset: an exported-but-blank XDG_CONFIG_HOME must not yield `/git/ignore`.
  assert.equal(defaultExcludesFile({ XDG_CONFIG_HOME: '' }, '/home/someone'), '/home/someone/.config/git/ignore');
  assert.equal(defaultExcludesFile({}, '/home/someone'), '/home/someone/.config/git/ignore');
  // The committed source may not name one device's home.
  assert.doesNotMatch(readFileSync(INSTALLER, 'utf8'), /\/Users\/[a-z]/i);
});

test('a tilde in the configured path is expanded at read time', () => {
  assert.equal(expandTilde('~/.gitignore', '/home/someone'), '/home/someone/.gitignore');
  assert.equal(expandTilde('~', '/home/someone'), '/home/someone');
  // Not a home reference: left exactly as git stored it.
  assert.equal(expandTilde('/etc/gitignore', '/home/someone'), '/etc/gitignore');
  assert.equal(expandTilde('~someone/.gitignore', '/home/someone'), '~someone/.gitignore');
  const r = excludesOver('~/.gitignore', DEVICE_IGNORE_PATTERNS.join('\n'));
  assert.equal(r.path?.startsWith('~'), false, 'the reported path is resolved, not the stored spelling');
});

test('an unset core.excludesFile still reports the file git effectively reads', () => {
  const r = excludesOver(null, null);
  assert.equal(r.configured, false);
  // git honors its XDG default with the config unset, so reporting null there would call a
  // file git is reading absent.
  assert.equal(r.path, defaultExcludesFile());
  assert.equal(r.exists, false);
  assert.deepEqual(r.missing, DEVICE_IGNORE_PATTERNS);
  assert.equal(r.complete, false);
  assert.ok(r.hint?.includes(defaultExcludesFile()));
});

test('an unconfigured but already-populated default file reads as complete', () => {
  const r = excludesOver(null, DEVICE_IGNORE_PATTERNS.join('\n'));
  assert.equal(r.configured, false);
  assert.equal(r.exists, true);
  assert.equal(r.complete, true, 'the config being unset does not make the patterns absent');
});

test('a half-written excludes file reads as partial, not as false', () => {
  const r = excludesOver('/tmp/ignore', '.my-command/\n');
  assert.equal(r.configured, true);
  assert.equal(r.path, '/tmp/ignore');
  assert.equal(r.exists, true);
  assert.deepEqual(r.patterns, { '.playwright-cli/': false, '.my-command/': true });
  assert.deepEqual(r.missing, ['.playwright-cli/']);
  assert.equal(r.complete, false);
  // The hint names only what is missing, so following it cannot duplicate the other.
  assert.ok(r.hint?.includes('.playwright-cli/'));
  assert.ok(!r.hint?.includes("'.my-command/'"));
});

test('both patterns present is complete, with nothing left to hint at', () => {
  const r = excludesOver('/tmp/ignore', `# mine\nnode_modules\n${DEVICE_IGNORE_PATTERNS.join('\n')}\n`);
  assert.equal(r.complete, true);
  assert.deepEqual(r.missing, []);
  assert.equal(r.hint, null);
});

test('the slashless spelling counts, and a commented-out one does not', () => {
  assert.equal(excludesOver('/tmp/ignore', '.playwright-cli\n.my-command\n').complete, true);
  const commented = excludesOver('/tmp/ignore', '#.playwright-cli/\n#.my-command/\n');
  assert.equal(commented.complete, false);
  assert.deepEqual(commented.missing, DEVICE_IGNORE_PATTERNS);
});

test('a configured file that does not exist is reported as configured but absent', () => {
  const r = excludesOver(join(tmpdir(), 'my-command-no-such-excludes-xyz'), null);
  assert.equal(r.configured, true);
  assert.equal(r.exists, false);
  assert.equal(r.complete, false);
});

test('doctor reports gitExcludes on this device, and its fields agree', () => {
  const r = /** @type {{gitExcludes: ReturnType<typeof gitExcludes>}} */ (doctor()).gitExcludes;
  assert.deepEqual(Object.keys(r.patterns).sort(), [...DEVICE_IGNORE_PATTERNS].sort());
  assert.equal(r.complete, r.missing.length === 0);
  assert.equal(r.hint === null, r.complete);
  assert.ok(r.path.length > 0, 'a path is always named, configured or not');
  if (!r.configured) assert.equal(r.path, defaultExcludesFile());
  for (const p of DEVICE_IGNORE_PATTERNS) assert.equal(r.patterns[p], !r.missing.includes(p));
});

test('the installer names every pattern verbatim and no repository .gitignore', () => {
  const installer = readFileSync(INSTALLER, 'utf8');
  for (const p of DEVICE_IGNORE_PATTERNS) {
    assert.ok(installer.includes(`'${p}'`), `the installer names ${p} verbatim`);
  }
  // The whole point of the field: one device-level ignore, never a per-repo edit.
  assert.ok(!installer.includes('.gitignore'), 'the installer never mentions a repository .gitignore');
  // Appended, never rewritten.
  assert.ok(installer.includes('>>"$file"'), 'the excludes file is appended to');
  // Every failure path around the config is swallowed, so an unwritable device still installs.
  assert.ok(installer.includes('git config --global core.excludesFile "$file" 2>/dev/null'));
});

/**
 * The sandbox environment: a throwaway HOME and git config, so nothing the installer does
 * reaches this device.
 * @param {string} home
 * @returns {NodeJS.ProcessEnv}
 */
function sandboxEnv(home) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, HOME: home, GIT_CONFIG_GLOBAL: join(home, '.gitconfig') };
  // Deleted rather than set, so the `${XDG_CONFIG_HOME:-$HOME/.config}` fallback is what runs.
  delete env.XDG_CONFIG_HOME;
  return env;
}

/**
 * Run the real installer against that sandbox. `--excludes-only` by default: the ignore
 * step is what these tests are about, and reinstalling forty command files to reach it
 * costs ~10s a call.
 * @param {string} home
 * @param {string} sandbox
 * @param {string[]} [args]
 * @returns {string}
 */
function runInstaller(home, sandbox, args = ['--excludes-only']) {
  const env = sandboxEnv(home);
  env.CLAUDE_COMMANDS_DIR = join(sandbox, 'commands');
  env.CLAUDE_AGENTS_DIR = join(sandbox, 'agents');
  return execFileSync('bash', [INSTALLER, ...args], { cwd: REPO_ROOT, env, encoding: 'utf8' });
}

test('the installer writes the device excludes file, and a second run changes nothing', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'my-command-excludes-'));
  const home = join(sandbox, 'home');
  mkdirSync(home, { recursive: true });
  const excludes = join(home, '.config', 'git', 'ignore');
  const repoIgnore = join(REPO_ROOT, '.gitignore');
  const repoIgnoreBefore = readFileSync(repoIgnore, 'utf8');

  try {
    runInstaller(home, sandbox);

    const first = readFileSync(excludes, 'utf8');
    for (const p of DEVICE_IGNORE_PATTERNS) {
      const hits = first.split('\n').filter((l) => l === p).length;
      assert.equal(hits, 1, `${p} appears exactly once`);
    }
    // The config now points at the file the installer chose, spelled absolutely.
    const configured = execFileSync('git', ['config', '--global', 'core.excludesFile'], {
      env: sandboxEnv(home),
      encoding: 'utf8',
    }).trim();
    assert.equal(configured, excludes);
    // And doctor, reading that same sandbox, calls it complete.
    assert.equal(gitExcludes({ config: () => configured, readFile: (p) => readFileSync(p, 'utf8') }).complete, true);

    // The whole installer this time, not just the ignore step: the device ignore is
    // unchanged by it, and no repository's own ignore file is written — checked against
    // the filesystem rather than only against the installer's source text.
    runInstaller(home, sandbox, []);
    assert.equal(readFileSync(excludes, 'utf8'), first, 'the second run is byte-identical');
    assert.equal(readFileSync(repoIgnore, 'utf8'), repoIgnoreBefore, 'the repo .gitignore is untouched');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("the installer appends only what is missing, leaving the user's entries in place", () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'my-command-excludes-'));
  const home = join(sandbox, 'home');
  const excludes = join(home, 'my-own-ignore');
  mkdirSync(home, { recursive: true });
  // Deliberately unsorted, one of ours already present, and no trailing newline — the
  // shape that would otherwise get the next entry joined onto `.my-command/`.
  const seeded = 'zzz-last\n*.log\n.my-command/\n.DS_Store';
  writeFileSync(excludes, seeded, 'utf8');
  execFileSync('git', ['config', '--global', 'core.excludesFile', excludes], {
    env: sandboxEnv(home),
  });

  try {
    runInstaller(home, sandbox);

    const after = readFileSync(excludes, 'utf8');
    assert.ok(after.startsWith(seeded), "the user's entries are neither rewritten nor reordered");
    const lines = after.split('\n').filter((l) => l.length > 0);
    // Only the one missing pattern was added, and only once.
    assert.deepEqual(lines, ['zzz-last', '*.log', '.my-command/', '.DS_Store', '.playwright-cli/']);

    runInstaller(home, sandbox);
    assert.equal(readFileSync(excludes, 'utf8'), after, 'the second run is byte-identical');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('--excludes-only does the ignore and installs no command files', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'my-command-excludes-'));
  const home = join(sandbox, 'home');
  mkdirSync(home, { recursive: true });

  try {
    const out = runInstaller(home, sandbox);
    assert.equal(gitExcludes({ config: () => join(home, '.config', 'git', 'ignore') }).complete, true);
    assert.doesNotMatch(out, /marketplace command/, 'it stopped before the command install');
    assert.equal(existsSync(join(sandbox, 'commands')), false, 'no commands directory was created');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('an unwritable excludes path is reported, not fatal', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'my-command-excludes-'));
  const home = join(sandbox, 'home');
  mkdirSync(home, { recursive: true });
  // A path no user can create: the installer must still exit 0 and install the commands.
  execFileSync('git', ['config', '--global', 'core.excludesFile', '/proc/my-command/ignore'], {
    env: sandboxEnv(home),
  });

  try {
    // The whole installer, so the claim is the real one: an unwritable ignore path costs
    // the ignore and nothing else.
    const out = runInstaller(home, sandbox, []);
    assert.match(out, /Installed \d+ marketplace command\(s\)/, 'the install itself still completed');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
