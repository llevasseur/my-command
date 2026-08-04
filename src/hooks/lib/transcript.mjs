// Reading the session transcript, which is where these gates get their evidence.
//
// The transcript is the only record of what already happened in a session, and it is
// authoritative in a way a sidecar state file is not: it survives the hook being installed
// mid-session, it is per-session without any keying of our own, and it distinguishes one
// turn carrying six parallel tool calls from six turns carrying one each — which is
// exactly the distinction the discovery gate is about.
import { readFileSync } from 'node:fs';

/**
 * @typedef {object} Turn
 * @property {string} uuid
 * @property {number} at          Epoch ms of the turn's timestamp.
 * @property {{name: string, input: Record<string, any>, id?: string}[]} toolUses
 * @property {boolean} hasText    The turn said something, not only called tools.
 */

/**
 * Every JSONL record in the transcript, oldest first. Unparseable lines are skipped: the
 * file is appended to live, so the last line can be a partial write.
 * @param {string} path
 * @returns {Record<string, any>[]}
 */
export function entries(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  /** @type {Record<string, any>[]} */
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // A torn final line, or a record shape we do not read. Neither is worth failing on.
    }
  }
  return out;
}

/** @param {unknown} value @returns {number} */
function epoch(value) {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * The session's history as a sequence of decision points: each assistant turn, plus a
 * `null` marking every real user prompt. A prompt breaks any run of turns before it,
 * because the agent was given new instructions there.
 *
 * A `user` record carrying only `tool_result` blocks is not a prompt — it is the harness
 * handing back what the assistant just asked for, so it is dropped rather than treated as
 * a boundary.
 * @param {Record<string, any>[]} records
 * @returns {(Turn | null)[]}
 */
export function timeline(records) {
  /** @type {(Turn | null)[]} */
  const out = [];
  for (const rec of records) {
    const content = rec?.message?.content;
    if (!Array.isArray(content)) continue;

    if (rec.type === 'user') {
      const isPrompt = content.some((b) => b?.type !== 'tool_result');
      if (isPrompt) out.push(null);
      continue;
    }
    if (rec.type !== 'assistant') continue;

    const toolUses = content
      .filter((b) => b?.type === 'tool_use' && typeof b.name === 'string')
      .map((b) => ({ name: b.name, input: b.input ?? {}, id: b.id }));
    const hasText = content.some((b) => b?.type === 'text' && typeof b.text === 'string' && b.text.trim().length > 0);

    out.push({ uuid: rec.uuid ?? '', at: epoch(rec.timestamp), toolUses, hasText });
  }
  return out;
}

/** @param {(Turn | null)[]} line @returns {Turn[]} */
export function turns(line) {
  return /** @type {Turn[]} */ (line.filter((t) => t !== null));
}

/**
 * Whether `turn` is the one that issued the tool call now being judged.
 *
 * PreToolUse fires while the assistant message is being written, so the current call may
 * or may not already be in the transcript. Matching on name plus a deep compare of the
 * input is what tells "this turn is me" from "this turn was the previous read", and it is
 * what stops a batch of parallel calls being counted once per call.
 * @param {Turn} turn @param {string} name @param {Record<string, any>} input
 * @returns {boolean}
 */
export function issued(turn, name, input) {
  const wanted = JSON.stringify(input ?? {});
  return turn.toolUses.some((u) => u.name === name && JSON.stringify(u.input ?? {}) === wanted);
}

/**
 * The most recent time this session read `path` in full — no `offset`, no `limit` — or 0
 * when it never did.
 *
 * Full reads only, deliberately: re-reading a file after having seen a narrow slice of it
 * is new information, so only a second *whole-file* read of an unchanged file is the
 * unambiguous case a gate may refuse.
 * @param {(Turn | null)[]} line @param {string} path @param {string} [exceptTurnUuid]
 * @returns {number}
 */
export function lastFullReadOf(line, path, exceptTurnUuid) {
  let at = 0;
  for (const turn of turns(line)) {
    if (exceptTurnUuid && turn.uuid === exceptTurnUuid) continue;
    for (const use of turn.toolUses) {
      if (use.name !== 'Read') continue;
      if (use.input?.file_path !== path) continue;
      if (use.input?.offset !== undefined || use.input?.limit !== undefined) continue;
      if (turn.at > at) at = turn.at;
    }
  }
  return at;
}
