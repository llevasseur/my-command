// The gates, exercised the way the harness runs them: a real event on stdin, a real
// decision on stdout.
//
// These tests carry more weight than most, because a false denial here does not fail a
// build — it blocks a legitimate tool call in the user's daily work. So the cases that
// matter most are the ones asserting a call is *allowed*: a parallel batch, a re-read of a
// changed file, a `cd` that resolves, and a second refusal of the same subject.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { install } from './install-hooks.mjs';
import { isReadOnly } from './lib/read-only.mjs';
import { lastFullReadOf, timeline } from './lib/transcript.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRE_TOOL_USE = join(HERE, 'pre-tool-use.mjs');
const STOP = join(HERE, 'stop.mjs');

/** @type {string[]} */
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'mch-'));
  made.push(dir);
  return dir;
}

/**
 * Run a hook the way the harness does. `state` points the wedge-guard's scratch somewhere
 * disposable so one test's denial cannot suppress another's.
 * @param {string} script @param {Record<string, unknown>} event @param {string} [state]
 * @returns {Record<string, any>}
 */
function hook(script, event, state = scratch()) {
  const out = execFileSync('node', [script], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: { ...process.env, MY_COMMAND_HOOK_STATE: state, MY_COMMAND_HOOKS: '1' },
  });
  return out.trim() ? JSON.parse(out) : {};
}

/** @param {Record<string, any>} answer */
const denied = (answer) => answer?.hookSpecificOutput?.permissionDecision === 'deny';

/**
 * A transcript file built from a compact spec: each entry is a turn's tool calls, or the
 * string 'prompt' for a user message, or 'text' for a text-only reply.
 * @param {('prompt' | 'text' | {name: string, input: Record<string, unknown>}[])[]} spec
 * @param {number} [startedAt]
 * @returns {string}
 */
function transcript(spec, startedAt = Date.now() - 600_000) {
  const dir = scratch();
  const path = join(dir, 'transcript.jsonl');
  const lines = spec.map((item, i) => {
    const timestamp = new Date(startedAt + i * 1000).toISOString();
    if (item === 'prompt') {
      return JSON.stringify({
        type: 'user',
        uuid: `u${i}`,
        timestamp,
        message: { role: 'user', content: [{ type: 'text', text: 'do the thing' }] },
      });
    }
    if (item === 'text') {
      return JSON.stringify({
        type: 'assistant',
        uuid: `a${i}`,
        timestamp,
        message: { role: 'assistant', content: [{ type: 'text', text: 'here is the answer' }] },
      });
    }
    return JSON.stringify({
      type: 'assistant',
      uuid: `a${i}`,
      timestamp,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'looking' },
          ...item.map((u, n) => ({ type: 'tool_use', id: `t${i}-${n}`, name: u.name, input: u.input })),
        ],
      },
    });
  });
  writeFileSync(path, `${lines.join('\n')}\n`);
  return path;
}

/** @param {string} name @param {Record<string, unknown>} input */
const read = (name, input) => ({ name, input });

// ── read-only classification ────────────────────────────────────────────────────────

test('read-only classification recognizes probes and refuses to guess', () => {
  assert.equal(isReadOnly('Read', { file_path: '/a' }), true);
  assert.equal(isReadOnly('Grep', { pattern: 'x' }), true);
  assert.equal(isReadOnly('Edit', { file_path: '/a' }), false);
  assert.equal(isReadOnly('Bash', { command: 'git status --porcelain' }), true);
  assert.equal(isReadOnly('Bash', { command: 'rg --files src | head -20' }), true);
  assert.equal(isReadOnly('Bash', { command: 'my-command-tools state' }), true);
  assert.equal(isReadOnly('Bash', { command: 'my-command-tools worktree list' }), true);

  // Mutations, and anything whose real command is not what is written.
  assert.equal(isReadOnly('Bash', { command: 'git commit -m x' }), false);
  assert.equal(isReadOnly('Bash', { command: 'my-command-tools worktree begin --branch x' }), false);
  assert.equal(isReadOnly('Bash', { command: 'git status && rm -rf /tmp/x' }), false);
  assert.equal(isReadOnly('Bash', { command: 'ls > out.txt' }), false);
  assert.equal(isReadOnly('Bash', { command: 'BASE=$(git merge-base origin/main HEAD)' }), false);
  assert.equal(isReadOnly('Bash', { command: 'gh pr checks --watch' }), false);
  assert.equal(isReadOnly('Bash', { command: 'pnpm test' }), false);
  // A backgrounded probe is a process to manage, not a probe that answers and exits.
  assert.equal(isReadOnly('Bash', { command: 'ls', run_in_background: true }), false);
});

