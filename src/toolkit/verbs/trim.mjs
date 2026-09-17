// `trim` — the deterministic half of /trim's six-gate rubric, computed rather than argued.
//
// Four of the six gates are facts about this session: what the last settled turn's calls did,
// what has happened since the last compaction boundary, how often a probe repeated, and what
// is still running. `docs/adrs/0007-deterministic-trim-gates-stay-a-facts-verb.md` takes them
// out of the judgement layer for that reason — routing a boolean that cannot be wrong through
// a classifier that can only adds a round trip, a confidence band, and a failure mode.
//
// So: no key, no network call, no confidence band, and no fail-open path, because a
// computation that cannot be wrong has nothing to fail open from.
//
// The other two gates are not answered here and are not guessed at. C2 RECOVERABLE and N3
// VERIFIED come back `unknown`, and so do the two judgement clauses buried inside gates this
// verb otherwise answers — C1's "mid-tool sequence" and N1's "would hide useful negative
// evidence". A confident boolean for any of them would be the same mistake in the opposite
// direction.
//
// Every transcript reading below comes from `src/hooks/lib/`, which the workflow gates already
// use to refuse a call. The gates read the transcript to decide; this reads it to report. One
// detector, not two — a change to `timeline()` moves both.

import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { str } from '../lib/flags.mjs';
import { run as exec, lines } from '../lib/proc.mjs';
import { repoRoot } from '../lib/repo.mjs';
import { run as repoState } from './state.mjs';

export const usage = `trim [--transcript <path>] [--base <ref>]

Answer the deterministic half of /trim's six-gate rubric as JSON.

  --transcript <path>  Read this session transcript instead of the newest one
                       recorded for this directory.
  --base <ref>         Compare against <ref> instead of origin/<default-branch>,
                       for the repository half of C3.

Answers C1 (returned calls), C3, N1 (repeat arithmetic) and N2. Reports C2 and N3
as \`unknown\`, along with C1's "mid-tool sequence" clause and N1's "would hide
useful negative evidence" clause — those are judgements, and this verb makes none.
It prints no TRIM/CONTINUE verdict for the same reason: six gates decide that and
two of them are not answered here.

No API key, no network call, no fail-open path.`;

/** What a gate that this verb does not answer reports instead of a boolean. */
const UNKNOWN = 'unknown';

/**
 * The hook library, loaded on demand. It is imported rather than reimplemented, but it is
 * imported *lazily*: `my-command-tools` and the gates install as siblings (`<root>/toolkit`
 * and `<root>/hooks`), and two supported installs ship the toolkit without them — the Codex
 * installer links only the toolkit, and `install-personal.sh --no-hooks` skips the link. A
 * top-level import would throw while `cli.mjs` was still loading its verb table and take
 * every verb down with it, so the absence degrades this one verb to `unknown` instead.
 * @returns {Promise<Record<string, any> | null>}
 */
async function gateLib() {
  try {
    const [transcript, readOnly, parse] = await Promise.all([
      import('../../hooks/lib/transcript.mjs'),
      import('../../hooks/lib/read-only.mjs'),
      import('../../hooks/lib/parse.mjs'),
    ]);
    return { ...transcript, ...readOnly, ...parse };
  } catch {
    return null;
  }
}

/**
 * Where Claude Code records this directory's sessions. One transcript per session, named by
 * session id, under a directory named for the working directory with every non-alphanumeric
 * character replaced.
 * @param {string} dir
 * @returns {string}
 */
function projectDir(dir) {
  const claude = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  return join(claude, 'projects', dir.replace(/[^A-Za-z0-9]/g, '-'));
}

/**
 * The transcript to read: the one named outright, else the most recently written transcript
 * recorded for this directory. The fallback is a guess about *which session*, so it says so —
 * a caller that knows better passes `--transcript`.
 * @param {string} cwd @param {string} root @param {string | undefined} explicit
 * @returns {{path: string | null, resolvedBy: string}}
 */
