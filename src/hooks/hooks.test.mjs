// The gates, exercised the way the harness runs them: a real event on stdin, a real
// decision on stdout.
//
// A false denial here does not fail a build — it blocks a legitimate tool call in daily
// work. So the cases that matter most are the ones asserting a call is *allowed*: a
// parallel batch, a re-read of a changed file, a `cd` that resolves, and a second refusal
// of the same subject.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { install } from './install-hooks.mjs';
import {
  dumpedFiles,
  foregroundSleep,
  heredocWrite,
  inlineScriptJson,
  perPathDiff,
  ranToolkit,
  stdinProseFlag,
  unmatchedGlob,
} from './lib/bash-shapes.mjs';
import { isReadOnly } from './lib/read-only.mjs';
import { entries, lastFullReadOf, nestedRunOpen, returnMarker, timeline } from './lib/transcript.mjs';

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
 * disposable, so one test's denial cannot suppress another's.
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
 * string 'prompt' for a user message, or 'text' for a text-only reply, or `{say, calls}` for a
 * turn whose text matters — a nested handback, whose last line carries the return marker.
 * @param {('prompt' | 'text' | {name: string, input: Record<string, unknown>}[]
 *   | {say: string, calls?: {name: string, input: Record<string, unknown>}[]})[]} spec
 * @param {number} [startedAt]
 * @returns {string}
 */
function transcript(spec, startedAt = Date.now() - 600_000) {
  const dir = scratch();
  const path = join(dir, 'transcript.jsonl');
  const lines = spec.map((item, i) => {
    const timestamp = new Date(startedAt + i * 1000).toISOString();
    if (item && !Array.isArray(item) && typeof item === 'object') {
      return JSON.stringify({
        type: 'assistant',
        uuid: `a${i}`,
        timestamp,
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: item.say },
            ...(item.calls ?? []).map((u, n) => ({
              type: 'tool_use',
              id: `t${i}-${n}`,
              name: u.name,
              input: u.input,
            })),
          ],
        },
      });
    }
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

/**
 * A transcript in the shape the harness actually writes: **one record per content block**,
 * every block of one assistant message carrying that message's `id` and its own `uuid`. The
 * builder above puts a turn's blocks in a single record, which no real session does — and
 * that difference is exactly what hid the miscount, since a turn of eight parallel `Read`s
 * arrives as eight records.
 *
 * `failed` names the calls whose `tool_result` came back an error, addressed as
 * `<turn index>-<call index>`, so a refused read can be told from one that returned content.
 * @param {('prompt' | {name: string, input: Record<string, unknown>}[])[]} spec
 * @param {{failed?: string[], startedAt?: number}} [options]
 * @returns {string}
 */
function splitTranscript(spec, options = {}) {
  const startedAt = options.startedAt ?? Date.now() - 600_000;
  const failed = new Set(options.failed ?? []);
  const dir = scratch();
  const path = join(dir, 'transcript.jsonl');
  /** @type {string[]} */
  const lines = [];

  spec.forEach((item, i) => {
    const timestamp = new Date(startedAt + i * 1000).toISOString();
    if (item === 'prompt') {
      lines.push(
        JSON.stringify({
          type: 'user',
          uuid: `u${i}`,
          timestamp,
          message: { role: 'user', content: [{ type: 'text', text: 'do the thing' }] },
        }),
      );
      return;
    }
    const id = `msg_${i}`;
    // The text block is its own record too, exactly as the harness writes it.
    lines.push(
      JSON.stringify({
        type: 'assistant',
        uuid: `a${i}-text`,
        timestamp,
        message: { id, role: 'assistant', content: [{ type: 'text', text: 'looking' }] },
      }),
    );
    item.forEach((u, n) => {
      lines.push(
        JSON.stringify({
          type: 'assistant',
          uuid: `a${i}-${n}`,
          timestamp,
          message: {
            id,
            role: 'assistant',
            content: [{ type: 'tool_use', id: `t${i}-${n}`, name: u.name, input: u.input }],
          },
        }),
      );
    });
    // Results come back in one user record, the way the harness returns a batch.
    lines.push(
      JSON.stringify({
        type: 'user',
        uuid: `ur${i}`,
        timestamp,
        message: {
          role: 'user',
          content: item.map((_u, n) => ({
            type: 'tool_result',
            tool_use_id: `t${i}-${n}`,
            is_error: failed.has(`${i}-${n}`),
            content: failed.has(`${i}-${n}`) ? 'refused' : 'ok',
          })),
        },
      }),
    );
  });

  writeFileSync(path, `${lines.join('\n')}\n`);
  return path;
}

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

// ── the turn boundary, as the harness actually writes it ────────────────────────────

test('one message is one turn even though its blocks are separate records', () => {
  const line = timeline(
    entries(splitTranscript(['prompt', [1, 2, 3, 4, 5].map((n) => read('Read', { file_path: `/x/${n}.ts` }))])),
  );
  const assistantTurns = line.filter((t) => t !== null);
  assert.equal(assistantTurns.length, 1, 'five parallel calls are one turn, not five');
  assert.equal(assistantTurns[0].toolUses.length, 5);
});

