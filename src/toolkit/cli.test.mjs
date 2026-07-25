import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArgs } from './cli.mjs';

test('parses a bare verb', () => {
  const { verb, positionals, flags } = parseArgs(['state']);
  assert.equal(verb, 'state');
  assert.deepEqual(positionals, []);
  assert.deepEqual(flags, {});
});

test('parses --flag value and --flag=value the same way', () => {
  assert.equal(parseArgs(['state', '--base', 'main']).flags.base, 'main');
  assert.equal(parseArgs(['state', '--base=main']).flags.base, 'main');
});

test('a flag with no value is boolean true', () => {
  assert.equal(parseArgs(['pr', '--draft']).flags.draft, true);
  assert.equal(parseArgs(['pr', '--draft', '--title', 'x']).flags.draft, true);
});

test('repeating a flag collects it into an array', () => {
  assert.deepEqual(parseArgs(['clean-scope', '--path', 'a', '--path', 'b']).flags.path, ['a', 'b']);
});

test('non-flag tokens stay positional', () => {
  const { positionals } = parseArgs(['commit', '--message', 'm', 'src/a.ts', 'src/b.ts']);
  assert.deepEqual(positionals, ['src/a.ts', 'src/b.ts']);
});

test('a value that looks like a flag is not swallowed', () => {
  const { flags, positionals } = parseArgs(['worktree', 'begin', '--branch', '--force']);
  assert.equal(flags.branch, true);
  assert.equal(flags.force, true);
  assert.deepEqual(positionals, ['begin']);
});
