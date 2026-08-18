import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { expand, expandBlock, expandInline } from './expand-includes.mjs';

const read = (snippets) => (name) => {
  if (!(name in snippets)) throw new Error(`no such snippet: src/shared/${name}.md`);
  return snippets[name];
};

const oneLine = read({ rule: 'Never force past a live lock.' });
const manyLines = read({ vocab: '### Rewrite toward\n\n- One instruction per sentence.' });

test('inline expansion keeps the directive on its own line and its bullet prefix', () => {
  const source = '- <!-- include: shared/rule.md -->\n';
  assert.equal(
    expandInline(source, oneLine),
    '- <!-- include: shared/rule.md -->Never force past a live lock.<!-- /include -->\n',
  );
});

test('inline expansion replaces an existing body rather than nesting a copy', () => {
  const once = expandInline('- <!-- include: shared/rule.md -->\n', oneLine);
  assert.equal(expandInline(once, oneLine), once);
});

test('inline expansion refuses a multi-line snippet and names the block form', () => {
  assert.throws(
    () => expandInline('<!-- include: shared/vocab.md -->\n', manyLines),
    /must be a single line to be included inline.*include-block/s,
  );
});

test('block expansion inserts a multi-line body between its markers', () => {
  assert.equal(
    expandBlock('<!-- include-block: shared/vocab.md -->\n', manyLines),
    '<!-- include-block: shared/vocab.md -->\n' +
      '### Rewrite toward\n\n- One instruction per sentence.\n' +
      '<!-- /include-block -->\n',
  );
});

test('block expansion is idempotent across re-runs', () => {
  const once = expandBlock('<!-- include-block: shared/vocab.md -->\n', manyLines);
  assert.equal(expandBlock(once, manyLines), once);
});

test('block expansion refuses an indented directive', () => {
  assert.throws(() => expandBlock('   <!-- include-block: shared/vocab.md -->\n', manyLines), /must start at column 0/);
});

test('an unclosed block directive does not swallow the next block', () => {
  const source = [
    '<!-- include-block: shared/vocab.md -->',
    'intervening prose',
    '<!-- include-block: shared/vocab.md -->',
    'stale body',
    '<!-- /include-block -->',
    'trailing prose',
  ].join('\n');

  const result = expandBlock(source, manyLines);

  assert.ok(result.includes('intervening prose'), 'prose after an unclosed directive survives');
  assert.ok(result.includes('trailing prose'), 'content after the closed block survives');
  assert.ok(!result.includes('stale body'), "the closed block's own body is replaced");
  assert.equal(result.match(/<!-- \/include-block -->/g).length, 2, 'each directive is closed');
});

test('the two forms coexist in one document', () => {
  const both = read({ rule: 'Never force past a live lock.', vocab: '### Rewrite toward' });
  const source = '- <!-- include: shared/rule.md -->\n\n<!-- include-block: shared/vocab.md -->\n';

  assert.equal(
    expand(source, both),
    '- <!-- include: shared/rule.md -->Never force past a live lock.<!-- /include -->\n\n' +
      '<!-- include-block: shared/vocab.md -->\n### Rewrite toward\n<!-- /include-block -->\n',
  );
});
