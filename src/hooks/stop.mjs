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
// What survives all of that is refused in two shapes, and both are read off the turn rather
// than off any one tool name: a last message with **no text at all**, and a last message whose
// every call was a closing chore — a row of the task list moved, or the workspace torn down
// with `worktree end`/`ExitWorktree`. Neither chore is the work, so a turn made only of them is
// the run tidying up after its last real action. A last message that did speak and carried some
// other tool call along with it gets a warning and a line in the log, because a false refusal
// costs more than a missed one.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { block, guard, readEvent, warn } from './lib/io.mjs';
import { alreadyDenied, logPath, timesDenied } from './lib/state.mjs';
import { entries, nestedRunOpen, returnMarker, timeline, turns } from './lib/transcript.mjs';

/**
 * How long to keep re-reading a transcript whose closing message has not landed. The hook can run
 * before the harness has written that message, and judging the turn before it refuses the very
 * message the gate asked for. Past this the message is late rather than missing, and the gate
 * lets the stop through.
 */
const FLUSH_LIMIT_MS = 1500;

/** The pause between re-reads. */
const FLUSH_STEP_MS = 100;

/** Tools that hand control back by design, so a turn ending on one is a pause, not an ending. */
const YIELDS = new Set(['AskUserQuestion', 'ExitPlanMode', 'Monitor']);

/**
 * Tools that only move a row of the run's own task list. None of them changes a file, a
 * branch, or a remote — so a turn made of nothing but these did no work, and whatever it
 * was, it was not the run finishing.
 */
const BOOKKEEPING = new Set(['TodoWrite', 'TaskUpdate', 'TaskCreate']);

/**
 * Session tools that only dismantle the workspace the run was using. Same argument as
 * `BOOKKEEPING`: removing the scaffolding is not the work, so a turn made of nothing but this
 * is the run tidying up after its last real action rather than the run finishing.
 */
const TEARDOWN_TOOLS = new Set(['ExitWorktree']);

/**
 * The teardown verbs, as they appear in a `Bash` command. `worktree end` is the recorded one:
 * a run closed on it alone, having already opened its PR the turn before, and the harness
 * recorded no outcome for the run at all. `reap` and `cleanup` are the same act by another
 * name and end a turn the same way.
 */
const TEARDOWN_BASH = /my-command-tools\s+(?:worktree\s+(?:end|reap)|cleanup)\b/;

/**
 * How many times this gate may speak in one session. A Stop hook that blocks without limit is an
 * infinite loop, and one that blocks only once lets a run end unreported on its second attempt —
 * which is what happened. Three is enough for the recorded shapes (a chore turn, a correction,
 * one more chore turn) and small enough that a wedged session cannot be the cost.
 */
const MAX_REMARKS = 3;

