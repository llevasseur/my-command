// Reading the session transcript, which is where these gates get their evidence.
// It distinguishes one turn carrying six parallel tool calls from six turns carrying one
// each, which is the distinction the discovery gate is about, and it survives the hooks
// being installed mid-session where a sidecar state file would not.
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
      // A torn final line, or a record shape we do not read.
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
 * Whether `turn` is the one that issued the tool call now being judged. PreToolUse fires
 * while the assistant message is being written, so the current call may or may not be in
 * the transcript yet; matching on name plus a deep compare of the input is what stops a
 * batch of parallel calls being counted once per call.
 * @param {Turn} turn @param {string} name @param {Record<string, any>} input
 * @returns {boolean}
 */
export function issued(turn, name, input) {
  const wanted = JSON.stringify(input ?? {});
  return turn.toolUses.some((u) => u.name === name && JSON.stringify(u.input ?? {}) === wanted);
}

/**
 * The most recent time this session read `path` in full — no `offset`, no `limit` — or 0
 * when it never did. Full reads only: re-reading a file after seeing a narrow slice is new
 * information, so only a second whole-file read is unambiguous enough to refuse.
 *
 * The time returned is that read's own turn, and the caller compares it against **this
 * file's** mtime. An edit to some other file in between is therefore irrelevant, which is
 * the whole reason the answer is per-path rather than a session-wide "something changed".
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

/** Tools whose call satisfies the harness's read-before-write precondition for a path. */
const TOUCHES = new Set(['Read', 'Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

/**
 * Whether this session already read or wrote `path` through a file tool, in any form —
 * a whole-file read, a narrow slice, or a write. This is the precondition `Edit` enforces
 * itself, so the answer is not a judgement: a false means the call is going to be rejected.
 * @param {(Turn | null)[]} line @param {string} path @param {string} [exceptTurnUuid]
 * @returns {boolean}
 */
export function touched(line, path, exceptTurnUuid) {
  for (const turn of turns(line)) {
    if (exceptTurnUuid && turn.uuid === exceptTurnUuid) continue;
    for (const use of turn.toolUses) {
      if (!TOUCHES.has(use.name)) continue;
      const target = use.input?.file_path ?? use.input?.notebook_path;
      if (target === path) return true;
    }
  }
  return false;
}

/**
 * Whether this exact Bash command was already issued in an earlier turn with nothing since
 * that could have changed its answer — no non-read-only call, and no user prompt asking for
 * a fresh look. Re-running the same probe per item of a list already in hand is the shape
 * this catches; a re-check after an action, or after I asked, is not it.
 * @param {(Turn | null)[]} line @param {string} command @param {string | undefined} exceptTurnUuid
 * @param {(name: string, input: Record<string, any>) => boolean} readOnly
 * @returns {boolean}
 */
export function repeatedProbe(line, command, exceptTurnUuid, readOnly) {
  // Walked backwards, so the first thing that invalidates the earlier answer ends the search.
  for (let i = line.length - 1; i >= 0; i--) {
    const turn = line[i];
    if (turn === null) return false;
    if (exceptTurnUuid && turn.uuid === exceptTurnUuid) continue;
    if (turn.toolUses.some((u) => !readOnly(u.name, u.input))) return false;
    if (turn.toolUses.some((u) => u.name === 'Bash' && u.input?.command === command)) return true;
  }
  return false;
}

/**
 * Path-shaped tokens named by a watch this session already armed — a `Monitor`, or a
 * backgrounded Bash command and its log file. A watch delivers its events on its own, so
 * polling the same file by hand is work already being done.
 * @param {(Turn | null)[]} line @param {string} [exceptTurnUuid]
 * @returns {string[]}
 */
export function watchedPaths(line, exceptTurnUuid) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const turn of turns(line)) {
    if (exceptTurnUuid && turn.uuid === exceptTurnUuid) continue;
    for (const use of turn.toolUses) {
      const watching = use.name === 'Monitor' || (use.name === 'Bash' && use.input?.run_in_background === true);
      if (!watching) continue;
      const text = `${use.input?.command ?? ''} ${JSON.stringify(use.input?.ws ?? '')}`;
      // A basename with an extension is the only token specific enough to key on; a bare
      // word would collide with any command mentioning the same noun. Split into shell
      // tokens first and take each one's basename whole — a regex scanning the raw text
      // matches only a *suffix* of the name ("y.log" out of "verify.log"), which is enough
      // for a substring test and wrong for anything that compares names.
      for (const token of text.split(/[\s'"`(){}[\]<>|;&,]+/)) {
        if (!token) continue;
        const base = token.split('/').pop() ?? '';
        if (base.length >= 5 && /^[\w.-]+\.[A-Za-z]\w*$/.test(base)) out.add(base);
      }
    }
  }
  return [...out];
}
