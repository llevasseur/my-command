// Rule fires: every gate has a stable id, a first refusal records one fire stamped with the
// session and the model, and recording can never change or break a gate's answer.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { firesPath, GATE_NAMES, modelFromTranscript, RULES, readFires, recordFire, ruleById } from './lib/rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(dirname(HERE));
const PRE_TOOL_USE = join(HERE, 'pre-tool-use.mjs');

/** @type {string[]} */
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'mch-rules-'));
  made.push(dir);
  return dir;
}

/** A transcript whose last assistant record names `model`. @param {string} dir @param {string} model */
function transcript(dir, model) {
  const path = join(dir, 't.jsonl');
  const rec = (/** @type {string} */ id, /** @type {string} */ m) =>
    JSON.stringify({
      type: 'assistant',
      uuid: id,
      timestamp: new Date().toISOString(),
      message: { id, model: m, content: [{ type: 'text', text: 'ok' }] },
    });
  writeFileSync(path, `${rec('a', 'claude-old-1')}\n${rec('b', model)}\n`);
  return path;
}

/** Run the PreToolUse gate on one Bash command. @param {string} state @param {string} fires @param {string} line */
function bash(state, fires, line, command = 'sleep 30') {
  const out = execFileSync('node', [PRE_TOOL_USE], {
    input: JSON.stringify({
      session_id: 's-1',
      transcript_path: line,
      cwd: state,
      tool_name: 'Bash',
      tool_input: { command },
    }),
    encoding: 'utf8',
    env: {
      ...process.env,
      MY_COMMAND_HOOK_STATE: state,
      MY_COMMAND_HOOKS: '1',
      CLAUDE_CONFIG_DIR: state,
      MY_COMMAND_RULE_FIRES: fires,
    },
  });
  return out.trim() ? JSON.parse(out) : {};
}

/** @param {Record<string, any>} answer */
const denied = (answer) => answer?.hookSpecificOutput?.permissionDecision === 'deny';

test('every gate name a refusal is keyed by has a registered rule, and nothing else does', () => {
  const used = new Set();
  for (const file of ['pre-tool-use.mjs', 'stop.mjs']) {
    const text = readFileSync(join(HERE, file), 'utf8');
    for (const m of text.matchAll(/alreadyDenied\(session, '([a-z]+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/recordFire\('gate\/([a-z]+)'\)/g)) used.add(m[1]);
  }
  assert.deepEqual([...used].sort(), [...GATE_NAMES].sort());
});

test('rule ids are unique, well formed, and their sources exist', () => {
  const ids = RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const rule of RULES) {
    assert.match(rule.id, /^(gate|prose)\/[a-z][a-z-]*$/);
    assert.ok(rule.id.startsWith(`${rule.kind}/`), rule.id);
    assert.ok(existsSync(join(ROOT, rule.source)), `${rule.id}: ${rule.source}`);
    assert.ok(rule.summary.length > 10, rule.id);
  }
  assert.equal(ruleById('gate/serial')?.kind, 'gate');
  assert.equal(ruleById('nope'), undefined);
});

test('a first refusal records one fire with the session and the latest model; a repeat records none', () => {
  const state = scratch();
  const fires = join(state, 'fires.jsonl');
  const line = transcript(state, 'claude-new-9');

  assert.ok(denied(bash(state, fires, line)));
  // The same subject is never refused twice, so it is never counted twice either.
  assert.ok(!denied(bash(state, fires, line)));

  const rows = readFires(fires);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rule, 'gate/sleep');
  assert.equal(rows[0].model, 'claude-new-9');
  assert.equal(rows[0].session, 's-1');
  assert.equal(rows[0].origin, 'hook');
});

test('an unwritable fire record leaves the refusal exactly as it was', () => {
  const state = scratch();
  const blocker = join(state, 'file');
  writeFileSync(blocker, 'x');
  // A path *under a file* can never be created, so every append fails.
  const answer = bash(state, join(blocker, 'fires.jsonl'), transcript(state, 'm'));
  assert.ok(denied(answer));
});

test('recordFire never throws and reports a failed write as null', () => {
  const dir = scratch();
  const blocker = join(dir, 'file');
  writeFileSync(blocker, 'x');
  const before = process.env.MY_COMMAND_RULE_FIRES;
  process.env.MY_COMMAND_RULE_FIRES = join(blocker, 'x.jsonl');
  try {
    assert.equal(recordFire('gate/serial', { model: 'm' }), null);
  } finally {
    if (before === undefined) delete process.env.MY_COMMAND_RULE_FIRES;
    else process.env.MY_COMMAND_RULE_FIRES = before;
  }
});

test('the fire record sits beside the proxy store when one is configured', () => {
  const saved = { ...process.env };
  try {
    delete process.env.MY_COMMAND_RULE_FIRES;
    process.env.CLAUDE_PROXY_STORE = '/p/logs/sessions/';
    assert.equal(firesPath(), '/p/logs/rule-fires.jsonl');
    delete process.env.CLAUDE_PROXY_STORE;
    process.env.CLAUDE_CONFIG_DIR = '/c';
    assert.equal(firesPath(), '/c/my-command/rule-fires.jsonl');
    process.env.MY_COMMAND_RULE_FIRES = '/x/f.jsonl';
    assert.equal(firesPath(), '/x/f.jsonl');
  } finally {
    for (const key of ['MY_COMMAND_RULE_FIRES', 'CLAUDE_PROXY_STORE', 'CLAUDE_CONFIG_DIR']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('the model is read from the transcript tail, and a missing transcript gives null', () => {
  const dir = scratch();
  assert.equal(modelFromTranscript(transcript(dir, 'claude-x')), 'claude-x');
  assert.equal(modelFromTranscript(join(dir, 'absent.jsonl')), null);
  assert.equal(modelFromTranscript(''), null);
});

test('readFires skips torn and foreign lines', () => {
  const dir = scratch();
  const path = join(dir, 'f.jsonl');
  writeFileSync(
    path,
    `${JSON.stringify({ rule: 'gate/serial', at: '2026-01-01T00:00:00Z', model: 'm', session: 's' })}\n{"torn\n{"other":1}\n`,
  );
  const rows = readFires(path);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].origin, 'hook');
});