guard(() => {
  const event = readEvent();
  if (!event) return;
  const path = event.transcriptPath;
  const session = event.sessionId;

  // Set on a stop the harness is re-running because a hook already blocked. Returning here
  // outright is what let a blocked run end anyway with nothing recorded: the block landed, the
  // agent sent one more chore-only turn, and this gate — the only thing that would have noticed —
  // was standing down. Two buckets carry the injected "This run has not recorded its outcome"
  // feedback and still recorded nothing for their root.
  //
  // The loop was never prevented by this return. It is prevented by the per-turn denial key
  // further down, which speaks to one turn once however many times the stop is retried; a
  // *different* turn is a new decision the agent made in between and is judged on its own. The
  // ceiling is what guarantees termination even if every turn after a block is a fresh chore.
  if (event.stopHookActive && timesDenied(session, 'outcome') >= MAX_REMARKS) return;

  // `foreignTranscript()` is deliberately **not** consulted here, unlike in every PreToolUse
  // gate. Only `Stop` is registered — `SubagentStop` is not — so every event this hook sees
  // belongs to the session that owns `path`, and the recency test it uses answers "a subagent
  // wrote more recently than the parent", which at a *parent's* stop is true of any run that
  // dispatched anything and says nothing about whose transcript this is. It stood the gate down
  // for exactly the delegated runs the misses were recorded in.
  if (nonInteractive()) return;
  // The final message's text, from the harness's memory: it spoke, whatever the file holds yet.
  if (event.lastAssistantMessage?.trim()) return;
  let call = judge(entries(path));
  // Only re-read when about to say something, so the pause is paid on the rare stop rather
  // than on every one. Bounded: a closing message that never lands is let through, not refused.
  const deadline = Date.now() + FLUSH_LIMIT_MS;
  while (call.verdict !== 'silent' && unflushed(call.last)) {
    if (Date.now() >= deadline) return;
    pause(FLUSH_STEP_MS);
    call = judge(entries(path));
  }
  if (call.verdict === 'silent') return;

  // Keyed to the turn, so one turn is spoken to at most once however many times the harness
  // retries the stop. Without this the run cannot end at all.
  if (alreadyDenied(session, 'outcome', call.last.uuid || String(call.count))) return;

  note(
    `${new Date().toISOString()} session=${session} endsOnToolCall=${call.endsOnToolCall} unclosed=${call.owed}` +
      `${call.verdict === 'bookkeeping' ? ` shape=${call.chore}` : ''}`,
  );

  if (call.verdict === 'bookkeeping') {
    const names = [...new Set(call.last.toolUses.map((/** @type {{name: string}} */ u) => u.name))].join(', ');
    const what =
      call.chore === 'teardown'
        ? 'workspace teardown'
        : call.chore === 'chores'
          ? 'task-list bookkeeping and workspace teardown'
          : 'task-list bookkeeping';
    const nothingOwed =
      call.chore === 'bookkeeping'
        ? 'The list is already accurate; nothing further is owed to it.'
        : 'The workspace is already gone, and nothing about this run depends on it any more.';
    block(
      `This run's last turn called nothing but ${names} — ${what}, ${call.last.toolUses.length} ` +
        `call${call.last.toolUses.length === 1 ? '' : 's'} of it and nothing else. Neither marking a row nor ` +
        `removing the workspace is the work, so the run's last real action was the turn before this one and the ` +
        `outcome was never recorded.\n\n` +
        `${nothingOwed} Reply now with the report in text alone — one self-contained line saying where the run ` +
        `stands, then the detail. Do not send another such call first, whatever is still open.\n\n` +
        `Next run, fold every closing chore into the same turn as the last piece of real work — the teardown, the ` +
        `final verify, the closing \`gh\` call, the last row of the list — so no turn is left with only chores in ` +
        `it. \`worktree end\` and \`ExitWorktree\` are the recorded way this happens: they sit naturally at the ` +
        `end, they return quietly, and the message that was meant to follow never gets sent.`,
    );
    return;
  }

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
 * @property {'silent' | 'warn' | 'block' | 'bookkeeping'} verdict
 * @property {import('./lib/transcript.mjs').Turn} [last]
 * @property {number} [count]
 * @property {boolean} [endsOnToolCall]
 * @property {number} [owed]
 * @property {'bookkeeping' | 'teardown' | 'chores'} [chore]
 */

/**
 * What this transcript says about how the run stopped. Every exemption lives here rather than
 * at the call site, so the re-read below judges by exactly the same rules as the first pass.
 * @param {Record<string, any>[]} records
 * @returns {any}
 */
function judge(records) {
  const line = timeline(records);
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
  const owed = unclosedPrompts(timeline(records, { typedOnly: true }));
  if (owed === 0) return { ...seen, owed, verdict: 'silent' };

  // A nested inline run hands back by putting its report and `RETURN /<command>` in the same
  // message that carries the parent's next tool call — the prescribed handback, not an ending.
  // An abandoned outermost run whose last message happens to carry both is allowed too: the
  // two are indistinguishable, and a false denial costs more than a missed one.
  if (endsOnToolCall && returnMarker(last)) return { ...seen, owed, verdict: 'silent' };

  // The loop stopped because of what it called, not because the run was over.
  if (endsOnToolCall && yieldedByDesign(last)) return { ...seen, owed, verdict: 'silent' };

  // Nothing in the last turn but task-list bookkeeping. Judged on the *shape of the turn*
  // rather than on which tool was called, which is what makes it reachable at all: the
  // recorded runs end on batches of `TaskUpdate`, whose input carries a `taskId` and a
  // status and never the subject, so no PreToolUse gate can tell the closing row from any
  // other one. Stop does not have to — it reads a turn that already happened, and a turn
  // that moved only task rows moved nothing else, whatever those rows were called.
  // The same reading catches the trailing teardown: a run that pushed its PR and then closed on
  // a lone `worktree end` recorded no outcome either, and removing the workspace is no more the
  // run finishing than marking a row is.
  if (endsOnToolCall && bookkeepingOnly(last)) {
    return { ...seen, owed, verdict: 'bookkeeping', chore: closingChore(last) };
  }

  // A run this session set going is still open, so the stop lands mid-pipeline.
  if (nestedRunOpen(line)) return { ...seen, owed, verdict: 'silent' };

  return { ...seen, owed, verdict: saidNothing ? 'block' : 'warn' };
}

/**
 * Whether the turn the transcript ends on cannot be the message a stop follows, so the real one
 * has not been written yet. A stop follows a message that called nothing, and the harness writes
 * that message after the stop hooks may already be running. Two shapes give it away: a turn of
 * tool calls whose results have all come back, which the model always answers with another
 * message, and a turn of thinking alone, whose text block is the next record of the same message.
 * @param {import('./lib/transcript.mjs').Turn | undefined} turn
 * @returns {boolean}
 */
function unflushed(turn) {
  if (!turn || turn.hasText) return false;
  return turn.toolUses.every((u) => u.answered);
}

/**
 * Whether every call in this turn only moved a row of the task list. A turn that also ran a
 * command, wrote a file, or dispatched anything is not this shape — bookkeeping riding along
 * with real work is what the commands ask for. A turn whose calls all failed is not it either:
 * nothing was marked, so the run is owed a correction rather than a closing message.
 * @param {import('./lib/transcript.mjs').Turn} turn
 * @returns {boolean}
 */
function bookkeepingOnly(turn) {
  const uses = turn.toolUses;
  if (uses.length === 0) return false;
  if (uses.every((u) => u.ok === false)) return false;
  return uses.every((u) => BOOKKEEPING.has(u.name) || isTeardown(u));
}

/**
 * Whether one call is workspace teardown. Read off the tool and, for `Bash`, off the verb in
 * the command — the teardown verbs are a closed list and none of them takes free-form prose,
 * so matching the verb cannot mistake some other command for one.
 * @param {{name: string, input?: any}} use
 * @returns {boolean}
 */
function isTeardown(use) {
  if (TEARDOWN_TOOLS.has(use.name)) return true;
  if (use.name !== 'Bash') return false;
  return TEARDOWN_BASH.test(String(use.input?.command ?? ''));
}

/**
 * Which closing chore this turn performed, for the message. All three are refused; they are
 * told apart only so the refusal can name what it actually saw.
 * @param {import('./lib/transcript.mjs').Turn} turn
 * @returns {'bookkeeping' | 'teardown' | 'chores'}
 */
function closingChore(turn) {
  const book = turn.toolUses.some((u) => BOOKKEEPING.has(u.name));
  const down = turn.toolUses.some((u) => isTeardown(u));
  if (book && down) return 'chores';
  return down ? 'teardown' : 'bookkeeping';
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
 * Whether this session is one the gate has nothing to add to. `CI` is a run with no terminal for
 * a warning to reach and no agent left to correct anything, and `MY_COMMAND_NON_INTERACTIVE` is
 * this repo's own documented opt-out.
 *
 * `CLAUDE_JOB_DIR` used to be here too, on the stated assumption that a background job's harness
 * requires its own outcome line. It does not: a backgrounded command run is *exactly* the shape
 * the misses were recorded in — `/god --no-review`, `/mc -t`, `/fb -t`, `/work --area …` — and
 * every one of them was exempted by that variable before the gate saw it. A job's outcome is
 * still an outcome, and there is an agent there to write it.
 * @returns {boolean}
 */
function nonInteractive() {
  return Boolean(process.env.MY_COMMAND_NON_INTERACTIVE || process.env.CI);
}

/**
 * Block this process for `ms`, which a hook may do and an agent may not. Used to let the closing
 * message finish landing before the transcript is read again.
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
 * How many typed prompts in this session were never answered by a text-only turn. Each
 * prompt opens a task and only a text-only reply closes it. Counted for the record; only
 * the current one can still be closed, so 0 means this run owes nothing.
 *
 * Read from a `typedOnly` timeline, so the command bodies a nested pipeline loads, and the
 * feedback a blocked stop writes, are part of the prompt they follow rather than prompts of
 * their own. Prompts with no turn between them are one task too: one reply answers them both.
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line
 * @returns {number}
 */
function unclosedPrompts(line) {
  let unclosed = 0;
  let open = false;
  let worked = false;
  for (const item of line) {
    if (item === null) {
      if (open && worked) unclosed += 1;
      open = true;
      worked = false;
      continue;
    }
    worked = true;
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
