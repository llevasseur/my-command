// `stash` — the /cp clipboard stash ring, owned by one verb instead of pasted into a prompt.
//
// It lives here for the reason the concept store moved into `concepts` and prose moved into
// `commit --message-file`: `Bash(my-command-tools:*)` is allowlisted in
// src/hooks/settings-fragment.json, so a verb call is one approval-free command a gate can
// read. The rotation it replaces was a `for i in 3 2 1` loop composing `$((i + 1))` paths —
// a different string every time, allowlistable never, and refused outright by a
// worktree-isolated session because a loop-computed path cannot be resolved by reading it.
// Every path here was always under `~/.claude`; the shape was the whole problem.
//
// The ring, the write, and the clipboard sink live in one call, so "the stash is written on
// every platform, only the clipboard is platform-detected" is a property of the code rather
// than a rule to recall.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { bool, str } from '../lib/flags.mjs';
import { ToolkitError } from '../lib/proc.mjs';

export const usage = `stash <write|restore|list> [<slot>] [--content-file <path>] [--consume] [--no-clipboard]

Own the /cp stash ring: five plain-text entries under ~/.claude, and the clipboard.

  stash write --content-file <absolute path>
      Rotate the ring, install that file's bytes as the newest entry, and copy them to the
      clipboard. The content arrives as a path, never as an argument, so no shell quoting can
      corrupt a line containing quotes, backslashes, or newlines — write it with the \`Write\`
      tool and hand over the path, the way \`commit --message-file\` already works.

  stash restore [<slot>]
      Copy an entry back to the clipboard. Slot 0 (the default) is the newest. A slot that
      holds nothing is reported and the clipboard is left alone — an empty clipboard is worse
      than whatever is on it now.

  stash list
      Every slot, whether it exists, its size, and when it was written.

  --consume        Delete the content file once its bytes are in the ring. The file is a
                   hand-off, not a document, so a caller that mints a fresh path per run —
                   which /cp does, because \`Write\` refuses to overwrite what the session has
                   not read — would otherwise leave one behind on every invocation.

  --no-clipboard   Do the file half only. The stash is written on every platform; only the
                   clipboard sink is platform-detected.

The ring is five deep — cp-last.txt plus cp-last.1.txt through cp-last.4.txt — and the oldest
is dropped on each write. It lives under ~/.claude (or $CLAUDE_CONFIG_DIR) and nowhere else:
nothing is ever written into the repository the session happens to be in.`;

/** Entries in the ring: `cp-last.txt` plus `cp-last.1.txt` … `cp-last.4.txt`. */
const DEPTH = 5;

/**
 * The clipboard sinks, in the order they are tried. Detection is by attempting the call and
 * treating "no such binary" as "not this platform" — cheaper than probing for each one, and
 * it cannot disagree with what actually runs.
 */
const SINKS = [
  { bin: 'pbcopy', args: [] },
  { bin: 'wl-copy', args: [] },
  { bin: 'xclip', args: ['-selection', 'clipboard'] },
  { bin: 'clip.exe', args: [] },
];

/**
 * The directory the ring lives in. `$CLAUDE_CONFIG_DIR` wins where it is set, matching how
 * every other install path on this device resolves.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function stashDir(env = process.env) {
  const configured = (env.CLAUDE_CONFIG_DIR ?? '').trim();
  return configured || join(homedir(), '.claude');
}

/**
 * @param {string} dir @param {number} slot
 * @returns {string}
 */
export function slotPath(dir, slot) {
  return join(dir, slot === 0 ? 'cp-last.txt' : `cp-last.${slot}.txt`);
}

/**
 * A slot number from a positional argument. Anything outside the ring is a usage error rather
 * than a silent read of a path that can never hold anything.
 * @param {string | undefined} given
 * @returns {number}
 */
function slotOf(given) {
  if (given === undefined) return 0;
  const n = Number(given);
  if (!Number.isInteger(n) || n < 0 || n >= DEPTH) {
    throw new ToolkitError(`slot ${JSON.stringify(given)} is not in the ring — it holds slots 0 through ${DEPTH - 1}`, {
      slot: given,
      depth: DEPTH,
    });
  }
  return n;
}

/**
 * Put a file's bytes on the clipboard. Reports which sink took them, or why none did — never
 * throws, because a device with no clipboard is a stated skip and the stash is already
 * written either way.
 * @param {string} path
 * @returns {{copied: boolean, sink: string | null, reason: string | null}}
 */
function toClipboard(path) {
  let content;
  try {
    content = readFileSync(path);
  } catch (err) {
    return { copied: false, sink: null, reason: err instanceof Error ? err.message : String(err) };
  }

  /** @type {string[]} */
  const tried = [];
  for (const sink of SINKS) {
    const r = spawnSync(sink.bin, sink.args, { input: content });
    if (!r.error && r.status === 0) return { copied: true, sink: sink.bin, reason: null };
    tried.push(sink.bin);
  }
  return {
    copied: false,
    sink: null,
    reason: `no clipboard sink on this device (tried ${tried.join(', ')})`,
  };
}

