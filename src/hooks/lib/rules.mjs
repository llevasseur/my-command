// Rule usage: a stable id for every rule worth counting, and an append-only record of each
// time one fires, so a rule that has stopped firing on current models can be found and retired.
//
// Two kinds of rule are counted. A **gate** fires when it refuses a call — the refusal is the
// rule doing its job, and `state.alreadyDenied` is the one place every refusal passes through
// for the first time. A **prose** rule lives in a command's text and has no code to observe it,
// so it fires when `/judge` confirms a claude-proxy suggestion showing the shape the rule
// forbids, and records that through `my-command-tools rules fire`.
//
// **Fires are recorded beside the claude-proxy store, not in it.** The store is the proxy's own
// sessions directory and SQLite database; it has no table for rule fires, and this repo does not
// write into either. So the record is one JSONL file in the proxy's log directory — the parent
// of `CLAUDE_PROXY_STORE` — where the proxy can ingest it and join each row to its `session`
// table on `session`. With no proxy configured it lands beside the gates' own `hooks.log`.
//
// **Recording never changes a gate's answer.** Every function here swallows its own failures:
// an unwritable file or an unreadable transcript costs a row, never a refusal or a crash.
import { appendFileSync, closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { asRecord, asText, text } from './parse.mjs';

/**
 * @typedef {object} Rule
 * @property {string} id       Stable. Renaming one orphans its history, so never rename.
 * @property {'gate' | 'prose'} kind
 * @property {string} source   Where the rule lives, repo-relative.
 * @property {string} summary  What it forbids, in one line.
 */

/**
 * Gate rules, keyed by the name each gate passes to `alreadyDenied`. The id is `gate/<name>`,
 * so the name a gate already used for its once-per-subject key is the rule's identity too.
 * @type {Record<string, string>}
 */
const GATES = {
  watched: 'Re-reading a file a live watch is already following, instead of waiting on the watch.',
  cleanup: 'Hand-rolled branch cleanup instead of `my-command-tools cleanup`.',
  anchor: 'A TodoWrite whose only effect is marking the closing-turn anchor done.',
  glob: 'An unquoted glob that matches nothing, which zsh aborts the whole command on.',
  sleep: 'A foreground sleep used as a wait.',
  stdin: 'Prose piped on stdin to commit or pr instead of a message or body file.',
  compose: 'A heredoc composing a file inside an isolated worktree.',
  perpath: 'One git diff per path for a file list already in hand.',
  guessedjson: 'An inline script parsing a JSON file this session never opened.',
  dumped: 'Dumping a file already in context through a shell command.',
  repeat: 'Re-running an identical read-only probe with nothing changed since.',
  cdnoop: '`cd` into the directory the call already runs in.',
  cd: '`cd` to a relative path that does not resolve.',
  include: '`grep --include` with a glob the shell sees first.',
  program: 'A shell program sent from inside an isolated worktree.',
  bundle: 'Sweeping an OKF doc bundle with grep instead of okq.',
  enter: 'EnterWorktree from a subagent at the repository root.',
  closingtask: 'Writing the closing turn down as a task.',
  toobig: 'A whole-file Read of a file too large to come back.',
  reread: 'A full re-read of a file unchanged since the last full read.',
  serial: 'Too many consecutive turns of unbatched discovery.',
  outcome: 'A run ending without a text-only turn recording its outcome.',
};

/**
 * Prose rules: the shared snippets a confirmed suggestion can show being broken. The id is
 * `prose/<snippet>`, matching `src/shared/<snippet>.md`.
 * @type {Record<string, string>}
 */
const PROSE = {
  'batched-discovery': 'Enumerate the files a phase needs, then read them in one batched turn.',
  'one-diff-call': 'Diff every path in one call rather than one call per path.',
  'closing-turn': 'Close every run in a message carrying text and zero tool calls.',
  'closing-turn-anchor': 'Anchor the closing turn in the todo list before the first tool call.',
  'verify-wait': 'Wait on a verify run with one blocking call; never poll its report.',
  'approval-own-call': 'Send a command that may need approval in its own Bash call.',
  'classifier-refusal': 'Fix a refused command by its form, never by weakening a protection.',
  'signing-retry': 'Retry a commit once after the signing prompt; never sign around it.',
  'worktree-ownership': 'Remove a worktree through the mechanism that created it.',
  'enter-worktree': 'Work by absolute path under the worktree; EnterWorktree only for direct runs.',
  'gh-identity': 'Let the toolkit pick the GitHub identity; never compose GH_TOKEN by hand.',
  'step-marker': 'Open each step with its STEP <n>/<N> marker.',
};

/** Every rule this repo counts, gates first. @type {Rule[]} */
export const RULES = [
  ...Object.entries(GATES).map(([name, summary]) => ({
    id: `gate/${name}`,
    kind: /** @type {const} */ ('gate'),
    source: name === 'outcome' ? 'src/hooks/stop.mjs' : 'src/hooks/pre-tool-use.mjs',
    summary,
  })),
  ...Object.entries(PROSE).map(([name, summary]) => ({
    id: `prose/${name}`,
    kind: /** @type {const} */ ('prose'),
    source: `src/shared/${name}.md`,
    summary,
  })),
];

/** The gate names `alreadyDenied` may be called with, for the test that holds the two in step. */
export const GATE_NAMES = Object.keys(GATES);

/** @param {string} id @returns {Rule | undefined} */
export function ruleById(id) {
  return RULES.find((rule) => rule.id === id);
}

/**
 * The file fires are appended to.
 *
 * `MY_COMMAND_RULE_FIRES` names it outright, which is how a test keeps its fixtures out of the
 * real record. Otherwise the proxy's log directory when `CLAUDE_PROXY_STORE` is set, and the
 * directory holding `hooks.log` when it is not.
 * @returns {string}
 */
export function firesPath() {
  const explicit = process.env.MY_COMMAND_RULE_FIRES?.trim();
  if (explicit) return explicit;
  const store = process.env.CLAUDE_PROXY_STORE?.trim();
  if (store) return join(dirname(store.replace(/\/+$/, '')), 'rule-fires.jsonl');
  // The directory `state.logPath()` puts `hooks.log` in, restated so the two modules do not
  // import each other.
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'my-command', 'rule-fires.jsonl');
}