function resolveTranscript(cwd, root, explicit) {
  if (explicit) return { path: explicit, resolvedBy: 'flag' };
  /** @type {{path: string, at: number} | null} */
  let newest = null;
  // A worktree, the checkout it was cut from, and the directory the call was made in all
  // record under different names, and the session is as likely to be under one as another:
  // a run working inside a worktree was usually started in the main checkout.
  const candidates = [cwd, root, mainCheckout(root)].filter((/** @type {string | null} */ d) => d !== null);
  for (const dir of new Set(candidates)) {
    const project = projectDir(dir);
    let names;
    try {
      names = readdirSync(project);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      const path = join(project, name);
      try {
        const at = statSync(path).mtimeMs;
        if (!newest || at > newest.at) newest = { path, at };
      } catch {
        // Removed between the listing and the stat; there is nothing to read either way.
      }
    }
  }
  return newest ? { path: newest.path, resolvedBy: 'newest for this directory' } : { path: null, resolvedBy: 'none' };
}

/**
 * The checkout a worktree was cut from, or null when this already is it. The common git
 * directory is the main checkout's `.git`, so its parent is the checkout itself.
 * @param {string} root @returns {string | null}
 */
function mainCheckout(root) {
  const r = exec('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root });
  if (!r.ok || !r.stdout) return null;
  const parent = dirname(r.stdout.trim());
  return parent === root ? null : parent;
}

/**
 * The last turn whose calls have actually come back.
 *
 * The final turn of a transcript read from inside that same turn is always in flight: the
 * assistant message carrying this very call is written before any of its results are, so
 * every call in it — this one and whatever was batched beside it — reads as unanswered. C1
 * asked of that turn would answer "no" on every run, about itself. So the in-flight tail is
 * dropped and the gate is asked of the last turn that settled, with the drop reported. This
 * is the same correction the gates make with `exceptTurnUuid`, which is not available to a
 * caller that is not a hook and does not know its own turn's uuid.
 * @param {any[]} line @returns {{turn: any | null, inFlight: number}}
 */
function lastSettled(line) {
  const all = line.filter((/** @type {any} */ t) => t !== null);
  let inFlight = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    const turn = all[i];
    const pending = turn.toolUses.length > 0 && turn.toolUses.every((/** @type {any} */ u) => !u.answered);
    if (pending) {
      inFlight += 1;
      continue;
    }
    return { turn, inFlight };
  }
  return { turn: null, inFlight };
}

/**
 * Whether a dispatched run has not reported back. Mirrors `dispatchOpen` in
 * `src/hooks/lib/transcript.mjs`, which is module-private: `Agent` backgrounds by default and
 * is open until its completion notice names it, a foreground dispatch until its result
 * arrives. The fields it reads — `answered`, `notified` — are `timeline()`'s own, so the two
 * cannot drift on how the transcript is read, only on this one predicate.
 * @param {any} use @returns {boolean}
 */
function agentOpen(use) {
  if (use.name !== 'Agent') return false;
  return use.input?.run_in_background !== false ? use.notified !== true : use.answered !== true;
}

/**
 * Whether a call armed a watch that has not reported finishing. Mirrors `liveWatch` in
 * `src/hooks/lib/transcript.mjs`, private for the same reason as above: a `Monitor` is live
 * throughout, since its notices are the events it was armed to deliver rather than an ending,
 * and a backgrounded Bash call is live until its completion notice arrives.
 * @param {any} use @returns {boolean}
 */
function watchLive(use) {
  if (use.name === 'Monitor') return true;
  if (use.name !== 'Bash' || use.input?.run_in_background !== true) return false;
  return use.notified !== true;
}

/** Text a compaction writes into the transcript where it replaced the history. */
const COMPACTED = /This session is being continued from a previous conversation/i;

/**
 * When this session was last compacted, as epoch ms, or 0 when it never was. C3 is measured
 * from there; an uncompacted session is measured from its beginning, which is what the rubric
 * asks for in its own words.
 * @param {Record<string, any>} lib @param {Record<string, any>[]} records @returns {number}
 */
function lastCompaction(lib, records) {
  let at = 0;
  for (const rec of records) {
    const summary = rec.isCompactSummary === true || rec.subtype === 'compact_boundary';
    const preamble = !summary && carriesText(lib, rec, COMPACTED);
    if (!summary && !preamble) continue;
    const stamp = Date.parse(lib.text(rec.timestamp));
    if (Number.isFinite(stamp) && stamp > at) at = stamp;
  }
  return at;
}

