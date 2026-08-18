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
//   closing turn as a task — a `TaskCreate` scheduling the run's own final message
//   grep --include    — a bare glob handed to grep, where `rg -g` takes it quoted
//   shell-composed file — `cat`/`printf` redirected into a file the Write tool writes
//   worktree program  — a loop or function body sent from inside an isolated worktree
//   entering at a root — the one cwd where `EnterWorktree` is refused outright
//   unreadable whole file — a `Read` whose file cannot fit the tool's own token cap
//   grep over a bundle — a sweep of an OKF bundle `okq` queries directly
//
// A scratch write under `$CLAUDE_JOB_DIR` from a worktree is deliberately *not* here: see
// "The job directory is not a gate" in the spec. Neither is an `Edit`/`Write` of a path this
// session never read — `Edit` and `Write` enforce that precondition themselves; see "The
// read-before-edit gate could not be right".
//
// They share a hook because they decide from the same transcript; parsing it more than once
// would let the answers disagree.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';
import {
  dumpedFiles,
  foregroundSleep,
  grepIncludeGlob,
  handRolledCleanup,
  inlineScriptJson,
  perPathDiff,
  ranToolkit,
  shellComposedWrite,
  shellProgram,
  stdinProseFlag,
  unmatchedGlob,
  withoutStraySeparator,
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

/** How many lines of a candidate `index.md` are read looking for the OKF marker. */
const FRONTMATTER_LINES = 12;

/** How a run's own closing message reads once it has been written down as something to do. */
const CLOSING_TURN = /close the run|text-only turn|text only turn|zero tool calls|final report as a message/i;

/**
 * Bytes above which a whole-file `Read` cannot come back. The tool's cap is 25,000 **tokens**,
 * which a hook cannot measure without a tokenizer — so this is a bound rather than a certainty,
 * set where the bound is safe: a file this size fits the cap only by averaging more than 3.6 bytes
 * per token, which nothing but plain ASCII prose reaches, and a read that close to the ceiling is
 * one edit away from failing anyway. Every recorded refusal was well past it.
 */
const UNREADABLE_BYTES = 90_000;

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
    // Both of these read the call's own input and the filesystem, so neither needs the
    // transcript and neither is stood down by a foreign one.
    if (name === 'EnterWorktree') {
      enteringFromRepoRoot(event, session);
      return;
    }
    if (name === 'TaskCreate') {
      closingTurnAsTask(event, session);
      return;
    }
    if (name === 'TodoWrite' && !foreign) trailingAnchor(event, session);
    return;
  }

  // Decided from the file's own size, so it holds inside a subagent exactly as outside one.
  if (name === 'Read' && unreadableWholeFile(event, session)) return;
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
 * of these gates — `watchedOutputs` drops one whose completion notice has already
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
  if (command === undefined) return false;
  const cwd = event.cwd;

  if (relativeCd(event, session)) return true;
  if (handRolledBranchCleanup(command, session)) return true;
  if (programInsideWorktree(event, session)) return true;
  if (sweepingAnOkfBundle(event, session)) return true;

  if (bareGrepInclude(command, session)) return true;

  const glob = unmatchedGlob(command, cwd);
  if (glob && !alreadyDenied(session, 'glob', glob)) {
    const { pattern, stray } = withoutStraySeparator(glob);
    deny(
      `\`${glob}\` is an unquoted pattern that matches nothing from ${cwd}. This shell is zsh, ` +
        `where that aborts the whole command with "no matches found" — nothing in it runs, ` +
        `including the parts that would have worked.\n\n` +
        (stray
          ? `The pattern also carries a \`${stray}\` that was never part of it. Quoting it as ` +
            `written would stop the shell complaining and leave the program matching nothing, ` +
            `which is the worse failure — it looks like an answer.\n\n`
          : '') +
        `This exact command, with that pattern ${stray ? 'repaired and ' : ''}quoted so the ` +
        `program expands it:\n` +
        `  ${quotedGlob(command, glob, pattern)}\n\n` +
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

  const composed = shellComposedWrite(command);
  // Keyed to the **target**, not to the gate. One global key meant the second composition in a
  // session went through unrefused and failed in the shell instead — and the recorded sessions
  // compose several, each a different file.
  if (composed && !alreadyDenied(session, 'compose', composed.target || 'heredoc')) {
    deny(
      `This command composes ${composed.target ? `\`${composed.target}\`` : 'a file'} in the ` +
        `shell${composed.how === 'heredoc' ? ', from a heredoc' : ''}. That shape is refused ` +
        `wholesale inside an isolated worktree, and re-sending it is refused for the same reason.\n\n` +
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

  // A watch already armed in this session delivers its events on its own. Judged against the
  // watch's **own output target** rather than every filename-shaped token on its command line:
  // the broad reading refused a first probe of `server.ts` and of `artifactDownload.ts` because
  // a `Monitor` command happened to name them, which is discovery rather than polling.
  const watched = watchedOutputs(line, currentUuid).find((file) => command.includes(basename(file)));
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
 * @param {import('./lib/io.mjs').HookEvent} event @param {string} session
 * @returns {boolean} true when the call was denied
 */
function relativeCd(event, session) {
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

    // The cwd is *already* that directory: the `cd` is a no-op the shell nonetheless aborts on,
    // and handing back an absolute path to change into answers a question nobody asked.
    // Recorded three times in a row in one session, and in five others besides.
    if (basename(from) === target.replace(/\/+$/, '')) {
      if (alreadyDenied(session, 'cdnoop', from)) return true;
      deny(
        `\`cd ${target}\` fails from ${from} — but only because you are already there. ` +
          `\`${target}\` is this directory's own name, not a directory inside it, so the \`cd\` is a ` +
          `no-op that zsh still aborts the whole command on.\n\n` +
          `Send the rest of this command with the \`cd\` removed:\n` +
          `  ${withoutLeadingCd(command)}\n\n` +
          `Every call already runs in ${from}. Re-deriving the cwd from a path fragment is what ` +
          `produced this: read it off the last \`my-command-tools state\` or \`worktree begin\` ` +
          `result, or pass it — \`--cwd ${from}\`, \`git -C ${from}\`.`,
      );
      return true;
    }

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
 * `--include=*.ts` keeps its flag and quotes only the pattern. `repaired` is that pattern with
 * any stray separator removed, so the form handed back is one that also matches.
 * @param {string} command @param {string} glob @param {string} [repaired]
 * @returns {string}
 */
function quotedGlob(command, glob, repaired = glob) {
  const eq = repaired.indexOf('=');
  const quoted = eq === -1 ? `'${repaired}'` : `${repaired.slice(0, eq + 1)}'${repaired.slice(eq + 1)}'`;
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
 * The command with a leading `cd` removed, ready to send. Only the leading one, and only when
 * what remains is a command in its own right — anything more would be guesswork about intent.
 * @param {string} command
 * @returns {string}
 */
function withoutLeadingCd(command) {
  const stripped = command.replace(/^\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|)]+)\s*(?:&&|;)?\s*/, '');
  return stripped.trim() || command;
}

