#!/usr/bin/env node
// PreToolUse — the call shapes that fail, or pay twice, for a known reason.
// See docs/specs/workflow-gates.md.
//
//   serial discovery  — a 4th straight turn of nothing but read-only calls (batch instead)
//   redundant read    — a whole-file Read of a file already read whole and unchanged since
//   unread edit       — an Edit of a path this session never read, which Edit itself rejects
//   dumped again      — a shell probe dumping a file already read whole and unchanged
//   repeated probe    — the same Bash probe re-issued with nothing since to change its answer
//   polling a watch   — a probe of a file a Monitor in this session is already watching
//   relative cd       — `cd <relative path>` that does not resolve from the current dir
//   unmatched glob    — an unquoted glob matching nothing, which zsh aborts the command on
//   foreground sleep  — a wait the harness refuses, taking the probe chained to it down too
//   heredoc write     — composing a file in the shell where the Write tool does it directly
//   prose on stdin    — a toolkit verb asked to read `-`, which is what invites the heredoc
//   guessed JSON      — a `node -e`/`python3 -c` one-liner against a JSON shape never read
//   diff again        — a per-path diff after `scope --diff` already returned that content
//   read-polling      — a `Read` of a file a watch in this session is already following
//   trailing anchor   — a bookkeeping call scheduled after the run's last real work
//
// A scratch write under `$CLAUDE_JOB_DIR` from a worktree is deliberately *not* here: see
// "The job directory is not a gate" in the spec.
//
// They share a hook because they decide from the same transcript; parsing it more than once
// would let the answers disagree.
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import {
  dumpedFiles,
  foregroundSleep,
  heredocWrite,
  inlineScriptJson,
  perPathDiff,
  ranToolkit,
  stdinProseFlag,
  unmatchedGlob,
} from './lib/bash-shapes.mjs';
import { deny, guard, readEvent } from './lib/io.mjs';
import { isReadOnly } from './lib/read-only.mjs';
import { alreadyDenied, clearGate } from './lib/state.mjs';
import {
  entries,
  issued,
  lastFullReadOf,
  repeatedProbe,
  timeline,
  touched,
  turns,
  watchedOutputs,
  watchedPaths,
} from './lib/transcript.mjs';

/**
 * Turns of pure discovery allowed in a row. Three batched turns is already tens of files,
 * so reaching a 4th means the reads were not enumerated up front.
 */
const MAX_SERIAL_TURNS = 3;

/**
 * How much newer than the earlier read a file's mtime must be to count as changed. A write
 * and the read after it can land in the same second, and the wrong call to get wrong is
 * refusing a genuine re-read.
 */
const CHANGED_GRACE_MS = 2000;

/** File tools whose call the harness rejects unless this session read the path first. */
const EDITORS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

/**
 * Commits of history consulted for co-change, and companions offered. Both bounded: the list
 * is a hint for one batch, not an audit. They live above `guard()` rather than beside the
 * function that reads them, because the dispatcher below runs at module evaluation — a `const`
 * declared later is still in its temporal dead zone when the gate fires, and `companions()`
 * catches that `ReferenceError` into an empty list, which is indistinguishable from a repo
 * with no history.
 */
const COCHANGE_COMMITS = 40;
const COCHANGE_MAX = 8;

guard(() => {
  const event = readEvent();
  if (!event) return;
  const name = event.tool_name;
  const input = event.tool_input ?? {};
  const session = String(event.session_id ?? '');

  const readOnly = isReadOnly(name, input);

  if (name === 'Bash') {
    // Cheapest gates first, and the only ones that need no transcript: a command whose own
    // shape makes it fail is going to fail whatever the session did before it.
    if (badShape(event, input, session)) return;
    // These need the transcript but not read-only status: a dumper like `sed` is not
    // classified read-only, and dumping a file already in context is the shape regardless.
    const line = timeline(entries(event.transcript_path ?? ''));
    if (staleProbe(event, input, line, session, readOnly)) return;
    if (!readOnly) {
      clearGate(session, 'serial');
      return;
    }
    serialDiscovery(name, input, line, session);
    return;
  }

  if (!readOnly) {
    // A real action ends the discovery run, so the gate is armed again for the next one.
    clearGate(session, 'serial');
    if (EDITORS.has(name)) unreadEdit(event, name, input, session);
    if (name === 'TodoWrite') trailingAnchor(event, input, session);
    return;
  }

  const line = timeline(entries(event.transcript_path ?? ''));
  const cwd = typeof event.cwd === 'string' ? event.cwd : process.cwd();
  if (name === 'Read' && readPolling(input, line, session, cwd)) return;
  if (name === 'Read' && redundantRead(input, line, session)) return;
  serialDiscovery(name, input, line, session);
});