/**
 * Whether a raw transcript record carries text matching `pattern`. Raw rather than decoded:
 * a compaction summary is not an assistant turn or a user prompt, so `timeline()` drops it.
 *
 * Every field is taken through `parse.mjs`, the same boundary the gates decode the transcript
 * at: a field that was not the text it claimed to be arrives here as absent, and absent is an
 * answer — this record is not a boundary.
 * @param {Record<string, any>} lib @param {Record<string, any>} rec @param {RegExp} pattern
 * @returns {boolean}
 */
function carriesText(lib, rec, pattern) {
  const content = lib.asRecord(rec.message).content;
  const said = lib.asText(content);
  if (said !== undefined) return pattern.test(said);
  if (!Array.isArray(content)) return false;
  return content.some((raw) => {
    const block = lib.asRecord(raw);
    const text = lib.asText(block.text);
    return block.type === 'text' && text !== undefined && pattern.test(text);
  });
}

/**
 * The turns of the stretch this gate judges: everything after the last real user prompt,
 * since an earlier task's cycling says nothing about this one.
 * @param {any[]} line @returns {any[]}
 */
function sinceLastPrompt(line) {
  const at = line.lastIndexOf(null);
  return line.slice(at + 1);
}

/** @param {import('../cli.mjs').Ctx} ctx */
export async function run(ctx) {
  const cwd = repoRoot(ctx.cwd);
  const lib = await gateLib();
  const resolved = resolveTranscript(ctx.cwd, cwd, str(ctx.flags.transcript));

  // The repository halves stand on their own: they need git, not the transcript, so they
  // still answer on a device whose gates are not installed.
  const state = repoState({ ...ctx, cwd });
  const unmerged = lines(exec('git', ['diff', '--name-only', '--diff-filter=U'], { cwd }).stdout);

  const records = lib && resolved.path ? lib.entries(resolved.path) : [];
  const line = lib && records.length > 0 ? lib.timeline(records) : null;

  const transcript = {
    path: resolved.path,
    resolvedBy: resolved.resolvedBy,
    read: line !== null,
    // A subagent's calls arrive with the parent's transcript path while its own turns go
    // elsewhere, so a reading taken here can be about a different run entirely.
    foreign: lib && resolved.path ? lib.foreignTranscript(resolved.path) : null,
    reason: reasonFor(lib, resolved.path, line),
  };

  return {
    transcript: { ...transcript, ...measure(lib, line, records) },
    repo: {
      root: cwd,
      branch: state.branch,
      hasWork: state.hasWork,
      diffStat: state.diffStat,
      unmerged,
    },
    gates: {
      C1: c1(lib, line),
      C2: {
        answer: UNKNOWN,
        why: 'Whether a replacement summary would preserve the goal, the decisions and the exact next action is a judgement about meaning. No extractor reaches it.',
      },
      C3: c3(lib, line, records, state),
      N1: n1(lib, line),
      N2: n2(lib, line, unmerged),
      N3: {
        answer: UNKNOWN,
        why: 'Whether the verification that completed work actually needed has been done is a judgement about sufficiency. No extractor reaches it.',
      },
    },
    // Deliberately absent as a value rather than absent by omission: six gates decide TRIM
    // versus CONTINUE and two of them are not answered here, so this verb has no verdict to
    // print. Judgment stays with the agent.
    verdict: null,
  };
}

/**
 * Why the transcript half could not be read, or null when it was.
 * @param {Record<string, any> | null} lib @param {string | null} path @param {any[] | null} line
 * @returns {string | null}
 */
function reasonFor(lib, path, line) {
  if (!lib)
    return 'the workflow gate library is not installed beside this toolkit, so no transcript gate can be answered';
  if (!path) return 'no session transcript was found for this directory; pass --transcript <path>';
  if (!line) return 'the transcript held no readable records';
  return null;
}