/**
 * Refuse `grep --include=<glob>` however it is quoted, and name the `rg -g` form.
 *
 * The unquoted-glob gate below already catches this when the pattern happens to match nothing,
 * and that turned out to be the wrong question to ask. `--include=*.ts` recurred across at least
 * ten recorded sessions, and **four** of the patterns carried a stray trailing `;` — so quoting
 * them as written, which is what that gate hands back, would have turned an abort into a silent
 * zero matches. `rg -g '<glob>'` has no quoting decision to get wrong: the glob is the program's
 * own argument by construction, and `rg` reports a pattern it cannot use rather than matching
 * nothing with it.
 * @param {string} command @param {string} session
 * @returns {boolean} true when the call was denied
 */
function bareGrepInclude(command, session) {
  const found = grepIncludeGlob(command);
  if (!found) return false;
  if (alreadyDenied(session, 'include', found.glob)) return false;
  const { pattern, stray } = withoutStraySeparator(found.glob);

  deny(
    `\`${found.bin} ${found.flag}=${found.glob}\` hands a glob to the shell on its way to grep. ` +
      `Unquoted, zsh either expands it against the current directory or aborts the whole command ` +
      `with "no matches found"; quoted, grep applies it only to names in the directory it is ` +
      `walking. Neither is the file filter that was meant.\n\n` +
      (stray
        ? `This pattern also ends in \`${stray}\`, which was never part of it — so even the quoted ` +
          `form would match nothing at all, and say so by returning no results rather than an ` +
          `error.\n\n`
        : '') +
      `\`rg\` takes the glob as its own argument:\n` +
      `  rg -g '${pattern}' '<pattern>' <path>\n` +
      `  rg --files -g '${pattern}'          # to list the matching files instead\n\n` +
      `\`-g '!<glob>'\` is the exclude form, and \`rg\` honours .gitignore, so a sweep needs no ` +
      `\`--exclude-dir\` either.`,
  );
  return true;
}

