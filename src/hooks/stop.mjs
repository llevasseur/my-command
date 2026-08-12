#!/usr/bin/env node
// Stop — say so when a run ends without recording an outcome.
//
// An outcome is recorded only from an assistant message carrying text and zero tool calls.
// A run whose last message is a tool call records nothing, and one carrying the report
// alongside a tool call is recorded as a decision mid-run. Both look identical to a
// finished run in a job list, which is why they went unnoticed.
//
// **A Stop hook fires at every yield of the turn, not only at an ending**, and that is the
// whole difficulty. Reading one signal — a tool call is last — as proof the run was abandoned
// refuses runs that are still going, so the shape a run pauses in is not evidence about how it
// ended. This gate asks *why the loop stopped* before it says anything:
//
//   - Nothing is owed. `unclosedPrompts()` is 0, so a text-only turn already answered the
//     current prompt and a second report would be the gate inventing work.
//   - The transcript is not this run's. A subagent's event carries the parent's path, and
//     someone else's turns are not evidence about this run.
//   - The session is not interactive. A background job's harness enforces its own outcome
//     line, and there is no one at a terminal for a warning to reach.
//   - The run handed back. A `RETURN /<command>` marker on the last line is the prescribed
//     nested shape — report and marker riding the parent's next call — not an ending.
//   - The loop stopped for a reason of its own. Every call in the last turn was refused or
//     errored, or the last turn called a tool that yields by design: a question, a plan to
//     approve, a watch, a backgrounded command, an outstanding dispatch.
//   - A run this session set going is still open. `nestedRunOpen()` counts inline `Skill`
//     calls, `Agent` dispatches, and `claude -p` shell outs.
//
// What survives all of that is refused only in the one shape that cannot be anything else:
// a last message with **no text at all**. A last message that did speak but carried a tool
// call along with it gets a warning and a line in the log, because a false refusal costs more
// than a missed one.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { block, guard, readEvent, warn } from './lib/io.mjs';
import { alreadyDenied, logPath } from './lib/state.mjs';
import { entries, foreignTranscript, nestedRunOpen, returnMarker, timeline, turns } from './lib/transcript.mjs';

/**
 * How close to the stop the last turn's timestamp must be for the transcript to be suspect.
 * The records are appended live, so a closing message written moments before the hook ran may
 * not be on disk yet — and judging from a transcript missing its last turn refuses the very
 * message the gate asked for.
 */
const FLUSH_WINDOW_MS = 2000;

/** How long to wait before the one re-read. Long enough for a flush, short enough to vanish. */
const FLUSH_PAUSE_MS = 250;

/** Tools that hand control back by design, so a turn ending on one is a pause, not an ending. */
const YIELDS = new Set(['AskUserQuestion', 'ExitPlanMode', 'Monitor']);

guard(() => {
  const event = readEvent();
  if (!event) return;
  // Set on a stop the harness is re-running because a hook already blocked once. Blocking
  // again from the same state is how a Stop hook becomes an infinite loop.
  if (event.stop_hook_active === true) return;

  const path = String(event.transcript_path ?? '');
  // A subagent's event carries the *parent's* transcript, so without this the gate judges one
  // run by another's history.
  if (foreignTranscript(path)) return;
  if (nonInteractive()) return;

  const session = String(event.session_id ?? '');
  let call = judge(timeline(entries(path)));
  // Only re-read when about to say something, so the pause is paid on the rare stop rather
  // than on every one. Once: if the record still is not there, it is not arriving.
  if (call.verdict !== 'silent' && Date.now() - call.last.at < FLUSH_WINDOW_MS) {
    pause(FLUSH_PAUSE_MS);
    call = judge(timeline(entries(path)));
  }
  if (call.verdict === 'silent') return;

  // Keyed to the turn, so one turn is spoken to at most once however many times the harness
  // retries the stop. Without this the run cannot end at all.
  if (alreadyDenied(session, 'outcome', call.last.uuid || String(call.count))) return;

  note(`${new Date().toISOString()} session=${session} endsOnToolCall=${call.endsOnToolCall} unclosed=${call.owed}`);

  if (call.verdict === 'warn') {
    warn(
      `This run's last message carries a tool call alongside its report, so the harness ` +
        `recorded a decision mid-run rather than an outcome. An outcome is recorded only from a ` +
        `message carrying text and zero tool calls.${
          call.owed > 1 ? ` ${call.owed} prompts in this session have no outcome line.` : ''
        } Nothing is being blocked — next time, make the last tool call, let it return, and ` +
        `reply with text alone.`,
    );
    return;
  }

  block(
    `This run has not recorded its outcome. Its last message carries no text at all, so ` +
      `nothing was recorded.\n\n` +
      `An outcome is recorded only from a message carrying text and zero tool calls. Send that ` +
      `message now: one self-contained line first saying where the run stands — what shipped, or ` +
      `where it stopped and what is on the branch — then any detail.\n\n` +
      `This is the outermost run, so that message is owed here even if a command nested inside ` +
      `it already reported on its way out.\n\n` +
      `Make any final tool call you still owe (resolving the closing-turn todo item is the natural ` +
      `one), let it return, and only then reply with text alone. Do not attach the report to that ` +
      `tool call.${
        call.owed > 1
          ? `\n\nThis session left ${call.owed} earlier prompts without an outcome line too. Those cannot be ` +
            `recovered now; close this one.`
          : ''
      }`,
  );
});