/**
 * Refuse a `Read` of a file a `Monitor` or a backgrounded Bash command in this session is
 * already following. The shell half of this has been gated since the watch gate shipped; the
 * `Read` half was not, and it is the half that recurred — a backgrounded verify run whose
 * output file was re-read three times while waiting, with the file unchanged between reads.
 * A watch delivers its events itself, so there is no second read to make.
 *
 * Only the watch's own output target counts — the file it redirects to, `tee`s to, or tails —
 * compared as a whole resolved path. A first read of the script a watch runs, or of the config
 * it was handed, is discovery rather than polling.
 * @param {Record<string, any>} input
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line @param {string} session
 * @param {string} cwd
 * @returns {boolean} true when the call was denied
 */
function readPolling(input, line, session, cwd) {
  const path = input?.file_path;
  if (typeof path !== 'string') return false;

  const all = turns(line);
  const current = all[all.length - 1];
  const currentUuid = current && issued(current, 'Read', input) ? current.uuid : undefined;
  const target = isAbsolute(path) ? path : resolve(cwd, path);
  const watched = watchedOutputs(line, currentUuid).find(
    (file) => (isAbsolute(file) ? file : resolve(cwd, file)) === target,
  );
  if (!watched) return false;
  if (alreadyDenied(session, 'watched', watched)) return false;

  deny(
    `A watch armed earlier in this session is already following ${watched}, and this \`Read\` is ` +
      `polling it by hand. Waiting is the watch's job: its events arrive as notifications on ` +
      `their own schedule, so a second and third read of the same file return the same bytes ` +
      `and a stalled condition is polled forever.\n\n` +
      `Do not read it again to find out whether it moved. Let the notification arrive, or — if ` +
      `the filter is not catching what you need — arm a bounded wait that ends by itself:\n` +
      `  Bash({run_in_background: true, command: "until grep -q '<done marker>' ${path}; do sleep 1; done"})\n` +
      `widening the pattern to the failure signatures too, so a crash is not silence.\n\n` +
      `Read it once, after the wait reports. If that watch has already ended, say so and ` +
      `re-issue: this refusal happens once.`,
  );
  return true;
}

/**
 * Refuse a `TodoWrite` whose only remaining effect is to mark the closing-turn anchor done.
 * The Stop gate below already refuses a run that ends on a tool call — but it fires *after*
 * the run has already ended that way, and the recorded shape is always the same: a complete
 * report was composed, and this bookkeeping call was attached to it, so the harness recorded
 * a decision mid-run instead of an outcome. The scheduling is the thing to remove, so it is
 * refused here, before the turn exists.
 * @param {Record<string, any>} event @param {Record<string, any>} input @param {string} session
 */
