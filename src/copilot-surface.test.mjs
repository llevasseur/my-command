// The Copilot CLI surface: skills patched from the Codex ones and custom agents ported from the
// Claude definitions, built at install time. These assert the build's drift guards and the
// install's layout — never against the real ~/.copilot.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildCopilot,
  COPILOT_AGENTS,
  COPILOT_SKILLS,
  CopilotPatchError,
  copilotAgent,
  copilotSkill,
} from './copilot/patch.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUILT = join(REPO_ROOT, 'dist', 'my-command.js');
assert.ok(existsSync(BUILT), `${BUILT} is missing — run \`pnpm build\` before \`pnpm test\``);
const { installCopilot } = await import(BUILT);

/** @type {string[]} */
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const files = buildCopilot(REPO_ROOT);

test('every in-scope skill and agent builds, with the host notes appended', () => {
  for (const name of COPILOT_SKILLS) {
    const skill = files.get(join('skills', name, 'SKILL.md'));
    assert.ok(skill, `${name} did not build`);
    assert.match(skill, /## Running on GitHub Copilot CLI/);
    assert.doesNotMatch(skill, /\bCodex\b|\.codex\/worktrees|SendMessage/, `${name} still speaks Codex or Claude`);
  }
  for (const name of COPILOT_AGENTS) assert.ok(files.get(join('agents', `${name}.agent.md`)), `${name} did not build`);
});

test('the proxy-dependent paths are gone: /task loses --jev and /manage loses the ideas delegates', () => {
  const task = files.get(join('skills', 'task', 'SKILL.md')) ?? '';
  const manage = files.get(join('skills', 'manage', 'SKILL.md')) ?? '';
  assert.doesNotMatch(task, /--jev|TYPESAFE_API_KEY/);
  assert.match(task, /worktree begin --host copilot/);
  assert.doesNotMatch(manage, /work:god|`work`|ledger/);
  assert.match(manage, /markdown wave plan/);
});

test('a skill invocation becomes a slash command, and one off this host fails the build', () => {
  assert.match(copilotSkill('clean', 'Run `$pr` next.\n'), /Run `\/pr` next\./);
  assert.throws(() => copilotSkill('clean', 'Recover with `$revive`.\n'), CopilotPatchError);
  // An unrelated lowercase `$word` is not a skill and passes through.
  assert.match(copilotSkill('clean', 'The `$name` token.\n'), /`\$name`/);
});

test('a patch whose anchor drifted fails the build rather than shipping half-translated', () => {
  assert.throws(() => copilotSkill('task', '# Task\n\nNo flag line here.\n'), /patch anchor not found/);
});

test('an agent ports its tools to Copilot aliases and drops its Claude model tier', () => {
  const finisher = readFileSync(join(REPO_ROOT, 'agents', 'mycommand-finisher.md'), 'utf8');
  const ported = copilotAgent('mycommand-finisher', finisher);
  assert.match(ported, /^tools: \["execute","read","edit","search","todo"\]$/m);
  assert.doesNotMatch(ported, /^model:/m);
  assert.doesNotMatch(ported, /Skill tool|ExitWorktree/);
  assert.throws(
    () => copilotAgent('x', '---\nname: x\ntools: Bash, Teleport\n---\nbody\n'),
    /no Copilot CLI alias for tool Teleport/,
  );
});

test('the install writes skills and agents under the Copilot home, and nothing out of scope', async () => {
  const home = mkdtempSync(join(tmpdir(), 'mcc-'));
  made.push(home);

  const result = await installCopilot(home);

  assert.equal(result.installed, true, result.reason);
  assert.equal(result.agents, COPILOT_AGENTS.length);
  for (const name of COPILOT_SKILLS) assert.ok(existsSync(join(home, 'skills', name, 'SKILL.md')), name);
  for (const name of COPILOT_AGENTS) assert.ok(existsSync(join(home, 'agents', `${name}.agent.md`)), name);
  assert.ok(existsSync(join(home, 'skills', 'fb', 'references', 'edge-cases.md')));
  for (const excluded of ['work', 'ideate', 'revive', 'trim']) assert.ok(!existsSync(join(home, 'skills', excluded)));
});
