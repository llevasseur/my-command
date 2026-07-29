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
  assert.deepEqual(parseArgs(['verify', '--only', 'lint', '--only', 'test']).flags.only, ['lint', 'test']);
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

test('a leading flag means no verb, not a verb named --help', () => {
  for (const argv of [['--help'], ['-h']]) {
    const { verb, flags } = parseArgs(argv);
    assert.equal(verb, '', `${argv[0]} should not parse as a verb`);
    assert.equal(flags.help, true);
  }
});

test('-h is accepted after a verb too', () => {
  const { verb, flags } = parseArgs(['commit', '-h']);
  assert.equal(verb, 'commit');
  assert.equal(flags.help, true);
});

test('a bare - stays a positional, since it means read from stdin', () => {
  assert.equal(parseArgs(['commit', '--message', '-']).flags.message, '-');
});

test('a switch never swallows the path that follows it', () => {
  const { flags, positionals } = parseArgs(['commit', '--message', 'm', '--compact', 'a.md', 'b.mjs']);
  assert.equal(flags.compact, true);
  assert.equal(flags.message, 'm');
  assert.deepEqual(positionals, ['a.md', 'b.mjs']);
});

test('every switch stays boolean in front of a positional', () => {
  for (const sw of ['--draft', '--retitle', '--force', '--bootstrap']) {
    const { flags, positionals } = parseArgs(['pr', sw, 'kept.md']);
    assert.equal(flags[sw.slice(2)], true, `${sw} should not take a value`);
    assert.deepEqual(positionals, ['kept.md'], `${sw} should not eat the positional`);
  }
});