function trailingAnchor(event, input, session) {
  const todos = input?.todos;
  if (!Array.isArray(todos) || todos.length === 0) return;

  const anchors = todos.filter((t) => /close the run|text-only turn/i.test(String(t?.content ?? t?.subject ?? '')));
  if (anchors.length === 0) return;
  // Only when the anchor is the single thing this call completes: every other item is
  // already done, and the anchor is what this write flips.
  if (!anchors.every((t) => t?.status === 'completed')) return;
  if (!todos.every((t) => t?.status === 'completed')) return;

  const line = timeline(entries(event.transcript_path ?? ''));
  const all = turns(line);
  const current = all[all.length - 1];
  // A bookkeeping call riding along with real work is the prescribed form; only a call that
  // is the turn's whole content is the shape that ends a run.
  if (current && issued(current, 'TodoWrite', input) && current.toolUses.length > 1) return;
  if (alreadyDenied(session, 'anchor', 'closing')) return;

  deny(
    `Every item on this list is complete except the closing-turn anchor, and this call is the ` +
      `only thing in its turn — so marking it is the last action the run would take, and the run ` +
      `would end on a tool call with no outcome recorded. That is the exact failure the anchor ` +
      `exists to prevent, arriving through the anchor itself.\n\n` +
      `Do not schedule this call. The anchor is bookkeeping the run no longer needs: reply now ` +
      `with the report in text alone — one self-contained line saying where the run stands, then ` +
      `the detail. An anchor left open is never a reason to spend a turn on a tool call.\n\n` +
      `If you genuinely still owe real work, send that work and mark the anchor in the same turn ` +
      `as it, which is what the anchor asks for.`,
  );
}

/**
 * The Bash gates that need only the command and the cwd. Ordered cheapest first; each one
 * refuses a command that either cannot run or is refused before it runs.
 * @param {Record<string, any>} event @param {Record<string, any>} input @param {string} session
 * @returns {boolean} true when the call was denied
 */
function badShape(event, input, session) {
  const command = input?.command;
  if (typeof command !== 'string') return false;
  const cwd = typeof event.cwd === 'string' ? event.cwd : process.cwd();

  if (relativeCd(event, input)) return true;

  const glob = unmatchedGlob(command, cwd);
  if (glob && !alreadyDenied(session, 'glob', glob)) {
    deny(
      `\`${glob}\` is an unquoted pattern that matches nothing from ${cwd}. This shell is zsh, ` +
        `where that aborts the whole command with "no matches found" — nothing in it runs, ` +
        `including the parts that would have worked.\n\n` +
        `Quote any pattern the invoked program should expand rather than the shell:\n` +
        `  • \`rg -g '*.ts'\` and \`rg --files -g '*.ts'\` instead of \`grep --include=*.ts\`\n` +
        `  • \`find . -name '*.ts'\`, with the pattern quoted\n\n` +
        `If the shell genuinely should expand it, the files it would match do not exist here — ` +
        `check the path first.`,
    );
    return true;
  }

  const sleeping = foregroundSleep(command, input?.run_in_background === true);
  if (sleeping && !alreadyDenied(session, 'sleep', 'foreground')) {
    deny(
      `\`${sleeping}\` waits in the foreground, which the harness refuses — and it refuses the ` +
        `whole call, so a probe chained after the wait never runs either.\n\n` +
        `Wait on the condition instead of on the clock:\n` +
        `  • \`Monitor\` with a filter for the lines you would have grepped for\n` +
        `  • Bash with \`run_in_background: true\` and \`until <check>; do sleep 1; done\` ` +
        `inside the backgrounded script, which notifies once when it exits\n` +
        `  • \`gh pr checks --watch\`, which blocks properly, for CI\n\n` +
        `Start long work with \`run_in_background: true\` and a log file, then wait on that log.`,
    );
    return true;
  }

  // Before the heredoc gate, because the stdin flag is *why* the heredoc gets composed.
  const stdin = stdinProseFlag(command);
  if (stdin && !alreadyDenied(session, 'stdin', stdin.verb)) {
    deny(
      `\`my-command-tools ${stdin.verb} ${stdin.flag} -\` reads its prose from stdin, and the only ` +
        `way to put multi-line prose there is a heredoc — which is refused wholesale inside an ` +
        `isolated worktree, mid-commit, every time.\n\n` +
        `The verb takes a path instead. Write the prose with the \`Write\` tool, then hand over ` +
        `the file:\n` +
        `  Write({file_path: "<absolute path>", content: "…"})\n` +
        `  my-command-tools ${stdin.verb} ${stdin.replacement} <absolute path> …\n\n` +
        `No shell quoting, no heredoc, and nothing to reissue a turn later.`,
    );
    return true;
  }

  if (heredocWrite(command) && !alreadyDenied(session, 'heredoc', 'write')) {
    deny(
      `This command composes a file from a heredoc. That shape is refused wholesale inside an ` +
        `isolated worktree, and re-sending it is refused for the same reason.\n\n` +
        `Write the file with the \`Write\` tool instead — no shell, no quoting, no guard — then ` +
        `pass its path to whatever needs it:\n` +
        `  Write({file_path: "<absolute path>", content: "…"})\n` +
        `  my-command-tools commit --message-file <absolute path> <path> …\n` +
        `  my-command-tools pr --title <text> --body-file <absolute path>\n` +
        `Both verbs take the path directly; neither needs stdin. Anything else runs by path too.`,
    );
    return true;
  }

  return false;
}