/** What the current hook event says about whose run this is, set once by `readEvent`. */
let context = { sessionId: '', transcriptPath: '' };

/** @param {{sessionId: string, transcriptPath: string}} next */
export function setFireContext(next) {
  context = { sessionId: next.sessionId, transcriptPath: next.transcriptPath };
}

/** How much of a transcript's tail is searched for the model. One assistant record fits easily. */
const TAIL_BYTES = 256 * 1024;

/**
 * The model the transcript's most recent assistant record names, or null. Only the tail is
 * read: a fire is rare, but a transcript can run to tens of megabytes and a hook has a budget.
 * @param {string} path
 * @returns {string | null}
 */
export function modelFromTranscript(path) {
  if (!path) return null;
  let fd;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    let found = null;
    for (const m of buffer.toString('utf8').matchAll(/"model"\s*:\s*"([^"]+)"/g)) found = m[1];
    return found;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Already closed or never opened; nothing to release.
      }
    }
  }
}

/**
 * Append one fire. Never throws.
 * @param {string} rule A rule id.
 * @param {{model?: string | null, session?: string, at?: string, origin?: string,
 *   suggestion?: string, bucket?: string, thread?: string}} [extra]
 * @returns {Record<string, unknown> | null} The row written, or null when nothing was.
 */
export function recordFire(rule, extra = {}) {
  try {
    /** @type {Record<string, unknown>} */
    const row = {
      v: 1,
      rule,
      at: extra.at ?? new Date().toISOString(),
      model: extra.model === undefined ? modelFromTranscript(context.transcriptPath) : extra.model,
      session: extra.session ?? context.sessionId ?? '',
      origin: extra.origin ?? 'hook',
    };
    // Where a /judge fire came from, kept only when given so a gate's row stays short.
    if (extra.suggestion) row.suggestion = extra.suggestion;
    if (extra.bucket) row.bucket = extra.bucket;
    if (extra.thread) row.thread = extra.thread;
    const path = firesPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(row)}\n`);
    return row;
  } catch {
    return null;
  }
}

/**
 * @typedef {object} Fire
 * @property {string} rule
 * @property {string} at
 * @property {string | null} model
 * @property {string} session
 * @property {string} origin
 */

/**
 * Every fire recorded, oldest first. A torn or foreign line is skipped, as the transcript
 * reader skips one: the file is appended to live.
 * @param {string} [path]
 * @returns {Fire[]}
 */
export function readFires(path = firesPath()) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  /** @type {Fire[]} */
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = asRecord(JSON.parse(line));
      const rule = asText(row.rule);
      const at = asText(row.at);
      if (rule === undefined || at === undefined) continue;
      out.push({
        rule,
        at,
        model: asText(row.model) || null,
        session: text(row.session),
        origin: asText(row.origin) ?? 'hook',
      });
    } catch {
      // A torn final line.
    }
  }
  return out;
}