// ── serial discovery (R2) ───────────────────────────────────────────────────────────

test('serial discovery: three read-only turns pass, the fourth is refused', () => {
  const three = transcript([
    'prompt',
    [read('Read', { file_path: '/x/a.ts' })],
    [read('Read', { file_path: '/x/b.ts' })],
    [read('Read', { file_path: '/x/c.ts' })],
  ]);
  const answer = hook(PRE_TOOL_USE, {
    session_id: 's1',
    transcript_path: three,
    cwd: '/x',
    tool_name: 'Grep',
    tool_input: { pattern: 'foo' },
  });
  assert.equal(denied(answer), true);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /parallel tool calls in a single turn/);
});

test('serial discovery: a batch of parallel calls is one turn, so it is never refused', () => {
  // Twelve files read in three turns — the behaviour the gate exists to produce.
  const batched = transcript([
    'prompt',
    [1, 2, 3, 4].map((n) => read('Read', { file_path: `/x/${n}.ts` })),
    [5, 6, 7, 8].map((n) => read('Read', { file_path: `/x/${n}.ts` })),
  ]);
  const answer = hook(PRE_TOOL_USE, {
    session_id: 's2',
    transcript_path: batched,
    cwd: '/x',
    tool_name: 'Read',
    tool_input: { file_path: '/x/9.ts' },
  });
  assert.equal(denied(answer), false);
});

test('serial discovery: an action between the reads breaks the run', () => {
  const withAction = transcript([
    'prompt',
    [read('Read', { file_path: '/x/a.ts' })],
    [read('Read', { file_path: '/x/b.ts' })],
    [read('Edit', { file_path: '/x/b.ts' })],
    [read('Read', { file_path: '/x/c.ts' })],
  ]);
  const answer = hook(PRE_TOOL_USE, {
    session_id: 's3',
    transcript_path: withAction,
    cwd: '/x',
    tool_name: 'Read',
    tool_input: { file_path: '/x/d.ts' },
  });
  assert.equal(denied(answer), false);
});

test('serial discovery: a user prompt starts the count over', () => {
  const line = transcript([
    'prompt',
    [read('Read', { file_path: '/x/a.ts' })],
    [read('Read', { file_path: '/x/b.ts' })],
    [read('Read', { file_path: '/x/c.ts' })],
    'prompt',
  ]);
  const answer = hook(PRE_TOOL_USE, {
    session_id: 's4',
    transcript_path: line,
    cwd: '/x',
    tool_name: 'Read',
    tool_input: { file_path: '/x/d.ts' },
  });
  assert.equal(denied(answer), false);
});

test('serial discovery: the same run is never refused twice', () => {
  const state = scratch();
  const line = transcript([
    'prompt',
    [read('Read', { file_path: '/x/a.ts' })],
    [read('Read', { file_path: '/x/b.ts' })],
    [read('Read', { file_path: '/x/c.ts' })],
  ]);
  const event = {
    session_id: 's5',
    transcript_path: line,
    cwd: '/x',
    tool_name: 'Read',
    tool_input: { file_path: '/x/d.ts' },
  };
  assert.equal(denied(hook(PRE_TOOL_USE, event, state)), true);
  // The gate has had its say; a second refusal would leave the agent no way forward.
  assert.equal(denied(hook(PRE_TOOL_USE, event, state)), false);
});

// ── redundant reads (R3) ────────────────────────────────────────────────────────────

test('redundant read: a whole-file re-read of an unchanged file is refused', () => {
  const dir = scratch();
  const file = join(dir, 'api.ts');
  writeFileSync(file, 'export const a = 1;\n');
  // Modified well before the earlier read, which is what "unchanged since" means.
  const old = (Date.now() - 3_600_000) / 1000;
  utimesSync(file, old, old);

  const line = transcript(['prompt', [read('Read', { file_path: file })], [read('Grep', { pattern: 'x' })]]);
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'r1',
    transcript_path: line,
    cwd: dir,
    tool_name: 'Read',
    tool_input: { file_path: file },
  });
  assert.equal(denied(answer), true);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /rg -n 'firstSymbol\|secondSymbol'/);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /offset/);
});