test('serial discovery: a parallel batch is never refused, in the real transcript shape', () => {
  // The reproduction: eight parallel `Read`s in one turn, refused as "call #7 in a row, each
  // in its own turn" because each block was counted as a turn of its own.
  const batch = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => read('Read', { file_path: `/x/${n}.ts` }));
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'pb1',
    transcript_path: splitTranscript(['prompt', batch]),
    cwd: '/x',
    tool_name: 'Read',
    tool_input: { file_path: '/x/8.ts' },
  });
  assert.equal(denied(answer), false);
});

test('serial discovery: batched turns never accumulate, however many there are', () => {
  // Four consecutive turns, each correctly batched. The prescribed form must not be refused
  // just because there were four of them.
  /** @type {('prompt' | {name: string, input: Record<string, unknown>}[])[]} */
  const spec = [
    'prompt',
    ...[0, 1, 2, 3].map((turn) => [1, 2, 3].map((n) => read('Read', { file_path: `/x/${turn}-${n}.ts` }))),
  ];
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'pb2',
    transcript_path: splitTranscript(spec),
    cwd: '/x',
    tool_name: 'Read',
    tool_input: { file_path: '/x/next.ts' },
  });
  assert.equal(denied(answer), false);
});

test('serial discovery: genuinely serial single-call turns are still refused', () => {
  // The case the gate is for, in the same real shape: one call per turn, nothing between.
  /** @type {('prompt' | {name: string, input: Record<string, unknown>}[])[]} */
  const spec = ['prompt', ...['a', 'b', 'c'].map((name) => [read('Read', { file_path: `/x/${name}.ts` })])];
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'pb3',
    transcript_path: splitTranscript(spec),
    cwd: '/x',
    tool_name: 'Read',
    tool_input: { file_path: '/x/d.ts' },
  });
  assert.equal(denied(answer), true);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /parallel tool calls in a single turn/);
});

test('a batch does not refuse its own calls as reads it already made', () => {
  // Ten parallel reads of ten distinct, never-read files: nine came back refused because the
  // gate had already recorded each one as read while the same batch was being processed.
  const dir = scratch();
  const files = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => join(dir, `f${n}.ts`));
  const old = (Date.now() - 3_600_000) / 1000;
  for (const file of files) {
    writeFileSync(file, 'x\n');
    utimesSync(file, old, old);
  }

  const batch = files.map((file) => read('Read', { file_path: file }));
  const line = splitTranscript(['prompt', batch]);
  for (const file of files) {
    const answer = hook(PRE_TOOL_USE, {
      session_id: 'pb4',
      transcript_path: line,
      cwd: dir,
      tool_name: 'Read',
      tool_input: { file_path: file },
    });
    assert.equal(denied(answer), false, `${file} is being read by this very batch`);
  }
});

test('a read that was refused is not recorded as a read', () => {
  const dir = scratch();
  const file = join(dir, 'api.ts');
  writeFileSync(file, 'export const a = 1;\n');
  const old = (Date.now() - 3_600_000) / 1000;
  utimesSync(file, old, old);

  // The earlier call never returned content, so re-issuing it is the first real read.
  const refused = splitTranscript(['prompt', [read('Read', { file_path: file })], [read('Grep', { pattern: 'x' })]], {
    failed: ['1-0'],
  });
  assert.equal(
    denied(
      hook(PRE_TOOL_USE, {
        session_id: 'fr1',
        transcript_path: refused,
        cwd: dir,
        tool_name: 'Read',
        tool_input: { file_path: file },
      }),
    ),
    false,
  );

  // The same transcript with the read succeeding is the redundant re-read it always was.
  const succeeded = splitTranscript(['prompt', [read('Read', { file_path: file })], [read('Grep', { pattern: 'x' })]]);
  assert.equal(
    denied(
      hook(PRE_TOOL_USE, {
        session_id: 'fr2',
        transcript_path: succeeded,
        cwd: dir,
        tool_name: 'Read',
        tool_input: { file_path: file },
      }),
    ),
    true,
  );
});