/**
 * Refuse a command that is a shell *program* when it is sent from inside an isolated worktree,
 * where Claude Code's own gate answers it with "this command is too complex to verify that it
 * stays inside the worktree; break it into plain, separate commands".
 *
 * That refusal is not ours and cannot be narrowed from here — see the spec. What can be done from
 * here is to stop it costing a turn to *learn*: it names no working form, it is not
 * once-per-subject, and one recorded worktree collected **nine** of them across four sessions
 * while another run took five inside its first fifteen calls before adapting. This fires first, on
 * the same shape, and hands back the decomposition. Scoped to a worktree cwd because that is the
 * only place the harness refuses: the identical loop outside one runs, and is left alone.
 * @param {import('./lib/io.mjs').HookEvent} event @param {string} session
 * @returns {boolean} true when the call was denied
 */
function programInsideWorktree(event, session) {
  const command = event.command;
  if (command === undefined) return false;
  if (!event.cwd.includes(`${sep}.claude${sep}worktrees${sep}`)) return false;
  const found = shellProgram(command);
  if (!found) return false;
  if (alreadyDenied(session, 'program', found.kind)) return false;

  deny(
    `This command is a shell program rather than a call: the \`${found.keyword}\` ${found.kind} ` +
      `means its later words are computed by its own earlier ones. This call runs inside an ` +
      `isolated worktree (${event.cwd}), and Claude Code's own worktree gate refuses what it ` +
      `cannot statically resolve there — "too complex to verify that it stays inside the ` +
      `worktree". That refusal names no alternative and does not stop repeating, so it is ` +
      `answered here instead.\n\n` +
      `Send the same work as plain, separate calls with every path written out:\n` +
      `  • one \`Bash\` call per iteration, the paths literal rather than computed\n` +
      `  • \`Read\`/\`Write\`/\`Edit\` for anything that reads or writes a file — no shell to judge\n` +
      `  • a batch of parallel calls in one turn where the iterations are independent\n\n` +
      `A loop that genuinely must run belongs in a script written with \`Write\` and then executed ` +
      `by path, which is one resolvable command. An \`&&\` chain, an \`if\`, a bare \`$(( ))\` and an ` +
      `assignment the next command reads all run here; a \`for\`/\`while\` body and a function ` +
      `definition do not.`,
  );
  return true;
}

/**
 * The OKF bundle a `grep`/`find` sweep in this command is walking, or null. A bundle declares
 * itself in its own `index.md` frontmatter (`okf_version:`), so this is read off the filesystem
 * rather than guessed from a directory being called `docs`.
 * @param {string} command @param {string} cwd
 * @returns {string | null}
 */
