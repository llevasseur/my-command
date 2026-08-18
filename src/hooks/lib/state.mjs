// Per-session scratch state, which exists so a gate can never wedge a session: a recorded
// denial is not repeated for the same subject, so the worst a gate costs is one corrected
// turn.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/** Scratch, not configuration: under the OS temp dir so it clears itself between boots. */
function stateDir() {
  return join(process.env.MY_COMMAND_HOOK_STATE ?? tmpdir(), 'my-command-hooks');
}

/** @param {string} sessionId @returns {string} */
function stateFile(sessionId) {
  // The replace guards against a session id ever carrying a path separator.
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
    // Unwritable scratch degrades the guard to "deny each time it sees the same subject".
  }
}

/**
 * Record a denial and report whether this subject was already denied. `subject` is what is
 * being refused — a file path, a discovery run — so the second identical refusal is
 * suppressed and the call goes through.
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
 * How many distinct subjects this gate has already refused in this session. The outcome gate
 * needs a ceiling rather than a single shot: it must be able to speak to a *second* closing turn,
 * since a run that was blocked once and then ended again anyway is the recorded failure — while
 * still terminating, because a Stop hook that can block without limit is an infinite loop.
 * @param {string} sessionId @param {string} gate
 * @returns {number}
 */
export function timesDenied(sessionId, gate) {
  const prefix = `${gate}:`;
  return Object.keys(load(sessionId)).filter((key) => key.startsWith(prefix)).length;
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
