// The gates, exercised the way the harness runs them: a real event on stdin, a real
// decision on stdout.
//
// A false denial here does not fail a build — it blocks a legitimate tool call in daily
// work. So the cases that matter most are the ones asserting a call is *allowed*: a
// parallel batch, a re-read of a changed file, a `cd` that resolves, and a second refusal
// of the same subject.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { install } from './install-hooks.mjs';
import { dumpedFiles, foregroundSleep, heredocWrite, unmatchedGlob } from './lib/bash-shapes.mjs';
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

// ── read before write ───────────────────────────────────────────────────────────────

test('unread edit: an Edit of a path this session never read is refused, with the batch instruction', () => {
  const dir = scratch();
  const file = join(dir, 'CHANGELOG.md');
  writeFileSync(file, '# Changelog\n');
  const answer = hook(PRE_TOOL_USE, {
    session_id: 'e1',
    transcript_path: transcript(['prompt', [read('Read', { file_path: join(dir, 'elsewhere.ts') })]]),
    cwd: dir,
    tool_name: 'Edit',
    tool_input: { file_path: file, old_string: 'a', new_string: 'b' },
  });
  assert.equal(denied(answer), true);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /has not been read yet/);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /every \*other\* file this edit pass will write/);
});

test('unread edit: a read of the path — whole or sliced — allows the edit, and a new file needs none', () => {
  const dir = scratch();
  const file = join(dir, 'spec.md');
  writeFileSync(file, '# Spec\n');

  for (const priorRead of [{ file_path: file }, { file_path: file, offset: 1, limit: 5 }]) {
    const answer = hook(PRE_TOOL_USE, {
      session_id: 'e2',
      transcript_path: transcript(['prompt', [read('Read', priorRead)]]),
      cwd: dir,
      tool_name: 'Edit',
      tool_input: { file_path: file, old_string: 'a', new_string: 'b' },
    });
    assert.equal(denied(answer), false, `should allow after ${JSON.stringify(priorRead)}`);
  }

  // Creating a file carries no read-before-write precondition.
  const created = hook(PRE_TOOL_USE, {
    session_id: 'e3',
    transcript_path: transcript(['prompt']),
    cwd: dir,
    tool_name: 'Write',
    tool_input: { file_path: join(dir, 'brand-new.md'), content: 'hi' },
  });
  assert.equal(denied(created), false);
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
  // refused exactly that path left no path at all. The one-denial-per-subject rule made it
  // worse rather than safer: the same command was allowed early in a run and refused later,
  // and the workaround one session reached for clobbered its own uncommitted edits.
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