function sweptBundle(command, cwd) {
  const bin = command.trim().split(/\s+/)[0]?.split('/').pop() ?? '';
  if (bin !== 'grep' && bin !== 'egrep' && bin !== 'rgrep' && bin !== 'find') return null;
  for (const word of command.split(/[\s'"`|;&()]+/)) {
    if (!word || word.startsWith('-') || /[$*?]/.test(word)) continue;
    const dir = isAbsolute(word) ? word : resolve(cwd, word);
    try {
      if (!statSync(dir).isDirectory()) continue;
      const head = readFileSync(join(dir, 'index.md'), 'utf8').split('\n').slice(0, FRONTMATTER_LINES);
      if (head.some((l) => l.startsWith('okf_version:'))) return dir;
    } catch {
      // Not a directory, or no `index.md` declaring one: nothing this gate can name.
    }
  }
  return null;
}

/**
 * Refuse a `grep`/`find` sweep of a directory that is an OKF bundle, and name `okq`.
 *
 * The recorded run issued three clusters of independent `find | xargs grep` sweeps over one
 * `docs/` tree — and its own system prompt said the bundle is queryable with `okq`. Prose saying
 * so exists in several places and `/docs` says "not `grep`" outright; the sweep happened anyway.
 * A bundle can be recognized from disk, so this does not have to be remembered.
 * @param {import('./lib/io.mjs').HookEvent} event @param {string} session
 * @returns {boolean} true when the call was denied
 */
function sweepingAnOkfBundle(event, session) {
  const command = event.command;
  if (command === undefined) return false;
  const bundle = sweptBundle(command, event.cwd);
  if (!bundle) return false;
  if (alreadyDenied(session, 'bundle', bundle)) return false;

  deny(
    `${bundle} is an OKF bundle — its \`index.md\` declares \`okf_version\` — and \`okq\` queries it ` +
      `directly. A text sweep re-derives from file bytes what the bundle already states in its ` +
      `frontmatter and links, and it answers one pattern at a time, so a survey becomes one round ` +
      `trip per question.\n\n` +
      `  okq --bundle ${bundle} search "<topic>"           # one call, ranked, across the bundle\n` +
      `  okq --bundle ${bundle} find --type adr            # or --where <key>=<value>\n` +
      `  okq --bundle ${bundle} get <id> --section <heading>\n` +
      `  okq --bundle ${bundle} neighbors <id> --depth 1   # and \`backlinks <id>\`\n\n` +
      `If independent questions remain after that, send them as parallel calls in one turn, or as ` +
      `one \`rg -n 'a|b|c'\` — not one sweep per question.`,
  );
  return true;
}

/**
 * Refuse `EnterWorktree` when the cwd is a repository root, which is the one place the harness
 * refuses it: "Cannot enter worktree: the current working directory is the repository root".
 *
 * A run dispatched with the `Agent` tool starts at a repository root by construction, so for
 * every delegated run this call is a certain refusal — and it was recorded as one of the run's
 * *first* actions in nine sessions across three buckets, each at node 9 or 10. The prose already
 * says entry is not needed and `worktree begin` already reports `workingRoot` for the purpose;
 * the prose is the part that did not hold. Only the creating form is refused: `path` enters a
 * worktree that already exists, which the tool supports from the launch directory.
 * @param {import('./lib/io.mjs').HookEvent} event @param {string} session
 * @returns {boolean} true when the call was denied
 */
function enteringFromRepoRoot(event, session) {
  const wanted = event.input.path;
  if (typeof wanted === 'string' && wanted !== '') return false;
  if (!existsSync(join(event.cwd, '.git'))) return false;
  if (alreadyDenied(session, 'enter', event.cwd)) return false;

  deny(
    `\`EnterWorktree\` is refused from a repository root, and ${event.cwd} is one — the harness ` +
      `answers "the current working directory is the repository root". A run dispatched with the ` +
      `\`Agent\` tool always starts at a root, so this call cannot succeed here.\n\n` +
      `Nothing needs it. \`my-command-tools worktree begin --branch <name> --bootstrap\` reports ` +
      `the workspace as \`path\`/\`workingRoot\`, and that path is this run's working root whether ` +
      `or not the session ever moves into it:\n` +
      `  • every \`Read\`/\`Edit\`/\`Write\` takes an absolute path under it\n` +
      `  • every toolkit verb takes \`--cwd <workingRoot>\`\n` +
      `  • git takes \`git -C <workingRoot> …\`\n\n` +
      `Tear it down with \`my-command-tools worktree end --branch <branch>\` — the verb that made ` +
      `it — rather than with \`ExitWorktree\`, which does not own it and will say so.`,
  );
  return true;
}

/**
 * Refuse a `TaskCreate` that schedules the run's own closing message as a task.
 *
 * One recorded run spent its last three actions on `TaskCreate` calls, one of them reading
 * "Deliver the final report as a message with text and zero tool calls" — and then sent nothing.
 * Scheduling that message *guarantees* it is lost: creating the task is itself a tool call, so the
 * run ends on the call that was meant to remind it to speak. The closing turn is not work to
 * track; it is what the run does instead of a tool call.
 *
 * The todo-list anchor `/task` prescribes is untouched. That is a `TodoWrite`, written at the
 * *start* of a run, and only completing it as a turn's sole content is refused — below.
 * @param {import('./lib/io.mjs').HookEvent} event @param {string} session
 * @returns {boolean} true when the call was denied
 */
function closingTurnAsTask(event, session) {
  if (!CLOSING_TURN.test(JSON.stringify(event.input))) return false;
  if (alreadyDenied(session, 'closingtask', 'create')) return false;

  deny(
    `This \`TaskCreate\` writes the run's own closing message down as a task. That cannot work: ` +
      `creating the task is a tool call, so if this is the last thing scheduled the run ends on it ` +
      `and records no outcome — the exact failure the item describes, arriving through the item.\n\n` +
      `Do not schedule it. If the work is finished, reply now with the report in text alone — one ` +
      `self-contained line saying where the run stands, then the detail. If real work remains, send ` +
      `that work: the closing message needs no tracking, because it is what the run does once ` +
      `there is nothing left to call.`,
  );
  return true;
}

/**
 * Refuse a whole-file `Read` of a file too large for the tool's own token cap, and name the slice.
 *
 * Six recorded refusals of "File content (N tokens) exceeds maximum allowed tokens (25000)" landed
 * on files of 25,923–37,456 tokens, and **four separate sessions rediscovered it one file at a
 * time** — every call was guaranteed to fail before it was sent, and its failure says nothing the
 * file's own size did not already say. A slice is never refused, so the corrected form always goes
 * through, and one refusal per path leaves a second attempt to the caller.
 * @param {import('./lib/io.mjs').HookEvent} event @param {string} session
 * @returns {boolean} true when the call was denied
 */
function unreadableWholeFile(event, session) {
  const path = event.filePath;
  if (path === undefined) return false;
  // A slice is the answer rather than the problem, and a PDF page range is capped in pages.
  if (event.input.offset !== undefined || event.input.limit !== undefined) return false;
  if (event.input.pages !== undefined) return false;

  let size;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return false;
    size = stat.size;
  } catch {
    // Missing or unreadable: let the tool report that itself.
    return false;
  }
  if (size <= UNREADABLE_BYTES) return false;
  if (alreadyDenied(session, 'toobig', path)) return false;

  deny(
    `${path} is ${Math.round(size / 1024)}KB, which does not fit the \`Read\` tool's cap of 25,000 ` +
      `tokens. This call comes back as "File content (N tokens) exceeds maximum allowed tokens ` +
      `(25000)" and returns none of the file.\n\n` +
      `Ask for the part you need, with numeric offset and limit:\n` +
      `  Read({file_path: "${path}", offset: 1, limit: 400})\n\n` +
      `Locate it first if you do not know where it is — one pass, not a read:\n` +
      `  rg -n '<symbol>|<symbol>' ${path}\n` +
      `  wc -l ${path}                      # to size the slices\n\n` +
      `For a file that has to be consumed whole, walk it in slices and carry each slice's summary ` +
      `forward rather than its bytes; for structured data, a \`jq\` query over the shape reads far ` +
      `less than the document does.`,
  );
  return true;
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