/**
 * Counts a caller needs to read the gates honestly: how much history there was, and how much
 * of the tail was dropped as in flight. The three keys are always present, null when there was
 * no transcript to count — a caller reading a fixed shape never has to ask whether a field
 * was omitted or genuinely zero.
 * @param {Record<string, any> | null} lib @param {any[] | null} line
 * @param {Record<string, any>[]} records
 */
function measure(lib, line, records) {
  if (!lib || !line) return { turns: null, inFlightTurns: null, compactedAt: null };
  const compactedAt = lastCompaction(lib, records);
  return {
    turns: lib.turns(line).length,
    inFlightTurns: lastSettled(line).inFlight,
    compactedAt: compactedAt || null,
  };
}

/**
 * C1 CLOSED, returned-calls half: the last settled turn's calls all came back, none came back
 * an error, and nothing this session armed is still watching.
 * @param {Record<string, any> | null} lib @param {any[] | null} line
 */
function c1(lib, line) {
  const residual =
    'Whether the session is mid-tool-sequence — which every call returning cleanly is compatible with — is not answered here.';
  if (!lib || !line) return { answer: UNKNOWN, partial: true, residual, evidence: null };

  const { turn, inFlight } = lastSettled(line);
  if (!turn)
    return { answer: UNKNOWN, partial: true, residual, evidence: 'no settled turn in this transcript to judge' };

  const unreturned = turn.toolUses.filter((/** @type {any} */ u) => !u.answered).length;
  const errored = turn.toolUses.filter((/** @type {any} */ u) => u.ok === false).length;
  const watching = lib.turns(line).flatMap((/** @type {any} */ t) => t.toolUses.filter(watchLive)).length;

  const closed = unreturned === 0 && errored === 0 && watching === 0;
  return {
    answer: closed ? 'Y' : 'N',
    partial: true,
    residual,
    evidence: `last settled turn: ${turn.toolUses.length} call(s), ${unreturned} unreturned, ${errored} errored; ${watching} watch(es) still live; ${inFlight} in-flight turn(s) excluded`,
    unreturned,
    errored,
    liveWatches: watching,
  };
}

/**
 * C3 PROGRESS: turns since the last compaction boundary that carried a call which is not
 * read-only, plus what the working tree itself shows.
 * @param {Record<string, any> | null} lib @param {any[] | null} line
 * @param {Record<string, any>[]} records @param {{hasWork: boolean, diffStat: unknown[]}} state
 */
function c3(lib, line, records, state) {
  // The repository half answers with no transcript at all: work on disk is progress whether
  // or not this verb could read how it got there.
  if (!lib || !line) {
    return {
      answer: state.hasWork ? 'Y' : UNKNOWN,
      evidence: state.hasWork
        ? `no transcript read, but the working tree carries work across ${state.diffStat.length} file(s)`
        : 'no transcript read and the working tree is clean',
      actingTurns: null,
      since: null,
    };
  }

  const compactedAt = lastCompaction(lib, records);
  const all = lib.turns(line);
  const considered = compactedAt ? all.filter((/** @type {any} */ t) => t.at >= compactedAt) : all;
  const acting = considered.filter((/** @type {any} */ t) =>
    t.toolUses.some((/** @type {any} */ u) => !lib.isReadOnly(u.name, u.input)),
  ).length;

  return {
    answer: acting > 0 || state.hasWork ? 'Y' : 'N',
    evidence: `${acting} of ${considered.length} turn(s) since ${compactedAt ? 'the last compaction' : 'the start of the session'} carried a call that is not read-only; the working tree ${state.hasWork ? `carries work across ${state.diffStat.length} file(s)` : 'is clean'}`,
    actingTurns: acting,
    since: compactedAt ? 'compaction' : 'session start',
  };
}

/**
 * N1 STUCK, arithmetic half: identical probes re-issued with nothing in between that could
 * have changed the answer, and turns that failed back to back.
 * @param {Record<string, any> | null} lib @param {any[] | null} line
 */
