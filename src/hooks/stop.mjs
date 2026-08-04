#!/usr/bin/env node
// Stop — refuse to end a run that never recorded an outcome.
//
// An outcome is recorded only from an assistant message carrying text and zero tool calls.
// A run whose last message is a tool call records nothing, and one carrying the report
// alongside a tool call is recorded as a decision mid-run. Both look identical to a
// finished run in a job list, which is why they went unnoticed.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { block, guard, readEvent } from './lib/io.mjs';
import { alreadyDenied, logPath } from './lib/state.mjs';
import { entries, timeline, turns } from './lib/transcript.mjs';

guard(() => {
  const event = readEvent();
  if (!event) return;
  // Set on a stop the harness is re-running because a hook already blocked once. Blocking
  // again from the same state is how a Stop hook becomes an infinite loop.
  if (event.stop_hook_active === true) return;

  const session = String(event.session_id ?? '');
  const line = timeline(entries(event.transcript_path ?? ''));
  const all = turns(line);
  const last = all[all.length - 1];
  if (!last) return;

  const endsOnToolCall = last.toolUses.length > 0;
  const saidNothing = !last.hasText;
  if (!endsOnToolCall && !saidNothing) return;

  // Keyed to the turn, so one turn can be blocked at most once however many times the
  // harness retries the stop. Without this the run cannot end at all.
  if (alreadyDenied(session, 'outcome', last.uuid || String(all.length))) return;

  const owed = unclosedPrompts(line);
  note(`${new Date().toISOString()} session=${session} endsOnToolCall=${endsOnToolCall} unclosed=${owed}`);

  block(
    `This run has not recorded its outcome. Its last message ${
      endsOnToolCall
        ? 'carries a tool call, so the outcome reads as a decision mid-run'
        : 'carries no text at all, so nothing was recorded'
    }.\n\n` +
      `An outcome is recorded only from a message carrying text and zero tool calls. Send that ` +
      `message now: one self-contained line first saying where the run stands — what shipped, or ` +
      `where it stopped and what is on the branch — then any detail.\n\n` +
      `Make any final tool call you still owe (resolving the closing-turn todo item is the natural ` +
      `one), let it return, and only then reply with text alone. Do not attach the report to that ` +
      `tool call.${
        owed > 1
          ? `\n\nThis session left ${owed} earlier prompts without an outcome line too. Those cannot be ` +
            `recovered now; close this one.`
          : ''
      }`,
  );
});

/**
 * How many user prompts in this session were never answered by a text-only turn. Each
 * prompt opens a task and only a text-only reply closes it. Counted for the record; only
 * the current one can still be closed.
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
