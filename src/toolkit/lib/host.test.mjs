import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveHost, worktreesDir } from './host.mjs';

test('the --host flag wins over MY_COMMAND_HOST, which wins over the Claude default', () => {
  assert.equal(resolveHost('copilot', { MY_COMMAND_HOST: 'codex' }), 'copilot');
  assert.equal(resolveHost(undefined, { MY_COMMAND_HOST: 'copilot' }), 'copilot');
  assert.equal(resolveHost(undefined, {}), 'claude');
  assert.equal(resolveHost(undefined, { MY_COMMAND_HOST: '' }), 'claude');
});

test('an unknown host is a usage error, never a silent fallback', () => {
  assert.throws(() => resolveHost('vscode', {}), /unknown host: vscode/);
  assert.throws(() => resolveHost(undefined, { MY_COMMAND_HOST: 'gemini' }), /unknown host: gemini/);
});

test('each host keeps its worktrees under its own config directory name', () => {
  assert.equal(worktreesDir('claude'), '.claude/worktrees');
  assert.equal(worktreesDir('codex'), '.codex/worktrees');
  assert.equal(worktreesDir('copilot'), '.copilot/worktrees');
});
