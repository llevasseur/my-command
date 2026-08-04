// Hook plumbing: read the event, answer it, and never be the reason a tool call failed.
//
// These hooks run in every session on this device, so the failure mode that matters is
// not "missed a violation" — it is "blocked something legitimate", or worse, "crashed and
// took the tool call with it". Both are designed out here: `guard` swallows every
// exception into a silent allow, and the off switch is checked before any work happens.
import { readFileSync } from 'node:fs';

/** Values of MY_COMMAND_HOOKS that turn the gates off. Anything else leaves them on. */
const OFF = new Set(['0', 'off', 'false', 'no']);

/** @returns {boolean} */
export function disabled() {
  const flag = process.env.MY_COMMAND_HOOKS;
  return flag !== undefined && OFF.has(flag.trim().toLowerCase());
}

/**
 * The hook event on stdin, or null when there is nothing parseable there.
 * @returns {Record<string, any> | null}
 */
export function readEvent() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Deny a tool call, with the reason the model reads.
 *
 * `permissionDecisionReason` is the entire value of a gate: a denial that only says "no"
 * costs a turn and teaches nothing, so every caller of this passes the faster form of the
 * thing it just refused.
 * @param {string} reason
 */
export function deny(reason) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
}

/**
 * Block a stop, keeping the turn open with the reason attached.
 * @param {string} reason
 */
export function block(reason) {
  process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
}

/**
 * Run a hook body, allowing the call on absolutely any failure.
 *
 * A hook with a bug must degrade to "no opinion", never to a blocked tool: exit 0 with no
 * output is how the harness spells that. This is why no gate below does its own error
 * handling — this wrapper is the whole error policy.
 * @param {() => void} body
 */
export function guard(body) {
  try {
    if (disabled()) return;
    body();
  } catch {
    // Silent by design. A stack trace on stderr would surface in the transcript as noise
    // about the hook rather than about the work.
  }
}