/**
 * @typedef {object} Verdict
 * @property {'silent' | 'warn' | 'block'} verdict
 * @property {import('./lib/transcript.mjs').Turn} [last]
 * @property {number} [count]
 * @property {boolean} [endsOnToolCall]
 * @property {number} [owed]
 */

/**
 * What this transcript says about how the run stopped. Every exemption lives here rather than
 * at the call site, so the re-read below judges by exactly the same rules as the first pass.
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line
 * @returns {any}
 */
function judge(line) {
  const all = turns(line);
  const last = all[all.length - 1];
  if (!last) return { verdict: 'silent' };

  const endsOnToolCall = last.toolUses.length > 0;
  const saidNothing = !last.hasText;
  const seen = { last, count: all.length, endsOnToolCall };
  // The run spoke and called nothing: the outcome is on the record.
  if (!endsOnToolCall && !saidNothing) return { ...seen, verdict: 'silent' };

  // Nothing is owed. A text-only turn already closed the current prompt, so whatever this
  // stop is, it is not a run ending without an outcome.
  const owed = unclosedPrompts(line);
  if (owed === 0) return { ...seen, owed, verdict: 'silent' };

  // A nested inline run hands back by putting its report and `RETURN /<command>` in the same
  // message that carries the parent's next tool call — the prescribed handback, not an ending.
  // An abandoned outermost run whose last message happens to carry both is allowed too: the
  // two are indistinguishable, and a false denial costs more than a missed one.
  if (endsOnToolCall && returnMarker(last)) return { ...seen, owed, verdict: 'silent' };

  // The loop stopped because of what it called, not because the run was over.
  if (endsOnToolCall && yieldedByDesign(last)) return { ...seen, owed, verdict: 'silent' };

  // A run this session set going is still open, so the stop lands mid-pipeline.
  if (nestedRunOpen(line)) return { ...seen, owed, verdict: 'silent' };

  return { ...seen, owed, verdict: saidNothing ? 'block' : 'warn' };
}

/**
 * Whether the last turn stopped the loop for a reason of its own rather than by ending the
 * run. Two shapes say so: nothing it called actually ran, or it called a tool whose whole
 * purpose is to hand control back and wait.
 * @param {import('./lib/transcript.mjs').Turn} turn
 * @returns {boolean}
 */
function yieldedByDesign(turn) {
  const uses = turn.toolUses;
  if (uses.length === 0) return false;
  // Every call refused or errored: the turn ended because none of it ran, and the run is
  // owed a correction rather than a closing message.
  if (uses.every((u) => u.ok === false)) return true;
  return uses.some((u) => {
    if (YIELDS.has(u.name)) return true;
    // A dispatch reports back later; until its completion notice arrives it is outstanding.
    if (u.name === 'Agent') return u.notified !== true;
    if (u.name === 'Bash' && u.input?.run_in_background === true) return true;
    return false;
  });
}

/**
 * Whether this session is one no person is watching, where the gate has nothing to add. A
 * background job's harness already requires its own outcome line and reports on it, and a
 * headless run has no terminal for a warning to reach.
 * @returns {boolean}
 */
function nonInteractive() {
  return Boolean(process.env.CLAUDE_JOB_DIR || process.env.MY_COMMAND_NON_INTERACTIVE || process.env.CI);
}

/**
 * Block this process for `ms`, which a hook may do and an agent may not. Used once, to let a
 * transcript record finish landing before it is read a second time.
 * @param {number} ms
 */
function pause(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // No shared memory here; the re-read simply happens immediately.
  }
}

/**
 * How many user prompts in this session were never answered by a text-only turn. Each
 * prompt opens a task and only a text-only reply closes it. Counted for the record; only
 * the current one can still be closed, so 0 means this run owes nothing.
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line
 * @returns {number}
 */
function unclosedPrompts(line) {
  let unclosed = 0;
  let open = false;
  for (const item of line) {
    if (item === null) {
      if (open) unclosed += 1;
      open = true;
      continue;
    }
    if (open && item.hasText && item.toolUses.length === 0) open = false;
  }
  return unclosed + (open ? 1 : 0);
}

/**
 * Leave a line for the human outside the transcript, so a pattern of misses is visible
 * later without reading transcripts.
 * @param {string} line
 */
function note(line) {
  try {
    const path = logPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${line}\n`);
  } catch {
    // A log that cannot be written is not a reason to fail the gate.
  }
}
