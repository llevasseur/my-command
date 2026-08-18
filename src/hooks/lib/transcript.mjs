// Reading the session transcript, which is where these gates get their evidence.
// It distinguishes one turn carrying six parallel tool calls from six turns carrying one
// each, which is the distinction the discovery gate is about, and it survives the hooks
// being installed mid-session where a sidecar state file would not.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { asRecord, asText, isRecord, text } from './parse.mjs';

/**
 * @typedef {object} Turn
 * @property {string} uuid
 * @property {string} msgId       The assistant message id every block of this turn shares.
 * @property {number} at          Epoch ms of the turn's timestamp.
 * @property {{name: string, input: Record<string, any>, id?: string, ok: boolean,
 *   answered: boolean, notified: boolean}[]} toolUses
 * @property {boolean} hasText    The turn said something, not only called tools.
 * @property {string} text        What it said, blocks joined in order and trimmed.
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

/**
 * One transcript line, decoded. A record's role, its ids, its timestamp and each of its
 * content blocks are settled once here, and every reading below branches on those. `content`
 * is null for a record that carried no content array — neither a turn nor a prompt, but
 * nothing to read.
 *
 * @typedef {object} Entry
 * @property {'user' | 'assistant' | 'other'} role
 * @property {string} uuid
 * @property {string} msgId  The id every block of one assistant message shares.
 * @property {number} at     Epoch ms, 0 when the record carried no readable timestamp.
 * @property {Block[] | null} content
 */

/**
 * One content block, decoded to the four kinds these gates read. Anything else — an image, a
 * thinking block, a block whose own fields were not what they claimed — is `other`.
 *
 * @typedef {{kind: 'text', text: string}} TextBlock
 * @typedef {{kind: 'toolUse', id: string, name: string, input: Record<string, any>}} ToolUseBlock
 * @typedef {{kind: 'toolResult', toolUseId: string | undefined, failed: boolean}} ToolResultBlock
 * @typedef {{kind: 'other'}} OtherBlock
 * @typedef {TextBlock | ToolUseBlock | ToolResultBlock | OtherBlock} Block
 */

/** @type {OtherBlock} */
const OTHER = { kind: 'other' };

/** @param {unknown} raw @returns {Block} */
function block(raw) {
  const b = asRecord(raw);
  if (b.type === 'text') {
    const said = asText(b.text);
    return said === undefined ? OTHER : { kind: 'text', text: said };
  }
  if (b.type === 'tool_use') {
    const name = asText(b.name);
    return name === undefined ? OTHER : { kind: 'toolUse', id: text(b.id), name, input: asRecord(b.input) };
  }
  if (b.type === 'tool_result') {
    return { kind: 'toolResult', toolUseId: asText(b.tool_use_id), failed: b.is_error === true };
  }
  return OTHER;
}

/** @param {unknown} raw @returns {Entry} */
function entry(raw) {
  const rec = asRecord(raw);
  const message = asRecord(rec.message);
  const role = rec.type === 'user' ? 'user' : rec.type === 'assistant' ? 'assistant' : 'other';
  return {
    role,
    uuid: text(rec.uuid),
    msgId: text(message.id),
    at: epoch(rec.timestamp),
    content: Array.isArray(message.content) ? message.content.map(block) : null,
  };
}

