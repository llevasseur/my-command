// Hook plumbing: read the event, answer it, and never be the reason a tool call failed.
// `guard` swallows every exception into a silent allow, and the off switch is checked
// before any work happens.
import { readFileSync } from 'node:fs';
import { asRecord, asText, isRecord } from './parse.mjs';
import { setFireContext } from './rules.mjs';

/** Values of MY_COMMAND_HOOKS that turn the gates off. Anything else leaves them on. */
const OFF = new Set(['0', 'off', 'false', 'no']);

/** @returns {boolean} */
export function disabled() {
  const flag = process.env.MY_COMMAND_HOOKS;
  return flag !== undefined && OFF.has(flag.trim().toLowerCase());
}

/**
 * One hook event, decoded — the whole of what a gate knows about the call it was asked about,
 * settled here rather than re-examined at each gate.
 *
 * @typedef {object} HookEvent
 * @property {string} toolName        The tool about to run, or '' when the event named none.
 * @property {Record<string, any>} input The tool's arguments as they arrived, for the gates
 *   that read a field of their own and for comparing against the transcript's copy.
 * @property {string | undefined} command  `Bash`'s command line.
 * @property {string | undefined} filePath The file tools' target path.
 * @property {boolean} background    The call was handed to the background.
 * @property {string} cwd            Where the call runs, defaulted to this process's own.
 * @property {string} sessionId
 * @property {string} transcriptPath
 * @property {string | undefined} agentId Set only when the call comes from inside a subagent, which
 *   is how a hook tells a dispatched run from the main thread.
 * @property {string | undefined} agentType The subagent's type, or a `--agent` session's agent name
 *   on the main thread — so unlike `agentId` its presence does not mean a subagent.
 * @property {boolean} stopHookActive The harness is re-running a stop a hook already blocked.
 * @property {string | undefined} lastAssistantMessage A stop's final message text, read from the
 *   harness's memory rather than the transcript. Absent when that message carried no text, and on
 *   a harness too old to send it.
 */

/**
 * The hook event on stdin, or null when there is nothing parseable there.
 * @returns {HookEvent | null}
 */
export function readEvent() {
  /** @type {unknown} */
  let event;
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) return null;
    event = JSON.parse(raw);
  } catch {
    return null;
  }
  // Not an object: none of the fields a gate reads, so the same as nothing being there.
  if (!isRecord(event)) return null;

  const input = asRecord(event.tool_input);
  const sessionId = String(event.session_id ?? '');
  const transcriptPath = String(event.transcript_path ?? '');
  // Whose run a rule fire belongs to, so `recordFire` can stamp the session and the model.
  setFireContext({ sessionId, transcriptPath });
  return {
    toolName: String(event.tool_name ?? ''),
    input,
    command: asText(input.command),
    filePath: asText(input.file_path),
    background: input.run_in_background === true,
    cwd: asText(event.cwd) ?? process.cwd(),
    sessionId,
    transcriptPath,
    agentId: asText(event.agent_id),
    agentType: asText(event.agent_type),
    stopHookActive: event.stop_hook_active === true,
    lastAssistantMessage: asText(event.last_assistant_message),
  };
}

/**
 * Deny a tool call. Every caller passes the faster form of what it refused — a denial
 * that only says "no" costs a turn and teaches nothing.
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
 * Say something to the human without keeping the turn open. `systemMessage` is the harness's
 * warning channel: it is shown and then the run ends, where `decision: 'block'` refuses the
 * ending outright and `additionalContext` feeds the model and continues the conversation.
 * @param {string} message
 */
export function warn(message) {
  process.stdout.write(`${JSON.stringify({ systemMessage: message })}\n`);
}

/**
 * Run a hook body, allowing the call on any failure — exit 0 with no output is how the
 * harness spells "no opinion". No gate does its own error handling; this is the whole
 * error policy.
 * @param {() => void} body
 */
export function guard(body) {
  try {
    if (disabled()) return;
    body();
  } catch {
    // Silent: a stack trace on stderr reads as noise about the hook, not about the work.
  }
}