test('a transcript belonging to another run is not evidence about this one', () => {
  const dir = scratch();
  const file = join(dir, 'api.ts');
  writeFileSync(file, 'export const a = 1;\n');
  const old = (Date.now() - 3_600_000) / 1000;
  utimesSync(file, old, old);

  // A subagent's call arrives carrying the parent's transcript, while its own turns are
  // written beside it under `subagents/`. The parent's history says this file was read; the
  // run actually making the call may never have read it, so no gate may judge from it.
  const parent = splitTranscript(['prompt', [read('Read', { file_path: file })], [read('Grep', { pattern: 'x' })]]);
  const event = {
    session_id: 'ft1',
    transcript_path: parent,
    cwd: dir,
    tool_name: 'Read',
    tool_input: { file_path: file },
  };
  assert.equal(denied(hook(PRE_TOOL_USE, event)), true, 'with no subagent, the parent transcript is this run');

  const sub = join(dirname(parent), 'transcript', 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'agent-1.jsonl'), '{}\n');
  assert.equal(denied(hook(PRE_TOOL_USE, event)), false, 'a live subagent means this history is not its own');
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

// ── redundant reads: per-path, not session-wide ──────────────────────────────────────

test('redundant read: an edit to a *different* file does not license a re-read of this one', () => {
  // The recorded sessions all re-read one file while editing others, so a session-wide
  // "something changed" test would have allowed every one of them.
  const dir = scratch();
  const stale = join(dir, 'api.ts');
  const edited = join(dir, 'other.ts');
  writeFileSync(stale, 'export const a = 1;\n');
  const old = (Date.now() - 3_600_000) / 1000;
  utimesSync(stale, old, old);

  const line = transcript([
    'prompt',
    [read('Read', { file_path: stale })],
    [read('Read', { file_path: edited })],
    [read('Edit', { file_path: edited })],
  ]);
  // Written after the reads, so this file genuinely did change — the other one did not.
  writeFileSync(edited, 'export const b = 2;\n');

  const answer = hook(PRE_TOOL_USE, {
    session_id: 'r5',
    transcript_path: line,
    cwd: dir,
    tool_name: 'Read',
    tool_input: { file_path: stale },
  });
  assert.equal(denied(answer), true);

  // And the file that did change is still re-readable.
  const allowed = hook(PRE_TOOL_USE, {
    session_id: 'r6',
    transcript_path: line,
    cwd: dir,
    tool_name: 'Read',
    tool_input: { file_path: edited },
  });
  assert.equal(denied(allowed), false);
});

// ── read before write: the gate that was removed ────────────────────────────────────

test('no edit is refused for want of a prior read, whatever the transcript says', () => {
  const dir = scratch();
  const existing = join(dir, 'CHANGELOG.md');
  writeFileSync(existing, '# Changelog\n');

  // The case the removed gate refused: an existing file, never read in this transcript. The
  // harness's own precondition still rejects a genuinely unread edit — but the hook could not
  // tell that apart from a read it simply could not see, so it no longer offers an opinion.
  const existingFile = hook(PRE_TOOL_USE, {
    session_id: 'e1',
    transcript_path: transcript(['prompt', [read('Read', { file_path: join(dir, 'elsewhere.ts') })]]),
    cwd: dir,
    tool_name: 'Edit',
    tool_input: { file_path: existing, old_string: 'a', new_string: 'b' },
  });
  assert.equal(denied(existingFile), false);

  // A `Write` of a path that does not exist is a create, and no read can ever precede it —
  // the refusal it used to draw was one nothing could satisfy.
  for (const path of [join(dir, 'tmp', 'pr-body.md'), join(dir, 'commit-msg.txt')]) {
    const created = hook(PRE_TOOL_USE, {
      session_id: 'e2',
      transcript_path: transcript(['prompt']),
      cwd: dir,
      tool_name: 'Write',
      tool_input: { file_path: path, content: 'hi' },
    });
    assert.equal(denied(created), false, `creating ${path} needs no prior read`);
  }
});

// ── the refusal hands over the form that runs ───────────────────────────────────────

test('relative cd: the denial names the absolute path the cd was reaching for', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'server', 'nexus'), { recursive: true });
  const from = join(dir, 'apps', 'admin');
  mkdirSync(from, { recursive: true });

  const answer = hook(PRE_TOOL_USE, {
    session_id: 'cd9',
    transcript_path: transcript(['prompt']),
    cwd: from,
    tool_name: 'Bash',
    tool_input: { command: 'cd server/nexus && ls' },
  });
  assert.equal(denied(answer), true);
  // Not "spell it absolutely" — the absolute path itself, ready to use.
  assert.ok(answer.hookSpecificOutput.permissionDecisionReason.includes(join(dir, 'server', 'nexus')));
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /--cwd /);
});

test('unmatched glob: the denial carries the same command with the pattern quoted', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'a.md'), '');
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'g9',
    transcript_path: transcript(['prompt']),
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command: 'grep -rn foo --include=*.ts .' },
  });
  assert.equal(denied(answer), true);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /--include='\*\.ts'/);
});

test('heredoc: a stdin heredoc is untouched even beside a quoted arrow or a pipe', () => {
  // Both of these fed a program's stdin, which the gate is documented not to touch. The `->`
  // inside a quoted `sed` script read as a redirect and refused the whole call.
  assert.equal(heredocWrite("ls -l $HOOK | sed 's/.*-> //'\nnode hook <<JSON\n{}\nJSON"), false);
  assert.equal(heredocWrite('node hook <<JSON | jq -r .decision\n{"a":1}\nJSON'), false);
  // A `>` inside the body is data, not a redirect.
  assert.equal(heredocWrite('node hook <<JSON\n{"note":"a > b"}\nJSON'), false);
  // A real redirect still composes a file, and so does a tee.
  assert.equal(heredocWrite('cat <<EOF > /tmp/out.txt\nhi\nEOF'), true);
  assert.equal(heredocWrite('cat <<EOF | tee /tmp/out.txt\nhi\nEOF'), true);
});

