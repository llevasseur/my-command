#!/usr/bin/env node
// PreToolUse — three gates on the shapes that a written-down rule kept failing to stop.
//
// Each of these was prose first, then a step in the commands that need it, and tripped
// anyway across sessions recorded after both. Prose and workflow steps depend on being
// recalled at the moment of the call; this fires whether or not anyone remembered.
//
// The gates:
//   serial discovery  — a 4th straight turn of nothing but read-only calls (batch instead)
//   redundant read    — a whole-file Read of a file already read whole and unchanged since
//   relative cd       — `cd <relative path>` that does not resolve from the current dir
//
// The first two are one hook on purpose: they are the same defect seen along two axes —
// discovery spread over turns that should have been one turn, and the same bytes paid for
// twice — and they read the same transcript to decide. Splitting them would parse it twice
// and let the two answers disagree.
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { deny, guard, readEvent } from './lib/io.mjs';
import { isReadOnly } from './lib/read-only.mjs';
import { alreadyDenied, clearGate } from './lib/state.mjs';
import { entries, issued, lastFullReadOf, timeline, turns } from './lib/transcript.mjs';

/**
 * Turns of pure discovery allowed in a row. The 4th is refused — three batched turns is
 * already tens of files, so reaching a 4th means the reads were not enumerated up front.
 */
const MAX_SERIAL_TURNS = 3;

/**
 * How much newer than the earlier read a file's mtime must be to count as changed. A write
 * and the read that follows it can land in the same second, and the wrong call to get
 * wrong is refusing a genuine re-read.
 */
const CHANGED_GRACE_MS = 2000;

guard(() => {
  const event = readEvent();
  if (!event) return;
  const name = event.tool_name;
  const input = event.tool_input ?? {};
  const session = String(event.session_id ?? '');

  // Cheapest gate first, and the only one that needs no transcript: a command that cannot
  // resolve its own `cd` is going to fail whatever else is true.
  if (name === 'Bash' && relativeCd(event, input)) return;

  const readOnly = isReadOnly(name, input);
  if (!readOnly) {
    // A real action ends the discovery run, so the gate is armed again for the next one.
    clearGate(session, 'serial');
    return;
  }

  const line = timeline(entries(event.transcript_path ?? ''));
  if (name === 'Read' && redundantRead(input, line, session)) return;
  serialDiscovery(name, input, line, session);
});

/**
 * Refuse `cd <relative path>` when the path does not exist from here.
 *
 * Unambiguous by construction: the command would fail on this exact line anyway, with
 * `cd: no such file or directory`. The gate turns a wasted turn into a message naming the
 * form that works, and it is the recorded failure — `cd apps/nexus-ui` issued from a
 * worktree root that had no such subdirectory.
 * @param {Record<string, any>} event @param {Record<string, any>} input
 * @returns {boolean} true when the call was denied
 */