/** @param {unknown} value @returns {number} */
function epoch(value) {
  const ms = Date.parse(text(value));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * The session's history as a sequence of decision points: each assistant turn, plus a
 * `null` marking every real user prompt. A prompt breaks any run of turns before it,
 * because the agent was given new instructions there.
 *
 * A `user` record carrying only `tool_result` blocks is not a prompt — it is the harness
 * handing back what the assistant just asked for, so it is dropped rather than treated as
 * a boundary. A harness notice is dropped for the same reason and is the same thing wearing
 * text: a background task's completion arrives as a `user` record carrying prose.
 * @param {Record<string, any>[]} records
 * @returns {(Turn | null)[]}
 */
export function timeline(records) {
  const decoded = records.map(entry);

  // A denied `Read` returned no content, so it is not a read. Collected first: a tool_result
  // is always written after the call it answers.
  /** @type {Set<string>} */
  const failed = new Set();
  /** Calls a `tool_result` has come back for at all, error or not. */
  /** @type {Set<string>} */
  const answered = new Set();
  /** Backgrounded calls a completion notice has since reported on. */
  /** @type {Set<string>} */
  const notified = new Set();
  for (const rec of decoded) {
    if (rec.role !== 'user' || rec.content === null) continue;
    for (const b of rec.content) {
      if (b.kind === 'toolResult' && b.toolUseId !== undefined) {
        answered.add(b.toolUseId);
        if (b.failed) failed.add(b.toolUseId);
      }
      if (b.kind === 'text') {
        for (const m of b.text.matchAll(/<tool-use-id>([^<]+)<\/tool-use-id>/g)) notified.add(m[1].trim());
      }
    }
  }

  /** @type {(Turn | null)[]} */
  const out = [];
  for (const rec of decoded) {
    const content = rec.content;
    if (content === null) continue;

    if (rec.role === 'user') {
      const isPrompt = content.some((b) => b.kind !== 'toolResult') && !harnessNotice(content);
      if (isPrompt) out.push(null);
      continue;
    }
    if (rec.role !== 'assistant') continue;

    const toolUses = content.filter(isToolUse).map((b) => ({
      name: b.name,
      input: b.input,
      id: b.id,
      // An id the transcript did not carry belongs to no result.
      ok: !(b.id !== '' && failed.has(b.id)),
      answered: b.id !== '' && answered.has(b.id),
      notified: b.id !== '' && notified.has(b.id),
    }));
    const said = content
      .filter(isText)
      .map((b) => b.text)
      .join('\n')
      .trim();

    // One assistant message is written as **one record per content block**, each carrying the
    // same `message.id` and its own `uuid` — so a turn issuing eight parallel `Read`s arrives
    // here as eight records, and the message id is the only turn boundary on offer.
    const prev = out[out.length - 1];
    if (rec.msgId && prev && prev.msgId === rec.msgId) {
      prev.toolUses.push(...toolUses);
      if (said) {
        prev.text = prev.text ? `${prev.text}\n${said}` : said;
        prev.hasText = true;
      }
      continue;
    }

    out.push({
      uuid: rec.uuid,
      msgId: rec.msgId,
      at: rec.at,
      toolUses,
      hasText: said.length > 0,
      text: said,
    });
  }
  return out;
}

/** @param {Block} b @returns {b is ToolUseBlock} */
function isToolUse(b) {
  return b.kind === 'toolUse';
}

/** @param {Block} b @returns {b is TextBlock} */
function isText(b) {
  return b.kind === 'text';
}

/**
 * Whether a `user` record is the harness reporting on work this session already set going,
 * rather than a person giving new instructions. A backgrounded task's completion and a system
 * notification both arrive as `user` records carrying text, and each says outright that it is
 * not user input — so each is taken at its word instead of being read as a prompt.
 * @param {Block[]} content
 * @returns {boolean}
 */
function harnessNotice(content) {
  for (const b of content) {
    if (b.kind !== 'text') continue;
    if (b.text.includes('<task-notification>')) return true;
    if (b.text.includes('[SYSTEM NOTIFICATION - NOT USER INPUT]')) return true;
  }
  return false;
}

/**
 * Whether the transcript this hook was handed belongs to a run other than the one now making
 * calls — in which case it is not evidence about this run and no gate may judge from it.
 *
 * A subagent's tool call arrives with the **parent session's** `transcript_path`, while the
 * subagent's own turns are written to `<transcript>/subagents/<agent>.jsonl`. So inside a
 * subagent every gate reads the wrong history: reads it genuinely made are invisible, and
 * turns it never took are counted.
 *
 * Detected by recency, because the event carries no agent id: while a subagent runs, its
 * transcript is appended to and the parent's is not. The answer only ever *suppresses* a
 * denial, so being wrong costs a missed violation rather than a refused legitimate call.
 * @param {string} path
 * @returns {boolean}
 */
export function foreignTranscript(path) {
  try {
    if (!path) return false;
    const dir = join(dirname(path), basename(path).replace(/\.jsonl$/, ''), 'subagents');
    const parentAt = statSync(path).mtimeMs;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) continue;
      if (statSync(join(dir, name)).mtimeMs > parentAt) return true;
    }
    return false;
  } catch {
    // No subagent directory, or an unreadable one: the transcript is this run's own.
    return false;
  }
}

/** @param {(Turn | null)[]} line @returns {Turn[]} */
export function turns(line) {
  return /** @type {Turn[]} */ (line.filter((t) => t !== null));
}

