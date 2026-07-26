// Path resolution is what makes a bare `my-command-tools` call work, so the lookup is
// tested against a real directory rather than trusted: the failure it guards against
// (an installed-but-unreachable shim) is silent everywhere else.
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { after, test } from 'node:test';
import { deviceShim, findOnPath, linkDirs, pathDirs, TOOLKIT_BIN } from './paths.mjs';

/** @type {string[]} */
const made = [];

/** A throwaway dir holding one executable named `bin`, plus one that isn't. */
function binDir() {
  const dir = mkdtempSync(join(tmpdir(), 'mct-path-'));
  made.push(dir);
  return dir;
}

after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

test('pathDirs splits PATH and drops empty entries', () => {
  const dirs = pathDirs({ PATH: ['/a', '', '/b'].join(delimiter) });
  assert.deepEqual(dirs, ['/a', '/b']);
});

test('pathDirs normalizes a trailing slash so a dir compares equal either way', () => {
  assert.deepEqual(pathDirs({ PATH: `/a/${delimiter}/b` }), ['/a', '/b']);
  // Root is a single slash and must survive intact.
  assert.deepEqual(pathDirs({ PATH: '/' }), ['/']);
});

test('pathDirs on an absent PATH is empty rather than throwing', () => {
  assert.deepEqual(pathDirs({}), []);
});

test('findOnPath returns the first executable match', () => {
  const first = binDir();
  const second = binDir();
  for (const dir of [first, second]) {
    writeFileSync(join(dir, TOOLKIT_BIN), '#!/bin/sh\n');
    chmodSync(join(dir, TOOLKIT_BIN), 0o755);
  }
  const found = findOnPath(TOOLKIT_BIN, { PATH: [first, second].join(delimiter) });
  assert.equal(found, join(first, TOOLKIT_BIN));
});

test('findOnPath skips a match that is present but not executable', () => {
  const bare = binDir();
  const real = binDir();
  writeFileSync(join(bare, TOOLKIT_BIN), 'not executable\n');
  chmodSync(join(bare, TOOLKIT_BIN), 0o644);
  writeFileSync(join(real, TOOLKIT_BIN), '#!/bin/sh\n');
  chmodSync(join(real, TOOLKIT_BIN), 0o755);

  const found = findOnPath(TOOLKIT_BIN, { PATH: [bare, real].join(delimiter) });
  assert.equal(found, join(real, TOOLKIT_BIN), 'a non-executable file must not shadow the real one');
});

test('findOnPath returns null when PATH has no match', () => {
  assert.equal(findOnPath(TOOLKIT_BIN, { PATH: binDir() }), null);
});

test('findOnPath ignores a directory that merely shares the name', () => {
  const dir = binDir();
  mkdirSync(join(dir, TOOLKIT_BIN));
  // A directory carries the execute bit as "searchable", so X_OK alone would match it.
  assert.equal(findOnPath(TOOLKIT_BIN, { PATH: dir }), null);
});

test('deviceShim sits under the configured Claude dir and is what a link points at', () => {
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = '/tmp/claude-cfg';
  try {
    assert.equal(deviceShim(), join('/tmp/claude-cfg', 'my-command', 'bin', TOOLKIT_BIN));
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  }
});

test('linkDirs prefers ~/.local/bin and stays user-owned', () => {
  const dirs = linkDirs();
  assert.ok(dirs[0].endsWith(join('.local', 'bin')));
  assert.equal(dirs.length, 2);
  // Never a system path: linking there would need elevation.
  for (const dir of dirs) assert.ok(!dir.startsWith('/usr'), `${dir} must be under $HOME`);
});
