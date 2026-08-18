#!/usr/bin/env node
// PreToolUse — the call shapes that fail, or pay twice, for a known reason.
// See docs/specs/workflow-gates.md.
//
//   serial discovery  — a 4th straight single-call turn of nothing but read-only calls
//   redundant read    — a whole-file Read of a file already read whole and unchanged since
//   dumped again      — a shell probe dumping a file already read whole and unchanged
//   repeated probe    — the same Bash probe re-issued with nothing since to change its answer
//   polling a watch   — a probe of a file a Monitor in this session is already watching
//   relative cd       — `cd <relative path>` that does not resolve from the current dir
//   hand-rolled cleanup — post-merge branch deletion as raw git, which the `cleanup` verb owns
//   unmatched glob    — an unquoted glob matching nothing, which zsh aborts the command on
//   foreground sleep  — a wait the harness refuses, taking the probe chained to it down too
//   heredoc write     — composing a file in the shell where the Write tool does it directly
//   prose on stdin    — a toolkit verb asked to read `-`, which is what invites the heredoc
//   guessed JSON      — a `node -e`/`python3 -c` one-liner against a JSON shape never read
//   diff again        — a per-path diff after `scope --diff` already returned that content
//   read-polling      — a *repeat* `Read` of an unchanged file a watch is already following
//   trailing anchor   — a bookkeeping call scheduled after the run's last real work
//
// A scratch write under `$CLAUDE_JOB_DIR` from a worktree is deliberately *not* here: see
// "The job directory is not a gate" in the spec. Neither is an `Edit`/`Write` of a path this
// session never read — `Edit` and `Write` enforce that precondition themselves; see "The
// read-before-edit gate could not be right".
//
// They share a hook because they decide from the same transcript; parsing it more than once
// would let the answers disagree.
import { existsSync, statSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import {
  dumpedFiles,
  foregroundSleep,
  handRolledCleanup,
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
  foreignTranscript,
  issued,
  lastFullReadOf,
  lastReadOf,
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

guard(() => {
  const event = readEvent();
  if (!event) return;
  const name = event.toolName;
  const input = event.input;
  const session = event.sessionId;

  const readOnly = isReadOnly(name, input);
  // Every gate except the Bash shape checks decides from this session's history, and a
  // subagent's call arrives carrying the parent's transcript. Someone else's turns are not
  // evidence about this run, so those gates stay silent.
  const foreign = foreignTranscript(event.transcriptPath);

  if (name === 'Bash') {
    // Cheapest gates first, and the only ones that need no transcript: a command whose own
    // shape makes it fail is going to fail whatever the session did before it.
    if (deniedByCommandAlone(event, session)) return;
    if (foreign) return;
    // These need the transcript but not read-only status: a dumper like `sed` is not
    // classified read-only, and dumping a file already in context is the shape regardless.
    const line = timeline(entries(event.transcriptPath));
    if (staleProbe(event, line, session, readOnly)) return;
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
    if (name === 'TodoWrite' && !foreign) trailingAnchor(event, session);
    return;
  }

  if (foreign) return;
  const line = timeline(entries(event.transcriptPath));
  if (name === 'Read' && readPolling(event, line, session)) return;
  if (name === 'Read' && redundantRead(event, line, session)) return;
  serialDiscovery(name, input, line, session);
});

/**
 * Refuse a **repeat** `Read` of a file a `Monitor` or a backgrounded Bash command in this session
 * is already following, when the file has not changed since that earlier read. A watch delivers
 * its events itself, so the second and third read of the same unchanged bytes are the polling.
 *
 * The *first* read is deliberately allowed, which makes the read itself the cheap way to ask
 * whether the watch is still live — it returns the log's current bytes, and only asking a second
 * time for those same bytes is refused. Reads two through twenty, the recorded harm, still are.
 *
 * Only the watch's own output target counts — the file it redirects to, `tee`s to, or tails —
 * compared as a whole resolved path. A read of the script a watch runs, or of the config it was
 * handed, is discovery rather than polling however many times it happens.
 * @param {import('./lib/io.mjs').HookEvent} event
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line @param {string} session
 * @returns {boolean} true when the call was denied
 */
function readPolling(event, line, session) {
  const path = event.filePath;
  if (path === undefined) return false;
  const cwd = event.cwd;

  const all = turns(line);
  const current = all[all.length - 1];
  const currentUuid = current && issued(current, 'Read', event.input) ? current.uuid : undefined;
  const target = isAbsolute(path) ? path : resolve(cwd, path);
  const watched = watchedOutputs(line, currentUuid).find(
    (file) => (isAbsolute(file) ? file : resolve(cwd, file)) === target,
  );
  if (!watched) return false;

  // Never seen by this session: this is the look, not the poll. Any read counts, a slice as
  // much as a whole file, since either one returned the log's bytes at that moment.
  const priorAt = lastReadOf(line, path, currentUuid);
  if (priorAt === 0) return false;
  let mtime;
  try {
    mtime = statSync(target).mtimeMs;
  } catch {
    // Not there yet, or unreadable — let the tool say so rather than guessing on its behalf.
    return false;
  }
  // Written to since that read, so this one returns bytes the session does not have.
  if (mtime > priorAt - CHANGED_GRACE_MS) return false;
  if (alreadyDenied(session, 'watched', watched)) return false;

  deny(
    `This session already read ${watched} at ${new Date(priorAt).toISOString()} and the file has ` +
      `not been written to since (last modified ${new Date(mtime).toISOString()}), so this ` +
      `\`Read\` returns the same bytes again.\n\n${liveness(watched)} — so there is nothing to ` +
      `reason about here and no need to check whether waiting will end: the watch is live, it ` +
      `delivers its own events, and a stalled condition polled by hand is polled forever.\n\n` +
      `${verifyWaitOffer(watched)}\n\n` +
      `For anything else, arm one bounded wait that ends on its own:\n` +
      `  Bash({run_in_background: true, command: "until grep -qE '<done>|<failure>' ${path}; do sleep 1; done"})\n` +
      `widening the pattern to the failure signatures too, so a crash is not silence. Then read ` +
      `the file once, after that wait reports.`,
  );
  return true;
}

/**
 * Refuse post-merge branch cleanup composed as raw git. `my-command-tools cleanup` settles both
 * halves from the PR rather than from git's error — it asks `git ls-remote` before pushing a
 * delete and reports `already-absent` as an outcome, and it deletes a squash-merged branch on
 * the PR's evidence. The one refusal it keeps is the one that means something: a branch with no
 * merged PR, whose commits exist nowhere else. So this redirects rather than weakens.
 * @param {string} command @param {string} session
 * @returns {boolean} true when the call was denied
 */
function handRolledBranchCleanup(command, session) {
  const found = handRolledCleanup(command);
  if (!found) return false;
  if (alreadyDenied(session, 'cleanup', found.branch)) return false;

  const failure =
    found.half === 'remote'
      ? `\`git push ${found.remote} --delete ${found.branch}\` exits 1 with "remote ref does not ` +
        `exist" whenever GitHub's auto-delete-branch setting already took the ref at merge time`
      : `\`git branch -d ${found.branch}\` refuses a squash-merged branch as "not fully merged", ` +
        `because the squash commit shares no history with the branch's own commits — the work ` +
        `landed, and git cannot see that it did`;

  deny(
    `${failure}. Both halves of post-merge cleanup fail that way predictably, and one recorded ` +
      `session hit them in sequence.\n\n` +
      `One call settles both, from the PR rather than from git's answer:\n` +
      `  my-command-tools cleanup --branch ${found.branch}\n\n` +
      `Read \`local.reason\` and \`remote.reason\` from its JSON and move on: a ref auto-delete ` +
      `already removed reports \`already-absent\`, which is a success, and a squash-merged branch ` +
      `reports \`squash-merged\` with the PR number. \`--keep-local\` / \`--keep-remote\` skip a ` +
      `half deliberately, and \`--remote <name>\` names a remote other than origin.\n\n` +
      `\`local.reason: "not-merged"\` is the one answer that still refuses, and it means the ` +
      `branch's commits exist nowhere else — escalating to \`git branch -D\` by hand there would ` +
      `discard them.`,
  );
  return true;
}

/**
 * The replacement a watched-condition denial hands back, ready to send.
 *
 * Refusing the poll without naming the wait is what let this regress: recorded sessions took
 * the refusal, had nothing else to do, and polled again — one read the same report twenty
 * times, another fifteen, and two died still waiting. So the denial names a call that blocks,
 * and says why the reads it is refusing could never have returned anything: a detached verify
 * writes its report atomically at exit, after the gates are done. There is no partial state to
 * catch, which is the fact that makes polling futile rather than merely wasteful.
 * @param {string} watched
 * @returns {string}
 */
function verifyWaitOffer(watched) {
  const verdict = watched.endsWith('.verdict') ? watched : '';
  return (
    `You are waiting, not discovering, so ask for the wait rather than for the file. If this is ` +
    `the repo's verification, there is now one call that *is* the wait:\n` +
    `  my-command-tools verify --wait${verdict ? ` ${verdict}` : ''}\n` +
    `Send it as a plain foreground \`Bash\` call with \`timeout: 600000\`. It blocks until the ` +
    `detached run exits, then prints that run's whole report and exits on its verdict — one ` +
    `call, no watch to arm, no file to read afterwards. \`my-command-tools verify --background\` ` +
    `returns this exact command under \`wait.blocking\` if you need the path.\n\n` +
    `And there is provably nothing to see before then: the detached run writes its JSON report ` +
    `**atomically at exit**, before it writes the verdict file. Until the run is over that ` +
    `report does not exist, so every early read returns the same nothing. Polling cannot ` +
    `surface progress here — it can only spend turns.`
  );
}

/**
 * How a refusal names the watch it is refusing against. Only a **live** watch reaches either
 * of these gates — `watchedPaths`/`watchedOutputs` drop one whose completion notice has already
 * arrived — so the state is stated outright rather than left for the caller to guess at. Not
 * saying it is what the recorded sessions did next: three duplicate-watch refusals in one run,
 * then a fall back to reading the file by hand, because nothing said whether waiting would
 * ever end.
 * @param {string} watched
 * @returns {string}
 */
function liveness(watched) {
  return (
    `A watch armed earlier in this session is following ${watched} and is **still running** — ` +
    `no completion notice for it has arrived, so its events are still coming`
  );
}

/**
 * Refuse a `TodoWrite` whose only remaining effect is to mark the closing-turn anchor done.
 * The Stop gate below already refuses a run that ends on a tool call — but it fires *after*
 * the run has already ended that way, and the recorded shape is always the same: a complete
 * report was composed, and this bookkeeping call was attached to it, so the harness recorded
 * a decision mid-run instead of an outcome. The scheduling is the thing to remove, so it is
 * refused here, before the turn exists.
 * @param {import('./lib/io.mjs').HookEvent} event @param {string} session
 */
function trailingAnchor(event, session) {
  const todos = event.input.todos;
  if (!Array.isArray(todos) || todos.length === 0) return;

  const anchors = todos.filter((t) => /close the run|text-only turn/i.test(String(t?.content ?? t?.subject ?? '')));
  if (anchors.length === 0) return;
  // Only when the anchor is the single thing this call completes: every other item is
  // already done, and the anchor is what this write flips.
  if (!anchors.every((t) => t?.status === 'completed')) return;
  if (!todos.every((t) => t?.status === 'completed')) return;

  const line = timeline(entries(event.transcriptPath));
  const all = turns(line);
  const current = all[all.length - 1];
  // A bookkeeping call riding along with real work is the prescribed form; only a call that
  // is the turn's whole content is the shape that ends a run.
  if (current && issued(current, 'TodoWrite', event.input) && current.toolUses.length > 1) return;
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
 * @param {import('./lib/io.mjs').HookEvent} event @param {string} session
 * @returns {boolean} true when the call was denied
 */
function deniedByCommandAlone(event, session) {
  const command = event.command;
  // A `Bash` call that named no command line has no shape to refuse.
  if (command === undefined) return false;
  const cwd = event.cwd;

  if (relativeCd(event)) return true;
  if (handRolledBranchCleanup(command, session)) return true;

  const glob = unmatchedGlob(command, cwd);
  if (glob && !alreadyDenied(session, 'glob', glob)) {
    deny(
      `\`${glob}\` is an unquoted pattern that matches nothing from ${cwd}. This shell is zsh, ` +
        `where that aborts the whole command with "no matches found" — nothing in it runs, ` +
        `including the parts that would have worked.\n\n` +
        `This exact command, with that pattern quoted so the program expands it:\n` +
        `  ${quotedGlob(command, glob)}\n\n` +
        `Quote any pattern the invoked program should expand rather than the shell:\n` +
        `  • \`rg -g '*.ts'\` and \`rg --files -g '*.ts'\` instead of \`grep --include=*.ts\`\n` +
        `  • \`find . -name '*.ts'\`, with the pattern quoted\n\n` +
        `If the shell genuinely should expand it, the files it would match do not exist here — ` +
        `check the path first.`,
    );
    return true;
  }

  const sleeping = foregroundSleep(command, event.background);
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
 * The read-only Bash gates: a probe whose answer this session already has. All three decide
 * from evidence about *this* command and *this* path, never from how many calls a turn
 * carried — a legitimate parallel batch is unaffected by every one of them.
 * @param {import('./lib/io.mjs').HookEvent} event
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line @param {string} session
 * @param {boolean} readOnly
 * @returns {boolean} true when the call was denied
 */
function staleProbe(event, line, session, readOnly) {
  const command = event.command;
  if (command === undefined) return false;
  const cwd = event.cwd;
  const all = turns(line);
  const current = all[all.length - 1];
  const currentUuid = current && issued(current, 'Bash', event.input) ? current.uuid : undefined;

  // A watch already armed in this session delivers its events on its own.
  const watched = watchedPaths(line, currentUuid).find((file) => command.includes(file));
  if (watched && !alreadyDenied(session, 'watched', watched)) {
    deny(
      `${liveness(watched)}. Polling the same file by hand repeats work that is already ` +
        `happening, and a stalled condition polls forever.\n\n${verifyWaitOffer(watched)}\n\n` +
        `Otherwise let this watch's notification arrive; if its filter is not catching what you ` +
        `need, widen that filter to the failure signatures rather than checking by hand beside it.`,
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
 * @param {import('./lib/io.mjs').HookEvent} event
 * @returns {boolean} true when the call was denied
 */
function relativeCd(event) {
  const command = event.command;
  if (command === undefined) return false;
  const from = event.cwd;

  // `cd` at the start of the command or of any segment. A `cd` deeper inside a quoted
  // string or a substitution is not matched, which is the safe direction.
  for (const m of command.matchAll(/(?:^|[;&|(]\s*|&&\s*|\|\|\s*)cd\s+("[^"]+"|'[^']+'|[^\s;&|)]+)/g)) {
    const target = m[1].replace(/^['"]|['"]$/g, '');
    // Absolute paths, home-relative paths, `cd -`, and anything the shell expands are all
    // out of scope: only a plain relative path can be checked here and be certain.
    if (!target || target === '-' || isAbsolute(target) || target.startsWith('~')) continue;
    if (/[$`*?]/.test(target)) continue;
    if (existsSync(resolve(from, target))) continue;

    const found = nearbyPath(from, target);

    deny(
      `\`cd ${target}\` does not resolve from ${from}, so this command would fail with ` +
        `"no such file or directory" before doing anything.\n\n` +
        (found
          ? `That path does exist here:\n  ${found}\nUse it directly, without changing ` +
            `directory:\n` +
            `  • \`my-command-tools <verb> --cwd ${found}\`\n` +
            `  • \`git -C ${found} …\`\n` +
            `  • every other command takes it as an argument\n`
          : `Spell the path absolutely instead of changing directory:\n` +
            `  • the toolkit takes the checkout as a flag — \`my-command-tools <verb> --cwd <absolute path>\`\n` +
            `  • git takes it as \`git -C <absolute path> …\`\n` +
            `  • everything else takes the absolute path as its argument\n`) +
        `\nIf a directory genuinely must be entered, enter it by absolute path.`,
    );
    return true;
  }
  return false;
}

/**
 * The same command with the offending glob quoted — the form that runs, ready to send.
 * `--include=*.ts` keeps its flag and quotes only the pattern.
 * @param {string} command @param {string} glob
 * @returns {string}
 */
function quotedGlob(command, glob) {
  const eq = glob.indexOf('=');
  const quoted = eq === -1 ? `'${glob}'` : `${glob.slice(0, eq + 1)}'${glob.slice(eq + 1)}'`;
  return command.split(glob).join(quoted);
}

/**
 * The absolute path a failed relative `cd` was reaching for, found by walking up from the
 * directory it was issued in, or null. Nearest ancestor wins; the walk stops at the root.
 * @param {string} from @param {string} target
 * @returns {string | null}
 */
function nearbyPath(from, target) {
  let dir = from;
  for (let depth = 0; depth < 12; depth++) {
    const candidate = resolve(dir, target);
    if (existsSync(candidate)) return candidate;
    const up = resolve(dir, '..');
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/**
 * Refuse a whole-file `Read` of a file this session already read whole and that has not
 * changed since. Three conditions, all required: this read asks for the whole file, an
 * earlier read in this session also did, and the mtime predates that read. A file touched
 * since — by an `Edit`, a formatter, a generator, another agent — passes.
 * @param {import('./lib/io.mjs').HookEvent} event
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line @param {string} session
 * @returns {boolean} true when the call was denied
 */
function redundantRead(event, line, session) {
  const path = event.filePath;
  if (path === undefined) return false;
  const input = event.input;
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
 * Refuse the 4th consecutive **single-call** turn of nothing but read-only calls. Counted in
 * turns rather than calls, and only single-call turns count: a turn that batched several
 * probes is the prescribed form, so it ends the run rather than extending it. What remains is
 * one probe per turn, repeated. Any non-read-only call breaks the run, as does a user prompt.
 *
 * The gate speaks **once per run**, and that has to hold structurally rather than through
 * scratch state. A recorded session took the refusal, collapsed twelve probes into one turn —
 * exactly what was asked — and was refused again on the first call of that batch, because
 * `PreToolUse` fires before the message carrying the other eleven is written, so the batch is
 * invisible and the turn counts as single-call. Refusing the correction teaches that batching
 * does not help, which is worse than not gating at all. `alreadyDenied` was meant to prevent
 * it and cannot be relied on alone: its scratch file is best-effort, and the calls of one batch
 * race each other through it. The transcript cannot be lost or raced, so a failed read-only
 * call anywhere in the current run is read as "this run already took its correction" and the
 * gate stays silent. A probe that failed for some other reason suppresses it too — fail open is
 * the standing rule, and a run that is already erroring needs a second refusal least of all.
 * @param {string} name @param {Record<string, any>} input
 * @param {(import('./lib/transcript.mjs').Turn | null)[]} line @param {string} session
 */
function serialDiscovery(name, input, line, session) {
  let i = line.length - 1;

  // The current call's own turn may already be written, or may not be — PreToolUse fires while
  // the message is still being emitted. Count it exactly once either way; a batch alongside it
  // means this turn is already the batched form.
  const last = line[i];
  if (last && issued(last, name, input)) {
    if (last.toolUses.length > 1) return;
    i -= 1;
  }
  let run = 1;

  for (; i >= 0; i--) {
    const turn = line[i];
    // A user prompt is a fresh instruction; discovery for it starts over here.
    if (turn === null) break;
    if (turn.toolUses.length === 0) break;
    // A batched turn is the answer this gate asks for, so it ends the run instead of
    // lengthening it.
    if (turn.toolUses.length > 1) break;
    if (!turn.toolUses.every((u) => isReadOnly(u.name, u.input))) break;
    // A refused probe earlier in this same run is this gate having already spoken.
    if (turn.toolUses.some((u) => u.ok === false)) return;
    run += 1;
  }

  if (run <= MAX_SERIAL_TURNS) return;
  // One refusal per discovery run: after this the agent proceeds, batched or not, and the
  // gate re-arms as soon as a non-read-only call ends the run.
  if (alreadyDenied(session, 'serial', 'run')) return;

  deny(
    `This is read-only turn #${run} in a row, each carrying a single call, with no action ` +
      `between them.\n` +
      `Discovery that takes four turns was not enumerated before it started.\n\n` +
      `Name every path, pattern, and probe the rest of this phase needs, then send them as ` +
      `parallel tool calls in a single turn — one block of Read/Grep/Glob calls, and one ` +
      `\`git diff <base>...HEAD -- <path> <path> …\` for every path at once rather than one call per path.\n` +
      `Only a call whose arguments depend on another call's result has to wait for the next turn.\n\n` +
      `Re-send this call together with the others you already know you need.`,
  );
}