/**
 * Shift every entry one slot older and drop what falls off the end.
 * @param {string} dir
 * @returns {{rotated: Array<{from: number, to: number}>, dropped: string | null}}
 */
function rotate(dir) {
  const oldest = slotPath(dir, DEPTH - 1);
  const dropped = existsSync(oldest) ? oldest : null;
  if (dropped) rmSync(oldest);

  /** @type {Array<{from: number, to: number}>} */
  const rotated = [];
  for (let i = DEPTH - 2; i >= 0; i--) {
    const from = slotPath(dir, i);
    if (!existsSync(from)) continue;
    renameSync(from, slotPath(dir, i + 1));
    rotated.push({ from: i, to: i + 1 });
  }
  return { rotated, dropped };
}

/**
 * @param {string} dir @param {string | undefined} contentFile @param {boolean} clipboard
 * @param {boolean} consume
 */
function write(dir, contentFile, clipboard, consume) {
  if (!contentFile) {
    throw new ToolkitError(
      'stash write needs --content-file <absolute path> — the entry is read from a file, never from an argument',
      {
        subcommand: 'write',
      },
    );
  }
  if (!existsSync(contentFile)) {
    throw new ToolkitError(`the content file ${JSON.stringify(contentFile)} does not exist`, {
      subcommand: 'write',
      contentFile,
    });
  }

  mkdirSync(dir, { recursive: true });
  const { rotated, dropped } = rotate(dir);
  const path = slotPath(dir, 0);
  copyFileSync(contentFile, path);
  // The bytes are in the ring now, so the hand-off file has no further job. `/cp` mints a
  // fresh compose path per invocation — `Write` rejects an overwrite of a file the session
  // never read, so a fixed path failed on the first write of every run after the first — and
  // a unique name per run is exactly the shape that accumulates if nobody removes it.
  if (consume) rmSync(contentFile, { force: true });

  return {
    subcommand: 'write',
    dir,
    path,
    bytes: statSync(path).size,
    consumed: consume ? contentFile : null,
    rotated,
    dropped,
    clipboard: clipboard ? toClipboard(path) : { copied: false, sink: null, reason: '--no-clipboard' },
  };
}

/**
 * @param {string} dir @param {number} slot @param {boolean} clipboard
 */
function restore(dir, slot, clipboard) {
  const path = slotPath(dir, slot);
  if (!existsSync(path)) {
    throw new ToolkitError(`slot ${slot} holds nothing — ${path} does not exist, so the clipboard was left alone`, {
      subcommand: 'restore',
      slot,
      path,
      exists: false,
    });
  }

  return {
    subcommand: 'restore',
    dir,
    slot,
    path,
    bytes: statSync(path).size,
    clipboard: clipboard ? toClipboard(path) : { copied: false, sink: null, reason: '--no-clipboard' },
  };
}

/** @param {string} dir */
function list(dir) {
  const slots = [];
  for (let i = 0; i < DEPTH; i++) {
    const path = slotPath(dir, i);
    let stat = null;
    try {
      stat = statSync(path);
    } catch {
      // A slot that was never filled, or one the ring has not reached yet.
    }
    slots.push({
      slot: i,
      path,
      exists: stat !== null,
      bytes: stat ? stat.size : 0,
      writtenAt: stat ? stat.mtime.toISOString() : null,
    });
  }
  return { subcommand: 'list', dir, depth: DEPTH, slots };
}

/**
 * The one-line status every caller reads; `--json` asks the CLI for the payload instead.
 * @param {any} result @returns {string}
 */
export function line(result) {
  if (result.subcommand === 'list') {
    return result.slots
      .map((/** @type {any} */ s) => `${s.slot}: ${s.exists ? `${s.bytes} bytes, ${s.writtenAt}` : 'empty'}`)
      .join('\n');
  }
  const clip = result.clipboard.copied
    ? `copied to the clipboard with ${result.clipboard.sink}`
    : `not copied to the clipboard (${result.clipboard.reason})`;
  const what = result.subcommand === 'write' ? `stashed ${result.bytes} bytes` : `restored slot ${result.slot}`;
  return `${what}; ${clip}`;
}

/**
 * @param {import('../cli.mjs').Ctx} ctx
 */
export function run(ctx) {
  const [sub, ...rest] = ctx.positionals;
  const dir = stashDir();
  const clipboard = !bool(ctx.flags['no-clipboard']);

  if (sub === 'write') return write(dir, str(ctx.flags['content-file']), clipboard, bool(ctx.flags.consume));
  if (sub === 'restore') return restore(dir, slotOf(rest[0]), clipboard);
  if (sub === 'list') return list(dir);

  throw new ToolkitError(`unknown subcommand ${JSON.stringify(sub ?? '')} — expected write, restore, or list`, {
    subcommand: String(sub ?? ''),
  });
}