// ── bash shapes that fail on their own ──────────────────────────────────────────────

test('bash shapes: the detectors judge only what they can see', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'a.ts'), '');

  // Globs: an unquoted pattern matching nothing aborts the command under zsh.
  assert.equal(unmatchedGlob('ls vitest.config*', dir), 'vitest.config*');
  assert.equal(unmatchedGlob('grep -r --include=*.ts foo .', dir), '--include=*.ts');
  assert.equal(unmatchedGlob('ls *.ts', dir), null);
  assert.equal(unmatchedGlob("rg -g '*.md' foo", dir), null);
  assert.equal(unmatchedGlob('ls "$SOME/*.md"', dir), null);
  assert.equal(unmatchedGlob('ls $HOME/*.nope', dir), null);
  assert.equal(unmatchedGlob('cat <<EOF\n*.nope\nEOF', dir), null);

  // Foreground waits, which the harness refuses along with anything chained to them.
  assert.equal(foregroundSleep('pnpm start > srv.log 2>&1 & sleep 12; grep -i error srv.log', false), 'sleep 12');
  assert.equal(foregroundSleep('sleep 5', true), null);
  assert.equal(foregroundSleep('ls -la', false), null);

  // Heredocs that compose a file; the Write tool does the same with no shell.
  assert.equal(heredocWrite('cat > /tmp/x.sh <<EOF\necho hi\nEOF'), true);
  assert.equal(heredocWrite("tee pr-body.md <<'MD'\nbody\nMD"), true);
  assert.equal(heredocWrite('node - <<EOF\nconsole.log(1)\nEOF'), false);
  assert.equal(heredocWrite('ls -la > out.txt'), false);

  // Dumped files: only real files, only dumpers, and never through a redirect.
  const file = join(dir, 'a.ts');
  assert.deepEqual(dumpedFiles(`sed -n '1,50p' ${file}`, dir), [file]);
  assert.deepEqual(dumpedFiles('cat a.ts', dir), [file]);
  assert.deepEqual(dumpedFiles(`rg -n 'foo|bar' ${file}`, dir), []);
  assert.deepEqual(dumpedFiles(`cat ${file} > copy.ts`, dir), []);
});

test('bash shapes: each failing form is refused with the working one named', () => {
  const dir = scratch();
  /** @param {string} command @param {RegExp} expected @param {string} [cwd] */
  const refuses = (command, expected, cwd = dir) => {
    const answer = hook(PRE_TOOL_USE, {
      session_id: `b-${command.length}-${expected.source.length}`,
      transcript_path: transcript(['prompt']),
      cwd,
      tool_name: 'Bash',
      tool_input: { command },
    });
    assert.equal(denied(answer), true, `should refuse: ${command}`);
    assert.match(answer.hookSpecificOutput.permissionDecisionReason, expected);
  };

  refuses('ls vitest.config*', /no matches found/);
  refuses('grep -r --include=*.ts foo .', /rg -g '\*\.ts'/);
  refuses('pnpm start > srv.log 2>&1 & sleep 12; grep -i error srv.log', /run_in_background/);
  refuses('cat > /tmp/scratch.sh <<EOF\necho hi\nEOF', /`Write` tool/);
});

test('the job directory is reachable from a worktree, on the first call and the hundredth', () => {
  const dir = scratch();
  const worktree = join(dir, '.claude', 'worktrees', 'feat-x');
  const state = scratch();
  // The harness tells a job to keep its scratch under $CLAUDE_JOB_DIR/tmp, so a guard that
  // refused exactly that path left no path at all — and under one-denial-per-subject the same
  // command was allowed early in a run and refused later.
  for (const command of [
    'ls -la "$CLAUDE_JOB_DIR/tmp"',
    'cp src/my-command.ts "$CLAUDE_JOB_DIR/tmp/my-command.ts.bak"',
    'echo note > "$CLAUDE_JOB_DIR/tmp/note.txt"',
  ]) {
    for (const attempt of [1, 2]) {
      const answer = hook(
        PRE_TOOL_USE,
        {
          session_id: 'jobdir',
          transcript_path: transcript(['prompt']),
          cwd: worktree,
          tool_name: 'Bash',
          tool_input: { command },
        },
        state,
      );
      assert.equal(denied(answer), false, `attempt ${attempt} should allow: ${command}`);
    }
  }
});