/**
 * The command name a turn handed control back from, or null. `shared/closing-turn.md` puts
 * `RETURN /<command>` alone on the last line of the message that hands back. Only a real
 * invocation name matches: the angle-bracket placeholder the snippet itself is written with
 * cannot, so a session that merely loaded a command file has not handed anything back.
 * @param {Turn | null | undefined} turn @returns {string | null}
 */
export function returnMarker(turn) {
  const lines = String(turn?.text ?? '').split('\n');
  const last = (lines[lines.length - 1] ?? '').trim();
  const match = /^RETURN (\/[A-Za-z0-9_:-]+)$/.exec(last);
  return match ? match[1] : null;
}

/**
 * Whether a run this session set going is still running, so a stop here lands mid-pipeline
 * rather than at an ending. Three shapes count, because a pipeline pauses in all three: a
 * command invoked inline with `Skill`, a subagent dispatched with `Agent`, and a headless
 * `claude -p` shell out.
 *
 * The inline half is counted rather than paired, because the two halves are emitted from
 * different places: the parent issues the `Skill` call and the child writes the marker, and a
 * nested handback carries the child's marker alongside the parent's *next* `Skill` call in one
 * message. Only turns since the last real prompt count, since an earlier task's nesting says
 * nothing about this one.
 *
 * A dispatched run is counted differently and never against a marker, because it writes none
 * into this transcript: its report comes back as a tool result, and a backgrounded one reports
 * later as a completion notice. So it is open until whichever of those has arrived.
 *
 * A call that was refused or errored started nothing at all, so it is not open. Counting one
 * leaves `invoked` permanently ahead of `returned` and the gate silent for the rest of the
 * prompt.
 * @param {(Turn | null)[]} line @returns {boolean}
 */
export function nestedRunOpen(line) {
  let open = 0;
  let returned = 0;
  for (let i = line.length - 1; i >= 0; i--) {
    const turn = line[i];
    if (turn === null) break;
    for (const use of turn.toolUses) {
      if (use.ok === false) continue;
      if (use.name === 'Skill') open += 1;
      else if (dispatchOpen(use)) open += 1;
    }
    if (returnMarker(turn)) returned += 1;
  }
  return open > returned;
}

/**
 * Whether a tool use dispatched a run of its own that has not reported back yet. A foreground
 * dispatch is open until its tool result arrives; a backgrounded one answers immediately with
 * an id and is open until its completion notice names that id.
 * @param {Turn['toolUses'][number]} use
 * @returns {boolean}
 */
function dispatchOpen(use) {
  const headless = use.name === 'Bash' && headlessClaude(use.input?.command);
  if (use.name !== 'Agent' && !headless) return false;
  // `Agent` backgrounds by default and `Bash` does not, so each is asked its own question.
  const background =
    use.name === 'Agent' ? use.input?.run_in_background !== false : use.input?.run_in_background === true;
  return background ? use.notified !== true : use.answered !== true;
}

/**
 * Whether a shell command starts a headless Claude run — `claude -p`, or `--print`. Split into
 * segments and matched word by word rather than by one regex over the whole command, so a
 * `-p` belonging to some other program in the same pipeline is not read as this one's.
 * @param {unknown} command
 * @returns {boolean}
 */