function relativeCd(event, input) {
  const command = input?.command;
  if (typeof command !== 'string') return false;
  const from = typeof event.cwd === 'string' ? event.cwd : process.cwd();

  // `cd` at the start of the command or of any segment. A `cd` deeper inside a quoted
  // string or a substitution is not matched, which is the safe direction.
  for (const m of command.matchAll(/(?:^|[;&|(]\s*|&&\s*|\|\|\s*)cd\s+("[^"]+"|'[^']+'|[^\s;&|)]+)/g)) {
    const target = m[1].replace(/^['"]|['"]$/g, '');
    // Absolute paths, home-relative paths, `cd -`, and anything the shell expands are all
    // out of scope: only a plain relative path can be checked here and be certain.
    if (!target || target === '-' || isAbsolute(target) || target.startsWith('~')) continue;
    if (/[$`*?]/.test(target)) continue;
    if (existsSync(resolve(from, target))) continue;

    deny(
      `\`cd ${target}\` does not resolve from ${from}, so this command would fail with ` +
        `"no such file or directory" before doing anything.\n\n` +
        `Spell the path absolutely instead of changing directory:\n` +
        `  • the toolkit takes the checkout as a flag — \`my-command-tools <verb> --cwd <absolute path>\`\n` +
        `  • git takes it as \`git -C <absolute path> …\`\n` +
        `  • everything else takes the absolute path as its argument\n\n` +
        `If a directory genuinely must be entered, enter it by absolute path.`,
    );
    return true;
  }
  return false;
}

/**
 * Refuse a whole-file `Read` of a file this session already read whole and that has not
 * changed since.
 *
 * Three conditions, all required, so only the unambiguous case is refused: the new read
 * asks for the whole file (no `offset`/`limit`), an earlier read in this session also asked
 * for the whole file, and the file's mtime predates that read. A file touched since — by an
 * `Edit`, a formatter, a generator, another agent — passes, because that re-read is the
 * legitimate one.
 * @param {Record<string, any>} input
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line @param {string} session
 * @returns {boolean} true when the call was denied
 */
function redundantRead(input, line, session) {
  const path = input?.file_path;
  if (typeof path !== 'string') return false;
  // A targeted slice is the form this gate asks for; never refuse one.
  if (input.offset !== undefined || input.limit !== undefined) return false;

  const all = turns(line);
  const current = all[all.length - 1];
  const currentUuid = current && issued(current, 'Read', input) ? current.uuid : undefined;
  const priorAt = lastFullReadOf(line, path, currentUuid);
  if (priorAt === 0) return false;

  let mtime;
  try {
    mtime = statSync(path).mtimeMs;
  } catch {
    // Gone, or unreadable — let the tool report that itself.
    return false;
  }
  if (mtime > priorAt - CHANGED_GRACE_MS) return false;

  // One refusal per file. If the agent comes back to it, it has a reason this gate cannot
  // see, and a second refusal would be an argument rather than a correction.
  if (alreadyDenied(session, 'reread', path)) return false;

  deny(
    `This session already read ${path} in full, and the file has not changed since ` +
      `(last modified ${new Date(mtime).toISOString()}, read at ${new Date(priorAt).toISOString()}).\n` +
      `Its contents are already in your context — reading it again pays for the same bytes twice.\n\n` +
      `If you need a different symbol from it, locate every symbol you want in one pass:\n` +
      `  rg -n 'firstSymbol|secondSymbol' ${path}\n` +
      `then read only the range you still need, with numeric offset/limit:\n` +
      `  Read({file_path: "${path}", offset: <line>, limit: <count>})\n\n` +
      `A whole-file re-read is legitimate only after the file actually changes; this one has not.`,
  );
  return true;
}

/**
 * Refuse the 4th consecutive turn of nothing but read-only calls.
 *
 * Counted in turns rather than calls, which is what makes the gate reward the fix instead
 * of punishing it: six `Read`s sent as parallel calls in one turn are one turn, while six
 * sent one per turn are six. A turn containing any call that is not read-only breaks the
 * run, as does a user prompt.
 * @param {string} name @param {Record<string, any>} input
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line @param {string} session
 */
function serialDiscovery(name, input, line, session) {
  let run = 0;
  let i = line.length - 1;

  // The current call's own turn may already be written, or may not be — PreToolUse fires
  // while the message is still being emitted. Count it exactly once either way.
  const last = line[i];
  if (last && issued(last, name, input)) {
    run = 1;
    i -= 1;
  } else {
    run = 1;
  }

  for (; i >= 0; i--) {
    const turn = line[i];
    // A user prompt is a fresh instruction; discovery for it starts over here.
    if (turn === null) break;
    if (turn.toolUses.length === 0) break;
    if (!turn.toolUses.every((u) => isReadOnly(u.name, u.input))) break;
    run += 1;
  }

  if (run <= MAX_SERIAL_TURNS) return;
  // One refusal per discovery run: after this the agent proceeds, batched or not, and the
  // gate re-arms as soon as a non-read-only call ends the run.
  if (alreadyDenied(session, 'serial', 'run')) return;

  deny(
    `This is read-only call #${run} in a row, each in its own turn, with no action between them.\n` +
      `Discovery that takes four turns was not enumerated before it started.\n\n` +
      `Name every path, pattern, and probe the rest of this phase needs, then send them as ` +
      `parallel tool calls in a single turn — one block of Read/Grep/Glob calls, and one ` +
      `\`git diff <base>...HEAD -- <path> <path> …\` for every path at once rather than one call per path.\n` +
      `Only a call whose arguments depend on another call's result has to wait for the next turn.\n\n` +
      `Re-send this call together with the others you already know you need.`,
  );
}