test('bash shapes: the working forms all pass', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'a.ts'), '');
  for (const command of [
    "rg -g '*.ts' --files",
    'ls *.ts',
    'git -C /tmp status --porcelain',
    'node - <<EOF\nconsole.log(1)\nEOF',
    'my-command-tools state --cwd /tmp',
  ]) {
    const answer = hook(PRE_TOOL_USE, {
      session_id: 'b-ok',
      transcript_path: transcript(['prompt']),
      cwd: dir,
      tool_name: 'Bash',
      tool_input: { command },
    });
    assert.equal(denied(answer), false, `should allow: ${command}`);
  }
});

// ── re-narrowing and repeat probes ──────────────────────────────────────────────────

test('re-narrowing: dumping a file already read whole is refused; locating in it is not', () => {
  const dir = scratch();
  const file = join(dir, 'chartDefaults.ts');
  writeFileSync(file, 'export const a = 1;\n');
  const old = (Date.now() - 3_600_000) / 1000;
  utimesSync(file, old, old);
  const line = transcript(['prompt', [read('Read', { file_path: file })]]);

  const answer = hook(PRE_TOOL_USE, {
    session_id: 'n1',
    transcript_path: line,
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command: `sed -n '1,50p' ${file}` },
  });
  assert.equal(denied(answer), true);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /offset/);

  // The locate-first form the other gates recommend must stay available.
  const locate = hook(PRE_TOOL_USE, {
    session_id: 'n2',
    transcript_path: line,
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command: `rg -n 'firstSymbol|secondSymbol' ${file}` },
  });
  assert.equal(denied(locate), false);
});

test('repeat probe: the identical command is refused only while its answer cannot have changed', () => {
  const dir = scratch();
  const command = 'git log --oneline -5';

  const again = hook(PRE_TOOL_USE, {
    session_id: 'p1',
    // An earlier turn ran it; a read-only turn since cannot have changed the answer.
    transcript_path: transcript(['prompt', [read('Bash', { command })], [read('Grep', { pattern: 'x' })]]),
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command },
  });
  assert.equal(denied(again), true);
  assert.match(again.hookSpecificOutput.permissionDecisionReason, /every item at once/);

  // A duplicate inside one parallel batch is that batch's own business, not a repeat.
  const sameTurn = hook(PRE_TOOL_USE, {
    session_id: 'p1b',
    transcript_path: transcript(['prompt', [read('Bash', { command })]]),
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command },
  });
  assert.equal(denied(sameTurn), false);

  // An action since, or a new instruction from the user, can both change the answer.
  for (const spec of [
    ['prompt', [read('Bash', { command })], [read('Bash', { command: 'git commit -m x' })]],
    ['prompt', [read('Bash', { command })], 'prompt'],
  ]) {
    const answer = hook(PRE_TOOL_USE, {
      session_id: 'p2',
      transcript_path: transcript(/** @type {any} */ (spec)),
      cwd: dir,
      tool_name: 'Bash',
      tool_input: { command },
    });
    assert.equal(denied(answer), false);
  }
});

test('re-narrowing: a legitimate parallel batch of distinct probes is never refused', () => {
  // The constraint the whole gate set is bound by: one turn issuing eight probes is the
  // shape being asked for, and nothing here may make it harder than eight serial turns.
  const dir = scratch();
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) writeFileSync(join(dir, `f${n}.ts`), 'x\n');
  const batch = [1, 2, 3, 4, 5, 6, 7].map((n) => read('Bash', { command: `cat ${join(dir, `f${n}.ts`)}` }));
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'p3',
    transcript_path: transcript(['prompt', batch]),
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command: `cat ${join(dir, 'f8.ts')}` },
  });
  assert.equal(denied(answer), false);
});

// ── polling a watch that is already armed ───────────────────────────────────────────

test('watched condition: hand-polling a file a Monitor is already following is refused', () => {
  const dir = scratch();
  const log = join(dir, 'install.log');
  writeFileSync(log, 'installing\n');
  const line = transcript([
    'prompt',
    [read('Monitor', { command: `tail -f ${log} | grep --line-buffered -E 'done|Error'`, description: 'install' })],
  ]);

  const answer = hook(PRE_TOOL_USE, {
    session_id: 'w1',
    transcript_path: line,
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command: `tail -20 ${log}` },
  });
  assert.equal(denied(answer), true);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /already following/);

  // One refusal only: if the watch really has ended, the agent has to be able to proceed.
  const state = scratch();
  const event = {
    session_id: 'w2',
    transcript_path: line,
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command: `grep -c installing ${log}` },
  };
  assert.equal(denied(hook(PRE_TOOL_USE, event, state)), true);
  assert.equal(denied(hook(PRE_TOOL_USE, event, state)), false);
});

test('watched condition: an unrelated probe during a watch passes', () => {
  const dir = scratch();
  const log = join(dir, 'install.log');
  writeFileSync(log, 'installing\n');
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'w3',
    transcript_path: transcript(['prompt', [read('Monitor', { command: `tail -f ${log}` })]]),
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command: 'git status --porcelain' },
  });
  assert.equal(denied(answer), false);
});