test('redundant read: a re-read after the file changed passes', () => {
  const dir = scratch();
  const file = join(dir, 'api.ts');
  writeFileSync(file, 'export const a = 1;\n');
  const line = transcript(
    ['prompt', [read('Read', { file_path: file })]],
    // The earlier read happened ten minutes ago; the file was written just now.
    Date.now() - 600_000,
  );
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'r2',
    transcript_path: line,
    cwd: dir,
    tool_name: 'Read',
    tool_input: { file_path: file },
  });
  assert.equal(denied(answer), false);
});

test('redundant read: a targeted slice is always allowed', () => {
  const dir = scratch();
  const file = join(dir, 'api.ts');
  writeFileSync(file, 'export const a = 1;\n');
  const old = (Date.now() - 3_600_000) / 1000;
  utimesSync(file, old, old);

  const line = transcript(['prompt', [read('Read', { file_path: file })]]);
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'r3',
    transcript_path: line,
    cwd: dir,
    tool_name: 'Read',
    tool_input: { file_path: file, offset: 40, limit: 20 },
  });
  assert.equal(denied(answer), false);
});

test('redundant read: an earlier slice does not make the first whole-file read redundant', () => {
  const dir = scratch();
  const file = join(dir, 'api.ts');
  writeFileSync(file, 'export const a = 1;\n');
  const old = (Date.now() - 3_600_000) / 1000;
  utimesSync(file, old, old);

  const line = transcript(['prompt', [read('Read', { file_path: file, offset: 1, limit: 5 })]]);
  assert.equal(lastFullReadOf(timeline([]), file), 0);
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'r4',
    transcript_path: line,
    cwd: dir,
    tool_name: 'Read',
    tool_input: { file_path: file },
  });
  assert.equal(denied(answer), false);
});

// ── relative cd (R4) ────────────────────────────────────────────────────────────────

test('relative cd: a path that does not resolve from here is refused', () => {
  const dir = scratch();
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'c1',
    transcript_path: transcript(['prompt']),
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command: 'cd apps/nexus-ui && pnpm dev' },
  });
  assert.equal(denied(answer), true);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /--cwd <absolute path>/);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /git -C/);
});

test('relative cd: a path that does resolve, an absolute one, and an expanded one all pass', () => {
  const dir = scratch();
  execFileSync('mkdir', ['-p', join(dir, 'apps', 'ui')]);
  for (const command of [
    'cd apps/ui && ls',
    `cd ${dir} && ls`,
    'cd ~/Documents && ls',
    'cd "$REPO_ROOT" && ls',
    'cd - && ls',
  ]) {
    const answer = hook(PRE_TOOL_USE, {
      session_id: 'c2',
      transcript_path: transcript(['prompt']),
      cwd: dir,
      tool_name: 'Bash',
      tool_input: { command },
    });
    assert.equal(denied(answer), false, `should allow: ${command}`);
  }
});

// ── the off switch ──────────────────────────────────────────────────────────────────

test('MY_COMMAND_HOOKS=0 turns every gate off', () => {
  const line = transcript([
    'prompt',
    [read('Read', { file_path: '/x/a.ts' })],
    [read('Read', { file_path: '/x/b.ts' })],
    [read('Read', { file_path: '/x/c.ts' })],
  ]);
  const out = execFileSync('node', [PRE_TOOL_USE], {
    input: JSON.stringify({
      session_id: 'off',
      transcript_path: line,
      cwd: '/x',
      tool_name: 'Read',
      tool_input: { file_path: '/x/d.ts' },
    }),
    encoding: 'utf8',
    env: { ...process.env, MY_COMMAND_HOOKS: '0', MY_COMMAND_HOOK_STATE: scratch() },
  });
  assert.equal(out.trim(), '');
});

test('a malformed event allows the call rather than failing it', () => {
  const out = execFileSync('node', [PRE_TOOL_USE], {
    input: 'not json at all',
    encoding: 'utf8',
    env: { ...process.env, MY_COMMAND_HOOK_STATE: scratch() },
  });
  assert.equal(out.trim(), '');
});

// ── the outcome gate (F1) ───────────────────────────────────────────────────────────

