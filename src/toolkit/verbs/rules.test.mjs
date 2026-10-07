// `rules` verb tests: the retirement report counts only current models inside the window, and
// `fire` records prose rules alone.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { report } from './rules.mjs';

const CLI = fileURLToPath(new URL('../cli.mjs', import.meta.url));

/** @type {string[]} */
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const NOW = Date.parse('2026-10-05T00:00:00Z');
const DAY = 86_400_000;
const at = (/** @type {number} */ daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();

/** @param {string} id @returns {import('../../hooks/lib/rules.mjs').Rule} */
const rule = (id) => ({ id, kind: id.startsWith('gate/') ? 'gate' : 'prose', source: 'x', summary: 'a rule' });

/** @param {string} rule @param {number} daysAgo @param {string | null} model @param {string} [origin] */
const fire = (rule, daysAgo, model, origin = 'hook') => ({
  rule,
  at: at(daysAgo),
  model,
  session: `s-${daysAgo}`,
  origin,
});

const RULES = ['gate/a', 'gate/b', 'gate/c', 'prose/d'].map(rule);

test('a rule firing only on an older model, or outside the window, is a candidate', () => {
  const out = report({
    rules: RULES,
    fires: [
      fire('gate/a', 1, 'new'),
      fire('gate/a', 2, 'new'),
      fire('gate/b', 3, 'old'),
      fire('gate/c', 60, 'new'),
      fire('prose/d', 1, 'new', 'judge'),
    ],
    now: NOW,
    days: 30,
    models: ['new'],
    max: 0,
  });
  assert.deepEqual(
    out.candidates.map((c) => c.id),
    ['gate/b', 'gate/c'],
  );
  assert.deepEqual(out.candidates[0].lastFire, { at: at(3), model: 'old' });
  assert.equal(out.fires, 3);
  assert.equal(out.modelsFrom, 'flag');
});

test('current models default to the ones that fired in the window, and --max admits near-zero', () => {
  const out = report({
    rules: RULES,
    fires: [fire('gate/a', 1, 'new'), fire('gate/a', 2, 'new'), fire('gate/b', 3, 'new'), fire('gate/c', 4, null)],
    now: NOW,
    days: 30,
    models: [],
    max: 1,
    all: true,
  });
  assert.deepEqual(out.models, ['new']);
  assert.deepEqual(
    out.candidates.map((c) => [c.id, c.fires]),
    [
      ['gate/c', 0],
      ['prose/d', 0],
      ['gate/b', 1],
    ],
  );
  assert.equal(out.all?.length, 4);
});

test('thin evidence and unknown rule ids are called out rather than hidden', () => {
  const out = report({ rules: RULES, fires: [fire('gate/gone', 1, 'new')], now: NOW, days: 30, models: [], max: 0 });
  assert.deepEqual(out.unknownRules, ['gate/gone']);
  assert.ok(out.notes.some((n) => n.includes('weak evidence')));
  assert.ok(out.notes.some((n) => n.includes('retires nothing')));
});

/** @param {string[]} args @param {string} fires */
function cli(args, fires) {
  try {
    return {
      code: 0,
      out: JSON.parse(
        execFileSync('node', [CLI, 'rules', ...args], {
          encoding: 'utf8',
          env: { ...process.env, MY_COMMAND_RULE_FIRES: fires, MY_COMMAND_REQUIRE_HOOKS: '0' },
        }),
      ),
    };
  } catch (err) {
    const e = /** @type {{status: number, stdout: string}} */ (err);
    return { code: e.status, out: JSON.parse(e.stdout) };
  }
}

test('the CLI records a prose fire, refuses a gate or unknown id, and reports it back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mct-rules-'));
  made.push(dir);
  const fires = join(dir, 'fires.jsonl');

  const ok = cli(
    ['fire', '--rule', 'prose/batched-discovery', '--model', 'claude-z', '--session', 's', '--suggestion', 'q'],
    fires,
  );
  assert.equal(ok.code, 0);
  assert.equal(ok.out.fire.origin, 'judge');
  assert.equal(ok.out.fire.suggestion, 'q');

  assert.equal(cli(['fire', '--rule', 'gate/serial'], fires).code, 2);
  assert.equal(cli(['fire', '--rule', 'prose/none'], fires).code, 2);
  assert.equal(cli(['fire', '--rule', 'prose/batched-discovery', '--at', 'soon'], fires).code, 2);
  assert.equal(cli(['nope'], fires).code, 2);
  assert.equal(cli(['report', '--days', '-1'], fires).code, 2);

  const out = cli(['report', '--model', 'claude-z', '--max', '0'], fires).out;
  assert.equal(out.fires, 1);
  assert.ok(!out.candidates.some((/** @type {{id: string}} */ c) => c.id === 'prose/batched-discovery'));
  assert.ok(out.candidates.some((/** @type {{id: string}} */ c) => c.id === 'gate/serial'));

  const listed = cli(['list'], fires).out;
  assert.equal(listed.path, fires);
  assert.ok(listed.rules.length > 20);
});