/**
 * Refuse an `Edit`/`Write` of a path this session never read. `Edit` enforces this itself
 * with "File has not been read yet", so the call was going to be rejected — the gate's value
 * is saying to read *every* target of this edit pass at once, instead of hitting the same
 * rejection file after file.
 * @param {Record<string, any>} event @param {string} name
 * @param {Record<string, any>} input @param {string} session
 */
function unreadEdit(event, name, input, session) {
  const path = input?.file_path ?? input?.notebook_path;
  if (typeof path !== 'string' || !isAbsolute(path)) return;
  // Creating a file needs no prior read; only an existing one carries the precondition.
  try {
    if (!statSync(path).isFile()) return;
  } catch {
    return;
  }

  const line = timeline(entries(event.transcript_path ?? ''));
  const all = turns(line);
  const current = all[all.length - 1];
  const currentUuid = current && issued(current, name, input) ? current.uuid : undefined;
  if (touched(line, path, currentUuid)) return;
  if (alreadyDenied(session, 'unread', path)) return;

  // The value of this gate was always "read the whole pass at once", and asking for a list
  // the agent has to assemble is why it was rediscovered one rejection at a time. So the
  // list is derived here and handed over: the files this repo's own history changes
  // alongside this one, minus the ones already read.
  const rest = companions(path).filter((p) => !touched(line, p, currentUuid));

  deny(
    `This session has not read ${path}, so \`${name}\` will reject it with "File has not been ` +
      `read yet". Inherited context, a continuation summary, and shell output do not satisfy ` +
      `that precondition, and re-sending this edit cannot clear it.\n\n` +
      `Read it first — and read every *other* file this edit pass will write in the same turn, ` +
      `as one batch of parallel \`Read\` calls. A targeted \`offset\`/\`limit\` slice counts.\n\n` +
      (rest.length > 0
        ? `This repo's history changes these alongside it, and this session has read none of ` +
          `them either. If the pass writes them, they belong in the same batch:\n` +
          `${rest.map((p) => `  Read({file_path: "${p}"})`).join('\n')}\n\n` +
          `Send that block in one turn rather than meeting this same rejection file after file.`
        : `Enumerate the pass's whole write set now and send it as one block, rather than ` +
          `meeting this same rejection file after file.`),
  );
}

/**
 * Files this repository's recent history changes in the same commit as `path`, most frequent
 * first. Derivable rather than remembered — a command file and its built copy, its skill, its
 * feature doc and the changelog move together every time — which is what makes discovering
 * them one rejection at a time a removable cost rather than an unavoidable one.
 * @param {string} path
 * @returns {string[]}
 */
