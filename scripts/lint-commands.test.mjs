import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { test } from 'node:test';
import { EMPHASIS_CAP, lint, MYCOMMAND_SCRIPTS, sources } from './lint-commands.mjs';

const ROOT = resolve(import.meta.dirname, '..');

/** @param {string} text */
const rules = (text) => lint('commands/x.md', text, { allow: [] }).map((f) => f.rule);

test('links and paths that resolve only inside this repo are flagged', () => {
  assert.deepEqual(rules('See [ADR 0011](../../docs/adrs/0011-x.md).'), ['repo-path']);
  assert.deepEqual(rules('The runtime is `src/toolkit/lib/judge-run.mjs`.'), ['repo-path']);
  assert.deepEqual(rules('from the `src/hooks/lib/` machinery'), ['repo-path']);
  assert.deepEqual(rules('the table is in `docs/specs/subagent-definitions.md`.'), ['repo-path']);
  assert.deepEqual(rules('recorded in `docs/adrs/0006-unattended.md`.'), ['repo-path']);
});

test('sibling links, full URLs, placeholders and index paths pass', () => {
  assert.deepEqual(rules("that is [truncate](truncate.md)'s pass"), []);
  assert.deepEqual(rules('[ADR 0005](https://github.com/o/r/blob/main/docs/adrs/0005-x.md)'), []);
  assert.deepEqual(rules('cites `docs/specs/<name>.md` and `docs/adrs/<nnnn>-<slug>.md`'), []);
  assert.deepEqual(rules('handed `docs/specs/index.md` and `docs/adrs/index.md`'), []);
  assert.deepEqual(rules('ADR 0011 gives a pre-filtered comment'), []);
});

test("this repo's own scripts and the feature-doc placeholder are flagged", () => {
  assert.deepEqual(rules('`scripts/check-changelog.mjs` fails any bullet over 80 words.'), ['repo-path']);
  assert.deepEqual(rules('run `scripts/build-plugin.sh` after an edit'), ['repo-path']);
  assert.deepEqual(rules('The why lives in `docs/features/<cmd>.md`.'), ['repo-path']);
  assert.deepEqual(rules('see docs/features/<name>.md'), ['repo-path']);
});

test('per-repo scripts, located paths and concrete feature docs pass', () => {
  assert.ok(MYCOMMAND_SCRIPTS.includes('check-commands.sh'));
  assert.ok(!MYCOMMAND_SCRIPTS.includes('bootstrap-worktree.sh'));
  assert.ok(!MYCOMMAND_SCRIPTS.some((f) => f.endsWith('.test.mjs')));
  assert.deepEqual(rules('run `scripts/bootstrap-worktree.sh --print-verify-contract`'), []);
  assert.deepEqual(rules('`bash "$REPO/scripts/install-personal.sh"`'), []);
  assert.deepEqual(rules('`~/.claude/plugins/marketplaces/my-command/scripts/install-marketplace-personal.sh`'), []);
  assert.deepEqual(rules('a script gating docs (`scripts/check-*.sh`)'), []);
  assert.deepEqual(rules('add the missing docs/features/review.md entry'), []);
});

test('history wording is flagged', () => {
  assert.deepEqual(rules('`/clean` used to carry this check.'), ['history']);
  assert.deepEqual(rules('a `PreToolUse` gate now refuses `--message -`'), ['history']);
  assert.deepEqual(rules('byte-identical to one before this flag existed'), ['history']);
  assert.deepEqual(rules('until this step existed nothing read it back'), ['history']);
  assert.deepEqual(rules('ten recorded runs took that refusal'), ['history']);
  assert.deepEqual(rules('Recorded run 12 read one report twenty times'), ['history']);
  assert.deepEqual(rules('unlike the old behaviour'), ['history']);
});

test('present-tense "now", passive "used to" and a literal "the old" pass', () => {
  assert.deepEqual(rules('Work on the **current branch** as it is now.'), []);
  assert.deepEqual(rules('a ticket run is executing it right now'), []);
  assert.deepEqual(rules('the integration branch the map now records'), []);
  assert.deepEqual(rules('and used to scope the skill search'), []);
  assert.deepEqual(rules('it is used to resolve the path'), []);
  assert.deepEqual(rules('the new one for `+`, the old one for `-`'), []);
});

test('uppercase emphasis over the cap is one finding for the file', () => {
  const at = Array.from({ length: EMPHASIS_CAP }, () => 'You MUST do it.').join('\n');
  assert.deepEqual(rules(at), []);
  const over = `${at}\nNEVER skip it.`;
  const findings = lint('commands/x.md', over, { allow: [] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'emphasis');
  assert.match(findings[0].message, new RegExp(`the cap is ${EMPHASIS_CAP}`));
  assert.deepEqual(rules('Never lowercase. must not.'), []);
});

test('an allowlist entry silences only its own file, rule and text', () => {
  const allow = [{ file: 'agents/a.md', rule: 'history', contains: 'code now uses', reason: 'quoted' }];
  const line = 'Never "the code now uses 40000".';
  assert.deepEqual(lint('agents/a.md', line, { allow }), []);
  assert.equal(lint('agents/b.md', line, { allow }).length, 1);
});

test('every installed command and subagent definition is clean today', () => {
  const findings = sources().flatMap((f) => lint(relative(ROOT, f), readFileSync(f, 'utf8')));
  assert.deepEqual(findings, []);
});