function n1(lib, line) {
  const residual =
    'Whether compressing this would hide useful negative evidence is a judgement about the worth of that evidence. The counts below are arithmetic; the worth is not.';
  if (!lib || !line) return { answer: UNKNOWN, partial: true, residual, evidence: null };

  const stretch = sinceLastPrompt(line);
  // `read-only.mjs` does not list this verb among the toolkit's read-only ones, so its own
  // invocation would read as a mutation and end the backward walk before it began. Excluding
  // it here keeps the question answerable without editing the gates' detector out from under
  // the hooks that share it.
  const readOnly = (/** @type {string} */ name, /** @type {Record<string, any>} */ input) =>
    lib.isReadOnly(name, input) || isSelfCall(name, input);

  // `repeatedProbe` answers a hook's question — "is the call about to be issued a repeat" —
  // so the turn that already carries the command has to be excepted, exactly as the hook
  // excepts the turn it was fired from. Without that it matches the command against itself
  // and calls every command a repeat. Each command is therefore asked about from its own
  // most recent turn, and answers true only if an earlier turn issued it with nothing in
  // between that could have changed the answer.
  /** @type {Map<string, string>} */
  const latest = new Map();
  for (const turn of stretch) {
    for (const use of turn.toolUses) {
      const command = lib.asText(use.input?.command);
      if (use.name !== 'Bash' || command === undefined) continue;
      // Asking this verb twice is the agent reading a report, not the agent cycling.
      if (isSelfCall(use.name, use.input)) continue;
      latest.set(command, turn.uuid);
    }
  }
  const repeated = [...latest]
    .filter(([command, uuid]) => lib.repeatedProbe(line, command, uuid, readOnly))
    .map(([command]) => command);

  // Consecutive failing turns at the end of the stretch: one failure is a fact, a run of them
  // is the cycling this gate is about.
  let failingRun = 0;
  for (let i = stretch.length - 1; i >= 0; i--) {
    const turn = stretch[i];
    if (turn.toolUses.length === 0) continue;
    if (!turn.toolUses.some((/** @type {any} */ u) => u.ok === false)) break;
    failingRun += 1;
  }

  const cycling = repeated.length > 0 || failingRun >= 2;
  return {
    answer: cycling ? 'Y' : 'N',
    partial: true,
    residual,
    evidence: `${repeated.length} identical probe(s) re-issued with nothing in between that could have changed the answer; ${failingRun} failing turn(s) in a row`,
    repeatedProbes: repeated,
    consecutiveFailingTurns: failingRun,
  };
}

/**
 * Whether a Bash call is this verb's own invocation. Matched on the toolkit binary followed
 * by this verb, so another toolkit call in the same stretch is untouched.
 * @param {string} name @param {Record<string, any>} input @returns {boolean}
 */
function isSelfCall(name, input) {
  if (name !== 'Bash') return false;
  return /(^|[\s/;|&])my-command-tools\s+trim\b/.test(String(input?.command ?? ''));
}

/**
 * N2 LIVE: a dispatched run that has not reported back, a watch still running, or a path git
 * still has unmerged.
 * @param {Record<string, any> | null} lib @param {any[] | null} line @param {string[]} unmerged
 */
function n2(lib, line, unmerged) {
  if (!lib || !line) {
    return {
      // The git half stands alone, and a conflict on disk is live whatever the transcript says.
      answer: unmerged.length > 0 ? 'Y' : UNKNOWN,
      evidence:
        unmerged.length > 0
          ? `${unmerged.length} unmerged path(s); no transcript read, so dispatches and watches are unknown`
          : 'no transcript read, and no unmerged paths',
      openAgents: null,
      liveWatches: null,
      unmerged,
    };
  }

  const all = lib.turns(line);
  const openAgents = all.flatMap((/** @type {any} */ t) => t.toolUses.filter(agentOpen)).length;
  const live = all.flatMap((/** @type {any} */ t) => t.toolUses.filter(watchLive)).length;
  // What those watches are following, named by the gates' own reader rather than re-parsed.
  const watching = lib.watchedOutputs(line);

  return {
    answer: openAgents > 0 || live > 0 || unmerged.length > 0 ? 'Y' : 'N',
    evidence: `${openAgents} dispatched run(s) still out, ${live} watch(es) still live, ${unmerged.length} unmerged path(s)`,
    openAgents,
    liveWatches: live,
    watchedOutputs: watching,
    unmerged,
  };
}