test('stop: a run ending on a tool call is told the outcome is owed', () => {
  const line = transcript(['prompt', [read('Bash', { command: 'my-command-tools worktree end --branch x' })]]);
  const answer = hook(STOP, { session_id: 'f1', transcript_path: line });
  assert.equal(answer.decision, 'block');
  assert.match(answer.reason, /text and zero tool calls/);
});

test('stop: a text-only closing turn ends the run', () => {
  const line = transcript(['prompt', [read('Read', { file_path: '/x/a.ts' })], 'text']);
  const answer = hook(STOP, { session_id: 'f2', transcript_path: line });
  assert.deepEqual(answer, {});
});

test('stop: the same turn is never blocked twice, so a run can always end', () => {
  const state = scratch();
  const line = transcript(['prompt', [read('Bash', { command: 'ls' })]]);
  const event = { session_id: 'f3', transcript_path: line };
  assert.equal(hook(STOP, event, state).decision, 'block');
  assert.deepEqual(hook(STOP, event, state), {});
});

test('stop: an in-flight re-run of the same stop is left alone', () => {
  const line = transcript(['prompt', [read('Bash', { command: 'ls' })]]);
  const answer = hook(STOP, { session_id: 'f4', transcript_path: line, stop_hook_active: true });
  assert.deepEqual(answer, {});
});

// ── installer wiring ────────────────────────────────────────────────────────────────

test('install registers the gates and the allowlist, idempotently', () => {
  const dir = scratch();
  const settingsPath = join(dir, 'settings.json');
  const hooksDir = join(dir, 'my-command', 'hooks');

  const first = install({ hooksDir, settingsPath, uninstall: false });
  assert.equal(first.registered, 2);
  assert.ok(first.allowAdded > 0);

  const settings = JSON.parse(execFileSync('cat', [settingsPath], { encoding: 'utf8' }));
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, join(hooksDir, 'pre-tool-use.mjs'));
  assert.equal(settings.hooks.PreToolUse[0].matcher, 'Read|Grep|Glob|Bash');
  assert.equal(settings.hooks.Stop[0].hooks[0].command, join(hooksDir, 'stop.mjs'));
  assert.ok(settings.permissions.allow.includes('Bash(my-command-tools:*)'));

  // A second run must not stack a second copy, which would refuse twice per violation.
  const second = install({ hooksDir, settingsPath, uninstall: false });
  assert.equal(second.replaced, 2);
  assert.equal(second.allowAdded, 0);
  const again = JSON.parse(execFileSync('cat', [settingsPath], { encoding: 'utf8' }));
  assert.equal(again.hooks.PreToolUse.length, 1);
  assert.equal(again.hooks.Stop.length, 1);
});

test('install preserves unrelated settings and foreign hooks', () => {
  const dir = scratch();
  const settingsPath = join(dir, 'settings.json');
  const hooksDir = join(dir, 'my-command', 'hooks');
  writeFileSync(
    settingsPath,
    JSON.stringify({
      model: 'opus',
      permissions: { allow: ['Bash(pnpm test)'], deny: ['Bash(rm:*)'] },
      hooks: {
        PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: '/somewhere/else/mine.sh' }] }],
      },
    }),
  );

  install({ hooksDir, settingsPath, uninstall: false });
  let settings = JSON.parse(execFileSync('cat', [settingsPath], { encoding: 'utf8' }));
  assert.equal(settings.model, 'opus');
  assert.deepEqual(settings.permissions.deny, ['Bash(rm:*)']);
  assert.ok(settings.permissions.allow.includes('Bash(pnpm test)'));
  assert.equal(settings.hooks.PreToolUse.length, 2);

  const removed = install({ hooksDir, settingsPath, uninstall: true });
  assert.equal(removed.uninstalled, 2);
  settings = JSON.parse(execFileSync('cat', [settingsPath], { encoding: 'utf8' }));
  // Ours gone, the user's untouched.
  assert.equal(settings.hooks.PreToolUse.length, 1);
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, '/somewhere/else/mine.sh');
  assert.equal(settings.model, 'opus');
});

test('install refuses to overwrite a settings file it cannot parse', () => {
  const dir = scratch();
  const settingsPath = join(dir, 'settings.json');
  writeFileSync(settingsPath, '{ this is not json');
  assert.throws(() => install({ hooksDir: join(dir, 'hooks'), settingsPath, uninstall: false }), /is not valid JSON/);
});