// ── prose on stdin, guessed JSON, and the second diff ───────────────────────────────

test('bash shapes: the stdin prose flags, a path-narrowed diff, and a guessed JSON shape', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'pkg.json'), '{"a":1}');

  // Prose on stdin: the flag is what invites the heredoc that gets refused.
  assert.equal(stdinProseFlag('my-command-tools commit --message - src/a.ts')?.replacement, '--message-file');
  assert.equal(stdinProseFlag('my-command-tools pr --title x --body -')?.replacement, '--body-file');
  assert.equal(stdinProseFlag('my-command-tools commit --message-file /tmp/m.txt src/a.ts'), null);
  assert.equal(stdinProseFlag('git commit --message -'), null);

  // A diff narrowed to a path; enumerations are not content and are left alone.
  assert.equal(perPathDiff('git diff origin/main -- src/a.ts'), 'git diff origin/main -- src/a.ts');
  assert.equal(perPathDiff('gh pr diff 12 -- src/a.ts'), 'gh pr diff 12 -- src/a.ts');
  assert.equal(perPathDiff('git diff --name-only origin/main -- src/a.ts'), null);
  assert.equal(perPathDiff('git diff origin/main'), null);
  assert.equal(perPathDiff('rg -n foo -- src/a.ts'), null);

  // Several paths in one call is the batched form the shared prose prescribes — the fix for
  // the walk rather than the walk, so it is never the shape this gate reports.
  assert.equal(perPathDiff('git diff main...HEAD -- src/a.ts src/b.ts'), null);
  assert.equal(perPathDiff('git diff main...HEAD -- src/a.ts src/b.ts src/c.ts'), null);

  // Options that return a summary or an exit code re-fetch no hunks, and the index is a
  // question `scope --diff` cannot have answered.
  for (const flag of [
    '--quiet',
    '--exit-code',
    '--shortstat',
    '--summary',
    '-s',
    '--no-patch',
    '--cached',
    '--staged',
  ]) {
    assert.equal(perPathDiff(`git diff ${flag} -- src/a.ts`), null, `\`git diff ${flag}\` is not a re-fetch`);
  }

  // An inline one-liner reaching into a JSON document that exists.
  assert.deepEqual(inlineScriptJson(`node -e "require('${join(dir, 'pkg.json')}')"`, dir), [join(dir, 'pkg.json')]);
  assert.deepEqual(inlineScriptJson('python3 -c "import json; print(1)"', dir), []);
  assert.deepEqual(inlineScriptJson(`node ${join(dir, 'pkg.json')}`, dir), []);

  // The flag has to be the runner's own: a script on disk piped into a binary that happens to
  // take `-e` is not a one-liner, and refusing it would block a legitimate command outright.
  assert.deepEqual(inlineScriptJson(`node scripts/gen.mjs ${join(dir, 'pkg.json')} | grep -e ERROR`, dir), []);
  // The runner's own options may still sit between it and the flag.
  assert.deepEqual(inlineScriptJson(`node --stack-size=2000 -e "require('${join(dir, 'pkg.json')}')"`, dir), [
    join(dir, 'pkg.json'),
  ]);

  // A document the one-liner only writes was never guessed at — there is no shape to get wrong.
  assert.deepEqual(inlineScriptJson(`node -e "writeFileSync('${join(dir, 'pkg.json')}', out)"`, dir), []);
  assert.deepEqual(inlineScriptJson(`node -e "console.log(1)" > ${join(dir, 'pkg.json')}`, dir), []);

  assert.equal(ranToolkit('my-command-tools scope --diff --branch x', 'scope', '--diff'), true);
  assert.equal(ranToolkit('my-command-tools scope --branch x', 'scope', '--diff'), false);
});

