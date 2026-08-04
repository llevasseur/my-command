// Per-session scratch state, which exists for exactly one reason: a gate must never be
// able to wedge a session.
//
// Every denial below is recorded, and a recorded denial is not repeated for the same
// subject. So the worst a gate can cost is one corrected turn — it cannot refuse the same
// call twice and leave the agent with no way forward. That property is worth more than
// catching every instance, because a gate that can deadlock a run gets switched off.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/** Scratch, not configuration: under the OS temp dir so it clears itself between boots. */
function stateDir() {
  return join(process.env.MY_COMMAND_HOOK_STATE ?? tmpdir(), 'my-command-hooks');
}

/** @param {string} sessionId @returns {string} */
function stateFile(sessionId) {
  // Session ids are uuids from the harness; the replace is belt-and-braces against one
  // ever carrying a path separator.
  return join(stateDir(), `${String(sessionId || 'unknown').replace(/[^\w.-]/g, '_')}.json`);
}

/** @param {string} sessionId @returns {Record<string, any>} */
export function load(sessionId) {
  try {
    return JSON.parse(readFileSync(stateFile(sessionId), 'utf8'));
  } catch {
    return {};
  }
}

/** @param {string} sessionId @param {Record<string, any>} state */
export function save(sessionId, state) {
  try {
    mkdirSync(stateDir(), { recursive: true });
    writeFileSync(stateFile(sessionId), JSON.stringify(state));
  } catch {
    // Unwritable scratch means the guard degrades to "deny each time it sees the same
    // subject". Still bounded, since the agent's next call differs — and not worth
    // failing a hook over.
  }
}

/**
 * Record a denial and report whether this subject was already denied.
 *
 * `subject` identifies what is being refused — a file path, a discovery run — so the
 * second identical refusal is suppressed and the call goes through.
 * @param {string} sessionId @param {string} gate @param {string} subject
 * @returns {boolean} true when this gate has already refused this subject
 */
export function alreadyDenied(sessionId, gate, subject) {
  const state = load(sessionId);
  const key = `${gate}:${subject}`;
  if (state[key]) return true;
  state[key] = Date.now();
  save(sessionId, state);
  return false;
}

/**
 * Forget a gate's denials, so a later violation of the same kind is refused again.
 * Called when the condition that made the denials relevant has ended.
 * @param {string} sessionId @param {string} gate
 */
export function clearGate(sessionId, gate) {
  const state = load(sessionId);
  let changed = false;
  for (const key of Object.keys(state)) {
    if (key.startsWith(`${gate}:`)) {
      delete state[key];
      changed = true;
    }
  }
  if (changed) save(sessionId, state);
}

/** Where a hook may leave a note for the human, outside the transcript. @returns {string} */
export function logPath() {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  return join(claudeDir, 'my-command', 'hooks.log');
}
