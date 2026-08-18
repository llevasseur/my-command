// `stash` owns the /cp ring, so the ring's documented behaviour is asserted here rather than
// left to a prose rule in cp.md: five deep, oldest dropped, bytes preserved exactly, and a
// missing slot reported instead of copied as an empty clipboard.
//
// Every test passes --no-clipboard and points CLAUDE_CONFIG_DIR at a throwaway directory: a
// test run must never write the developer's real stash or take over their clipboard.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { flagsFrom } from '../lib/flags.mjs';
import { slotPath, run as stash, stashDir } from './stash.mjs';

/** @type {string[]} */
const made = [];
const original = process.env.CLAUDE_CONFIG_DIR;

after(() => {
  if (original === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = original;
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway config directory, installed as the one the verb resolves. */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'mct-stash-'));
  made.push(dir);
  process.env.CLAUDE_CONFIG_DIR = dir;
  return dir;
}

/**
 * @param {string} dir @param {string} content
 * @returns {string} the path handed to --content-file
 */
function source(dir, content) {
  const path = join(dir, 'compose.txt');
  writeFileSync(path, content);
  return path;
}

/** @param {string[]} positionals @param {Record<string, any>} [flags] */
const ctx = (positionals, flags = {}) => ({
  verb: 'stash',
  positionals,
  flags: flagsFrom({ 'no-clipboard': true, ...flags }),
  cwd: process.cwd(),
});

test('stash write installs the content file as the newest entry, byte for byte', () => {
  const dir = sandbox();
  // Quotes, a backslash and a newline are exactly what a shell-composed argument corrupts.
  const text = 'a "quoted" \\ line\nand a second\n';
  const result = /** @type {any} */ (stash(ctx(['write'], { 'content-file': source(dir, text) })));

  assert.equal(result.subcommand, 'write');
  assert.equal(result.path, join(dir, 'cp-last.txt'));
  assert.equal(readFileSync(result.path, 'utf8'), text);
  assert.equal(result.clipboard.copied, false);
  assert.equal(result.clipboard.reason, '--no-clipboard');
});

test('stash write rotates a five-deep ring and drops the oldest', () => {
  const dir = sandbox();
  for (const n of [1, 2, 3, 4, 5, 6]) {
    stash(ctx(['write'], { 'content-file': source(dir, `entry ${n}\n`) }));
  }

  assert.equal(readFileSync(slotPath(dir, 0), 'utf8'), 'entry 6\n');
  assert.equal(readFileSync(slotPath(dir, 1), 'utf8'), 'entry 5\n');
  assert.equal(readFileSync(slotPath(dir, 2), 'utf8'), 'entry 4\n');
  assert.equal(readFileSync(slotPath(dir, 3), 'utf8'), 'entry 3\n');
  assert.equal(readFileSync(slotPath(dir, 4), 'utf8'), 'entry 2\n');
  // The ring is five deep, so there is no slot 5 for `entry 1` to have survived into.
  assert.equal(existsSync(join(dir, 'cp-last.5.txt')), false);
});

test('stash restore returns a named slot and reads the entry that was written there', () => {
  const dir = sandbox();
  stash(ctx(['write'], { 'content-file': source(dir, 'older\n') }));
  stash(ctx(['write'], { 'content-file': source(dir, 'newest\n') }));

  const newest = /** @type {any} */ (stash(ctx(['restore'])));
  assert.equal(newest.slot, 0);
  assert.equal(readFileSync(newest.path, 'utf8'), 'newest\n');

  const older = /** @type {any} */ (stash(ctx(['restore', '1'])));
  assert.equal(older.slot, 1);
  assert.equal(readFileSync(older.path, 'utf8'), 'older\n');
});

test('stash restore reports a missing slot rather than copying an empty clipboard', () => {
  const dir = sandbox();
  assert.throws(
    () => stash(ctx(['restore'])),
    (err) => {
      assert.match(String(err), /slot 0 holds nothing/);
      assert.match(String(err), /clipboard was left alone/);
      return true;
    },
  );
  assert.equal(existsSync(slotPath(dir, 0)), false);
});

test('stash refuses a slot outside the ring instead of reading a path that can never fill', () => {
  sandbox();
  assert.throws(() => stash(ctx(['restore', '5'])), /not in the ring/);
  assert.throws(() => stash(ctx(['restore', 'newest'])), /not in the ring/);
});

test('stash write needs a content file, because the entry never arrives as an argument', () => {
  sandbox();
  assert.throws(() => stash(ctx(['write'])), /--content-file/);
  assert.throws(() => stash(ctx(['write'], { 'content-file': '/nope/missing.txt' })), /does not exist/);
});

test('stash list reports every slot, filled or not', () => {
  const dir = sandbox();
  stash(ctx(['write'], { 'content-file': source(dir, 'only\n') }));

  const result = /** @type {any} */ (stash(ctx(['list'])));
  assert.equal(result.depth, 5);
  assert.equal(result.slots.length, 5);
  assert.equal(result.slots[0].exists, true);
  assert.equal(result.slots[0].bytes, 'only\n'.length);
  assert.equal(
    result.slots.slice(1).every((/** @type {any} */ s) => s.exists === false),
    true,
  );
});

test('the ring lives under the config directory and nowhere else', () => {
  const dir = sandbox();
  assert.equal(stashDir(), dir);
  const result = /** @type {any} */ (stash(ctx(['write'], { 'content-file': source(dir, 'x\n') })));
  // Nothing is written into whatever repository the session happens to be in.
  assert.equal(result.path.startsWith(dir), true);
  assert.equal(result.dir, dir);
});

test('an unknown subcommand is refused by name', () => {
  sandbox();
  assert.throws(() => stash(ctx(['rotate'])), /unknown subcommand "rotate"/);
});