test('one diff call: the batched form the shared prose prescribes is a shape the gate allows', () => {
  // The prose and the gate are two surfaces stating one rule, and a run carries both. Grepping
  // the docs cannot check this — prose has to be able to name the shape it forbids — so the
  // agreement is asserted by running the gate over the line the prose actually prescribes.
  const prose = readFileSync(join(HERE, '..', 'shared', 'batched-discovery.md'), 'utf8');
  const prescribed = prose.match(/Pass every path to a single `([^`]+)`/);
  assert.ok(prescribed, 'src/shared/batched-discovery.md no longer prescribes one batched diff call');
  assert.equal(
    perPathDiff(prescribed[1]),
    null,
    `the gate refuses the very call the shared prose prescribes: ${prescribed[1]}`,
  );
});

test('stdin prose: the refusal names the path-taking flag, and once only', () => {
  const dir = scratch();
  const state = scratch();
  const event = {
    session_id: 'sp1',
    transcript_path: transcript(['prompt']),
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command: 'my-command-tools pr --title "x" --body -' },
  };
  const answer = hook(PRE_TOOL_USE, event, state);
  assert.equal(denied(answer), true);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /--body-file/);
  assert.equal(denied(hook(PRE_TOOL_USE, event, state)), false);
});

test('second diff: refused only once `scope --diff` has already returned the hunks', () => {
  const dir = scratch();
  const scoped = transcript([
    'prompt',
    [read('Bash', { command: 'my-command-tools scope --diff --branch fix/x' })],
    [read('Read', { file_path: join(dir, 'notes.md') })],
  ]);
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'd1',
    transcript_path: scoped,
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command: 'git diff origin/main -- src/a.ts' },
  });
  assert.equal(denied(answer), true);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /no second diff call/);

  // With no prior scope --diff, the narrowed diff *is* the first call and is left alone.
  const first = hook(PRE_TOOL_USE, {
    session_id: 'd2',
    transcript_path: transcript(['prompt']),
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command: 'git diff origin/main -- src/a.ts' },
  });
  assert.equal(denied(first), false);
});

test('guessed JSON: a one-liner over an unread document is refused, and reading it allows it', () => {
  const dir = scratch();
  const doc = join(dir, 'suggestions.json');
  writeFileSync(doc, '{"items":[]}');
  const command = `node -e "const d=require('${doc}'); console.log(d.suggestions.length)"`;

  const answer = hook(PRE_TOOL_USE, {
    session_id: 'j1',
    transcript_path: transcript(['prompt']),
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command },
  });
  assert.equal(denied(answer), true);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /never read/);

  const afterRead = hook(PRE_TOOL_USE, {
    session_id: 'j2',
    transcript_path: transcript(['prompt', [read('Read', { file_path: doc })]]),
    cwd: dir,
    tool_name: 'Bash',
    tool_input: { command },
  });
  assert.equal(denied(afterRead), false);
});

test('watched condition: the Read gate follows the watch output, not every name on its command line', () => {
  const dir = scratch();
  const log = join(dir, 'out.log');
  const script = join(dir, 'build.mjs');
  const config = join(dir, 'app.config.json');
  for (const [path, body] of [
    [log, 'running\n'],
    [script, 'export default 1\n'],
    [config, '{}\n'],
  ]) {
    writeFileSync(path, body);
  }
  const line = transcript([
    'prompt',
    [read('Bash', { command: `node ${script} --config ${config} > ${log} 2>&1`, run_in_background: true })],
  ]);
  /** @param {string} session @param {string} file */
  const at = (session, file) =>
    hook(PRE_TOOL_USE, {
      session_id: session,
      transcript_path: line,
      cwd: dir,
      tool_name: 'Read',
      tool_input: { file_path: file },
    });

  // The redirect target is what the watch is writing, so reading it by hand is the polling.
  assert.equal(denied(at('wo1', log)), true);

  // The script it runs and the config it was handed are named on the same command line, and a
  // first read of either is discovery — refusing it would cost a turn to learn nothing.
  assert.equal(denied(at('wo2', script)), false);
  assert.equal(denied(at('wo3', config)), false);

  // Same basename, another directory: not the file the watch is writing.
  const elsewhere = join(scratch(), 'out.log');
  writeFileSync(elsewhere, 'unrelated\n');
  assert.equal(denied(at('wo4', elsewhere)), false);
});

test('watched condition: a Read that polls a watched file is refused, an unrelated Read is not', () => {
  const dir = scratch();
  const log = join(dir, 'verify.log');
  writeFileSync(log, 'running\n');
  const line = transcript([
    'prompt',
    [read('Bash', { command: `pnpm verify > ${log} 2>&1`, run_in_background: true })],
  ]);

  const answer = hook(PRE_TOOL_USE, {
    session_id: 'rp1',
    transcript_path: line,
    cwd: dir,
    tool_name: 'Read',
    tool_input: { file_path: log },
  });
  assert.equal(denied(answer), true);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /already following/);

  const unrelated = hook(PRE_TOOL_USE, {
    session_id: 'rp2',
    transcript_path: line,
    cwd: dir,
    tool_name: 'Read',
    tool_input: { file_path: join(dir, 'other.md') },
  });
  assert.equal(denied(unrelated), false);
});

// ── the closing-turn anchor ─────────────────────────────────────────────────────────

test('closing anchor: a lone TodoWrite completing the anchor is refused; riding along passes', () => {
  const dir = scratch();
  const todos = [
    { content: 'implement the fix', status: 'completed' },
    { content: 'close the run in a text-only turn', status: 'completed' },
  ];
  const alone = hook(PRE_TOOL_USE, {
    session_id: 'ta1',
    transcript_path: transcript(['prompt', [read('TodoWrite', { todos })]]),
    cwd: dir,
    tool_name: 'TodoWrite',
    tool_input: { todos },
  });
  assert.equal(denied(alone), true);
  assert.match(alone.hookSpecificOutput.permissionDecisionReason, /end on a tool call/);

  // The prescribed form: marked in the same turn as the run's last real work.
  const together = hook(PRE_TOOL_USE, {
    session_id: 'ta2',
    transcript_path: transcript([
      'prompt',
      [read('Bash', { command: 'my-command-tools worktree end --branch fix/x' }), read('TodoWrite', { todos })],
    ]),
    cwd: dir,
    tool_name: 'TodoWrite',
    tool_input: { todos },
  });
  assert.equal(denied(together), false);

  // An anchor still open is not this shape at all.
  const open = hook(PRE_TOOL_USE, {
    session_id: 'ta3',
    transcript_path: transcript(['prompt']),
    cwd: dir,
    tool_name: 'TodoWrite',
    tool_input: {
      todos: [
        { content: 'implement the fix', status: 'in_progress' },
        { content: 'close the run in a text-only turn', status: 'pending' },
      ],
    },
  });
  assert.equal(denied(open), false);
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

// ── the outcome gate: only the outermost run owes one ───────────────────────────────
//
// A text-only message ends the assistant's turn, so a command invoked inline by another hands
// back *with* the parent's next call rather than closing.

test('stop: a nested inline handback is not asked for an outcome', () => {
  const line = transcript([
    'prompt',
    [read('Skill', { skill: 'clean' })],
    {
      say: 'Comments tightened in 3 files; nothing committed.\n\nRETURN /clean',
      calls: [read('Skill', { skill: 'pr' })],
    },
  ]);
  assert.deepEqual(hook(STOP, { session_id: 'n1', transcript_path: line }), {});
});

test('stop: a namespaced handback marker counts the same', () => {
  const line = transcript([
    'prompt',
    [read('Skill', { skill: 'my-command:clean' })],
    { say: 'done\n\nRETURN /my-command:clean', calls: [read('Bash', { command: 'my-command-tools state' })] },
  ]);
  assert.deepEqual(hook(STOP, { session_id: 'n2', transcript_path: line }), {});
});

test('stop: a pipeline with a nested command still open is not asked for an outcome', () => {
  // No marker has accounted for the /clean call yet, so this stop lands mid-pipeline.
  const line = transcript([
    'prompt',
    [read('Skill', { skill: 'clean' })],
    [read('Edit', { file_path: '/w/src/a.ts' })],
  ]);
  assert.deepEqual(hook(STOP, { session_id: 'n3', transcript_path: line }), {});
});

test('stop: an outermost run abandoned after its nested runs returned is still refused', () => {
  // Both children handed back, so nothing is open; the parent ended on teardown and never spoke.
  const line = transcript([
    'prompt',
    [read('Skill', { skill: 'clean' })],
    { say: 'cleaned\n\nRETURN /clean', calls: [read('Skill', { skill: 'pr' })] },
    {
      say: 'PR #91 opened\n\nRETURN /pr',
      calls: [read('Bash', { command: 'my-command-tools worktree end --branch x' })],
    },
    [read('Bash', { command: 'my-command-tools worktree end --branch x' })],
  ]);
  const answer = hook(STOP, { session_id: 'n4', transcript_path: line });
  assert.equal(answer.decision, 'block');
  assert.match(answer.reason, /outermost run/);
});

test('stop: a marker in earlier prose does not excuse a run that ends on a tool call', () => {
  // The marker counts only on the handback message's own last line.
  const line = transcript([
    'prompt',
    { say: 'RETURN /clean\n\nand now the rest of the work' },
    [read('Bash', { command: 'my-command-tools verify' })],
  ]);
  assert.equal(hook(STOP, { session_id: 'n5', transcript_path: line }).decision, 'block');
});

test('the return marker reads a real invocation name and never the placeholder', () => {
  const line = timeline([
    {
      type: 'assistant',
      uuid: 'a0',
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'done\n\nRETURN /task' }] },
    },
  ]);
  assert.equal(returnMarker(line[0]), '/task');

  // A session that merely loaded a command file has handed nothing back.
  const loaded = timeline([
    {
      type: 'assistant',
      uuid: 'a0',
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'the rule says RETURN /<command>' }] },
    },
  ]);
  assert.equal(returnMarker(loaded[0]), null);
  assert.equal(returnMarker(undefined), null);
});

test('an open nested run is counted only within the current task', () => {
  // A Skill call before the last prompt belongs to a finished task.
  const before = timeline([
    {
      type: 'assistant',
      uuid: 'a0',
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't0', name: 'Skill', input: { skill: 'clean' } }],
      },
    },
    {
      type: 'user',
      uuid: 'u1',
      timestamp: new Date().toISOString(),
      message: { role: 'user', content: [{ type: 'text', text: 'next thing' }] },
    },
    {
      type: 'assistant',
      uuid: 'a2',
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] },
    },
  ]);
  assert.equal(nestedRunOpen(before), false);
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
  // The editor tools have to be matched or the read-before-write gate never sees a call.
  for (const tool of ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'NotebookEdit']) {
    assert.ok(settings.hooks.PreToolUse[0].matcher.split('|').includes(tool), `matcher must cover ${tool}`);
  }
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