function companions(path) {
  try {
    const cwd = dirname(path);
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!root) return [];

    // Ask git for the repo-relative name rather than subtracting the root from the path: on
    // macOS the root comes back through /private/var while the event's path does not, and
    // that difference both misses the history and leaves the file in its own companion list.
    const self = execFileSync('git', ['ls-files', '--full-name', '--', basename(path)], {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')[0]
      .trim();
    if (!self) return [];

    // Two calls rather than one, because a pathspec narrows `--name-only`'s output as well as
    // the commit set: `git log --name-only -- <self>` lists only `self`, never what moved with
    // it. So ask which commits touched it, then ask those commits what else they carried.
    const hashes = execFileSync('git', ['log', `--max-count=${COCHANGE_COMMITS}`, '--format=%H', '--', self], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean);
    if (hashes.length === 0) return [];

    const log = execFileSync('git', ['log', '--no-walk', '--format=%x00', '--name-only', ...hashes], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    /** @type {Map<string, number>} */
    const tally = new Map();
    for (const commit of log.split('\0')) {
      for (const name of new Set(commit.split('\n').filter(Boolean))) {
        if (name === self) continue;
        const full = resolve(root, name);
        tally.set(full, (tally.get(full) ?? 0) + 1);
      }
    }

    return [...tally.entries()]
      .filter(([full]) => existsSync(full))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, COCHANGE_MAX)
      .map(([full]) => full);
  } catch {
    // Not a repo, git missing, or a slow history: the gate's advice stands without the list.
    return [];
  }
}

/**
 * The read-only Bash gates: a probe whose answer this session already has. All three decide
 * from evidence about *this* command and *this* path, never from how many calls a turn
 * carried — a legitimate parallel batch is unaffected by every one of them.
 * @param {Record<string, any>} event @param {Record<string, any>} input
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line @param {string} session
 * @param {boolean} readOnly
 * @returns {boolean} true when the call was denied
 */
function staleProbe(event, input, line, session, readOnly) {
  const command = input?.command;
  if (typeof command !== 'string') return false;
  const cwd = typeof event.cwd === 'string' ? event.cwd : process.cwd();
  const all = turns(line);
  const current = all[all.length - 1];
  const currentUuid = current && issued(current, 'Bash', input) ? current.uuid : undefined;

  // A watch already armed in this session delivers its events on its own.
  const watched = watchedPaths(line, currentUuid).find((file) => command.includes(file));
  if (watched && !alreadyDenied(session, 'watched', watched)) {
    deny(
      `A watch armed earlier in this session is already following ${watched}. Its events arrive ` +
        `as notifications on their own schedule — polling the same file by hand repeats work ` +
        `that is already happening, and a stalled condition polls forever.\n\n` +
        `Wait for the notification. If the filter is not catching what you need, arm a new ` +
        `\`Monitor\` with a wider one — including the failure signatures, so a crash is not ` +
        `silence — rather than checking by hand alongside it.\n\n` +
        `If that watch has already ended, say so and re-issue: this refusal happens once.`,
    );
    return true;
  }

  // A per-path diff after `scope --diff` already returned that same content. Narrowing is
  // the right shape on its own — this refuses it only when the answer is already in context.
  const narrowed = perPathDiff(command);
  if (narrowed && scopedDiff(line, currentUuid) && !alreadyDenied(session, 'perpath', 'diff')) {
    deny(
      `\`my-command-tools scope --diff\` already ran in this session, and it returns the branch's ` +
        `whole diff — every file, hunk by hunk, each line annotated with its own line number. ` +
        `That content is in your context, so this diff fetches bytes you already have.\n\n` +
        `Read \`diff.committed\` and \`diff.workingTree\` from that result instead. There is no ` +
        `second diff call: the hunk you are about to narrow to is already in the first one, and ` +
        `walking the file list one call per path is exactly the loop \`scope --diff\` replaced.\n\n` +
        `If a file came back under \`diff.omitted\`, it passed the size cap — re-run \`scope ` +
        `--diff --diff-limit <chars>\` once, rather than diffing that path by hand.`,
    );
    return true;
  }

  // An inline one-liner parsing a JSON document this session has never opened.
  for (const path of inlineScriptJson(command, cwd)) {
    if (touched(line, path, currentUuid)) continue;
    if (alreadyDenied(session, 'guessedjson', path)) continue;

    deny(
      `This one-liner reaches into ${path}, which this session has never read — so the keys it ` +
        `indexes are guessed, and the first one that is not there returns \`undefined\` or throws. ` +
        `Recorded runs spend two or three turns converging on a shape a single read would have ` +
        `settled.\n\n` +
        `Read the document first, in the same turn as anything else you already know you need:\n` +
        `  Read({file_path: "${path}"})\n` +
        `then write the expression against the shape you saw. For a large document, one ` +
        `\`jq 'keys'\`-style probe of the level you want is the read; guessing is not.`,
    );
    return true;
  }

  // A file already read whole and unchanged, being dumped again through the shell.
  for (const path of dumpedFiles(command, cwd)) {
    const priorAt = lastFullReadOf(line, path, currentUuid);
    if (priorAt === 0) continue;
    let mtime;
    try {
      mtime = statSync(path).mtimeMs;
    } catch {
      continue;
    }
    if (mtime > priorAt - CHANGED_GRACE_MS) continue;
    if (alreadyDenied(session, 'dumped', path)) continue;

    deny(
      `This session already read ${path} in full and it has not changed since, so dumping it ` +
        `through the shell returns bytes that are already in your context.\n\n` +
        `Re-narrowing on a file already read is the shape to drop: locate what you now want in ` +
        `one pass, then read only that range.\n` +
        `  rg -n 'firstSymbol|secondSymbol' ${path}\n` +
        `  Read({file_path: "${path}", offset: <line>, limit: <count>})`,
    );
    return true;
  }

  // The same probe, with nothing since that could have changed its answer. Read-only only:
  // a build or a test suite is legitimately re-run.
  if (readOnly && repeatedProbe(line, command, currentUuid, isReadOnly)) {
    const key = basename(command.slice(0, 120));
    if (!alreadyDenied(session, 'repeat', key)) {
      deny(
        `This session already ran exactly this command, and nothing since could have changed its ` +
          `answer — no action, and no new instruction from me. Its output is in your context.\n\n` +
          `If this is one probe per item of a list you already hold, that list is the enumeration: ` +
          `ask for every item at once — one \`git diff <base>...HEAD -- <path> <path> …\`, one ` +
          `\`git log --oneline <a>..<b>\`, one \`rg -n 'a|b|c'\` — instead of the same call per item.`,
      );
      return true;
    }
  }
  return false;
}

/**
 * Whether this session already ran `my-command-tools scope --diff`, whose result carries the
 * branch's whole diff content.
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line @param {string} [exceptTurnUuid]
 * @returns {boolean}
 */
function scopedDiff(line, exceptTurnUuid) {
  for (const turn of turns(line)) {
    if (exceptTurnUuid && turn.uuid === exceptTurnUuid) continue;
    for (const use of turn.toolUses) {
      if (use.name !== 'Bash') continue;
      if (ranToolkit(String(use.input?.command ?? ''), 'scope', '--diff')) return true;
    }
  }
  return false;
}

/**
 * Refuse `cd <relative path>` when the path does not exist from here. Unambiguous by
 * construction: the command would fail on this line anyway with `no such file or
 * directory`, so the gate trades a wasted turn for the form that works.
 * @param {Record<string, any>} event @param {Record<string, any>} input
 * @returns {boolean} true when the call was denied
 */
function relativeCd(event, input) {
  const command = input?.command;
  if (typeof command !== 'string') return false;
  const from = typeof event.cwd === 'string' ? event.cwd : process.cwd();

  // `cd` at the start of the command or of any segment. A `cd` deeper inside a quoted
  // string or a substitution is not matched, which is the safe direction.
  for (const m of command.matchAll(/(?:^|[;&|(]\s*|&&\s*|\|\|\s*)cd\s+("[^"]+"|'[^']+'|[^\s;&|)]+)/g)) {
    const target = m[1].replace(/^['"]|['"]$/g, '');
    // Absolute paths, home-relative paths, `cd -`, and anything the shell expands are all
    // out of scope: only a plain relative path can be checked here and be certain.
    if (!target || target === '-' || isAbsolute(target) || target.startsWith('~')) continue;
    if (/[$`*?]/.test(target)) continue;
    if (existsSync(resolve(from, target))) continue;

    deny(
      `\`cd ${target}\` does not resolve from ${from}, so this command would fail with ` +
        `"no such file or directory" before doing anything.\n\n` +
        `Spell the path absolutely instead of changing directory:\n` +
        `  • the toolkit takes the checkout as a flag — \`my-command-tools <verb> --cwd <absolute path>\`\n` +
        `  • git takes it as \`git -C <absolute path> …\`\n` +
        `  • everything else takes the absolute path as its argument\n\n` +
        `If a directory genuinely must be entered, enter it by absolute path.`,
    );
    return true;
  }
  return false;
}

/**
 * Refuse a whole-file `Read` of a file this session already read whole and that has not
 * changed since. Three conditions, all required: this read asks for the whole file, an
 * earlier read in this session also did, and the mtime predates that read. A file touched
 * since — by an `Edit`, a formatter, a generator, another agent — passes.
 * @param {Record<string, any>} input
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line @param {string} session
 * @returns {boolean} true when the call was denied
 */
function redundantRead(input, line, session) {
  const path = input?.file_path;
  if (typeof path !== 'string') return false;
  // A targeted slice is the form this gate asks for; never refuse one.
  if (input.offset !== undefined || input.limit !== undefined) return false;

  const all = turns(line);
  const current = all[all.length - 1];
  const currentUuid = current && issued(current, 'Read', input) ? current.uuid : undefined;
  const priorAt = lastFullReadOf(line, path, currentUuid);
  if (priorAt === 0) return false;

  let mtime;
  try {
    mtime = statSync(path).mtimeMs;
  } catch {
    // Gone, or unreadable — let the tool report that itself.
    return false;
  }
  if (mtime > priorAt - CHANGED_GRACE_MS) return false;

  // One refusal per file. If the agent comes back to it, it has a reason this gate cannot
  // see, and a second refusal would be an argument rather than a correction.
  if (alreadyDenied(session, 'reread', path)) return false;

  deny(
    `This session already read ${path} in full, and the file has not changed since ` +
      `(last modified ${new Date(mtime).toISOString()}, read at ${new Date(priorAt).toISOString()}).\n` +
      `Its contents are already in your context — reading it again pays for the same bytes twice.\n\n` +
      `If you need a different symbol from it, locate every symbol you want in one pass:\n` +
      `  rg -n 'firstSymbol|secondSymbol' ${path}\n` +
      `then read only the range you still need, with numeric offset/limit:\n` +
      `  Read({file_path: "${path}", offset: <line>, limit: <count>})\n\n` +
      `A whole-file re-read is legitimate only after the file actually changes; this one has not.`,
  );
  return true;
}

/**
 * Refuse the 4th consecutive turn of nothing but read-only calls. Counted in turns rather
 * than calls so the gate rewards the fix: six `Read`s sent as parallel calls in one turn
 * are one turn, while six sent one per turn are six. Any non-read-only call breaks the
 * run, as does a user prompt.
 * @param {string} name @param {Record<string, any>} input
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line @param {string} session
 */
function serialDiscovery(name, input, line, session) {
  let run = 0;
  let i = line.length - 1;

  // The current call's own turn may already be written, or may not be — PreToolUse fires
  // while the message is still being emitted. Count it exactly once either way.
  const last = line[i];
  if (last && issued(last, name, input)) {
    run = 1;
    i -= 1;
  } else {
    run = 1;
  }

  for (; i >= 0; i--) {
    const turn = line[i];
    // A user prompt is a fresh instruction; discovery for it starts over here.
    if (turn === null) break;
    if (turn.toolUses.length === 0) break;
    if (!turn.toolUses.every((u) => isReadOnly(u.name, u.input))) break;
    run += 1;
  }

  if (run <= MAX_SERIAL_TURNS) return;
  // One refusal per discovery run: after this the agent proceeds, batched or not, and the
  // gate re-arms as soon as a non-read-only call ends the run.
  if (alreadyDenied(session, 'serial', 'run')) return;

  deny(
    `This is read-only call #${run} in a row, each in its own turn, with no action between them.\n` +
      `Discovery that takes four turns was not enumerated before it started.\n\n` +
      `Name every path, pattern, and probe the rest of this phase needs, then send them as ` +
      `parallel tool calls in a single turn — one block of Read/Grep/Glob calls, and one ` +
      `\`git diff <base>...HEAD -- <path> <path> …\` for every path at once rather than one call per path.\n` +
      `Only a call whose arguments depend on another call's result has to wait for the next turn.\n\n` +
      `Re-send this call together with the others you already know you need.`,
  );
}