export function headlessClaude(command) {
  for (const segment of String(command ?? '').split(/[;&|]+|\$\(|`/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    const at = words.findIndex((w) => w === 'claude' || w.endsWith('/claude'));
    if (at === -1) continue;
    if (words.slice(at + 1).some((w) => w === '-p' || w === '--print' || w.startsWith('--print='))) return true;
  }
  return false;
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
  const wanted = canonical(input ?? {});
  return turn.toolUses.some((u) => u.name === name && canonical(u.input ?? {}) === wanted);
}

/**
 * A value's JSON with object keys in a fixed order, so two encodings of the same input compare
 * equal. The event's `tool_input` and the transcript's copy are serialized by different paths.
 * @param {any} value
 * @returns {string}
 */
function canonical(value) {
  return JSON.stringify(value, (_key, val) =>
    isRecord(val)
      ? Object.fromEntries(
          Object.keys(val)
            .sort()
            .map((k) => [k, val[k]]),
        )
      : val,
  );
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
      // A refused or errored read delivered no bytes, so it never made this file redundant.
      if (use.ok === false) continue;
      if (use.input?.file_path !== path) continue;
      if (use.input?.offset !== undefined || use.input?.limit !== undefined) continue;
      if (turn.at > at) at = turn.at;
    }
  }
  return at;
}

/**
 * The most recent time this session read `path` at all — whole file or a slice — or 0 when it
 * never did. Deliberately broader than `lastFullReadOf`: the question here is not "are these
 * bytes already in context" but "has this file been looked at once already", which is what
 * separates a first look at a watched log from polling it.
 * @param {(Turn | null)[]} line @param {string} path @param {string} [exceptTurnUuid]
 * @returns {number}
 */
export function lastReadOf(line, path, exceptTurnUuid) {
  let at = 0;
  for (const turn of turns(line)) {
    if (exceptTurnUuid && turn.uuid === exceptTurnUuid) continue;
    for (const use of turn.toolUses) {
      if (use.name !== 'Read') continue;
      // A refused or errored read delivered no bytes, so it was never a look at the file.
      if (use.ok === false) continue;
      if (use.input?.file_path !== path) continue;
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
      // A refused read does not satisfy the harness's read-before-write precondition either.
      if (use.ok === false) continue;
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
 * Whether a tool use is a watch this session armed that has **not** reported finishing.
 *
 * The liveness half is what keeps these gates from refusing a legitimate read. A
 * backgrounded Bash command announces its own exit as a completion notice naming its
 * tool-use id, so once that notice has arrived the watch is over and reading its output is
 * the single read the gate asked for — not polling. A `Monitor` is judged live throughout:
 * its notices are the events it was armed to deliver, not an ending, so one arriving says
 * the watch is working rather than that it stopped.
 * @param {Turn['toolUses'][number]} use
 * @returns {boolean}
 */
function liveWatch(use) {
  if (use.name === 'Monitor') return true;
  if (use.name !== 'Bash' || use.input?.run_in_background !== true) return false;
  return use.notified !== true;
}

/**
 * Path-shaped tokens named by a watch this session already armed and that is still running —
 * a `Monitor`, or a backgrounded Bash command and its log file. A live watch delivers its
 * events on its own, so polling the same file by hand is work already being done; a watch that
 * has already reported finishing names nothing here, because then there is nothing to wait for.
 * @param {(Turn | null)[]} line @param {string} [exceptTurnUuid]
 * @returns {string[]}
 */
export function watchedPaths(line, exceptTurnUuid) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const turn of turns(line)) {
    if (exceptTurnUuid && turn.uuid === exceptTurnUuid) continue;
    for (const use of turn.toolUses) {
      if (!liveWatch(use)) continue;
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

/**
 * The files a watch this session armed **and still has running** is writing or following: a
 * backgrounded command's redirect target, a `tee` destination, a `tail -f` argument. Paths as
 * written, for the caller to resolve against the cwd it knows.
 *
 * Deliberately narrower than `watchedPaths`, which keys on every filename-shaped token of the
 * command. That breadth is right for a substring test against another *shell command* and
 * wrong for judging a `Read`: the script a watch runs and the config it was handed are named
 * on its command line too, and a first look at either is not polling anything.
 * @param {(Turn | null)[]} line @param {string} [exceptTurnUuid]
 * @returns {string[]}
 */
export function watchedOutputs(line, exceptTurnUuid) {
  /** @type {Set<string>} */
  const out = new Set();
  /** @param {string | undefined} raw */
  const add = (raw) => {
    const text = String(raw ?? '').replace(/^['"]|['"]$/g, '');
    // `2>&1` duplicates a descriptor rather than naming a file.
    if (!text || text.startsWith('&')) return;
    out.add(text);
  };

  for (const turn of turns(line)) {
    if (exceptTurnUuid && turn.uuid === exceptTurnUuid) continue;
    for (const use of turn.toolUses) {
      if (!liveWatch(use)) continue;
      const command = String(use.input?.command ?? '');
      for (const m of command.matchAll(/\d?>>?\s*("[^"]+"|'[^']+'|[^\s;&|<>]+)/g)) add(m[1]);
      for (const m of command.matchAll(/\btee\s+(?:-\S+\s+)*("[^"]+"|'[^']+'|[^\s;&|<>]+)/g)) add(m[1]);
      for (const m of command.matchAll(/\btail\s+(?:-\S+\s+)*("[^"]+"|'[^']+'|[^\s;&|<>]+)/g)) add(m[1]);
    }
  }
  return [...out];
}
