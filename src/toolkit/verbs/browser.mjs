// `browser session|sweep` — the browser-driver lifecycle a verification round borrows.
//
// `playwright-cli -s=<name>` starts one persistent `cliDaemon.js <name>` per session name,
// each owning a Chrome tree of about ten processes. The daemon outlives the agent that
// spawned it and reparents to PID 1, so a round that dies early leaves the whole tree
// running with nobody left to close it.
//
// The sweep only works because the names are deterministic: a teardown keyed to one
// ad-hoc name cannot recognise its own predecessors.
import { bool, list, str } from '../lib/flags.mjs';
import { run as exec, UsageError } from '../lib/proc.mjs';
import { currentBranch, repoRoot } from '../lib/repo.mjs';
import { boundedProbe } from './doctor.mjs';

/** Every session this repo opens starts here. A daemon named anything else is not ours. */
export const SESSION_PREFIX = 'mc';

/** How old a daemon must be before a sweep will touch it. */
export const DEFAULT_MINUTES = 60;

export const usage = `browser session --round <n> [--branch <name>] [--cwd <path>]
browser sweep [--older-than <minutes>] [--keep <session>] [--dry-run]

Name and reap the \`playwright-cli\` sessions a verification round opens.

  session  Print the session name this run's round should open under, derived from the
           branch and the round number. Prints {session, branch, round, open, close}.
  sweep    Close \`cliDaemon.js\` daemons older than the threshold whose session name
           matches the scheme \`session\` writes. Prints {swept, kept, thresholdSeconds}.

  --round <n>          session: the round number, 1 or above.
  --branch <name>      session: name against this branch instead of the checked-out one.
  --older-than <mins>  sweep: age threshold in minutes (default ${DEFAULT_MINUTES}).
  --keep <session>     sweep: never reap this session. Repeatable — a concurrent run
                       passes its own live names so a wave cannot reap its siblings.
  --dry-run            sweep: report what would be reaped without signalling anything.

A daemon is reaped by \`playwright-cli -s=<name> close\`, which takes its Chrome tree with
it, and only signalled when that leaves it running — a bare SIGKILL on the daemon orphans
ten Chrome processes rather than ending them. \`close-all\` is never used: it would take a
browser a human is driving, which is the one thing this must not do.`;

/** How long any one `playwright-cli close` may run before it is abandoned. */
export const CLOSE_TIMEOUT_MS = 15000;

/** How long a signalled daemon gets to exit before SIGKILL. */
const TERM_GRACE_MS = 2000;

/**
 * A branch reduced to the alphabet a session name may use. Capped because the name becomes
 * a directory under `.playwright-cli/`.
 * @param {string} branch @returns {string}
 */
export function slug(branch) {
  const s = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
    .replace(/-$/, '');
  // A branch of nothing but punctuation still has to name something addressable.
  return s.length > 0 ? s : 'nobranch';
}

/**
 * The session name for one round. Deterministic in both directions: the round derives it
 * without coordinating, and a later sweep recognises it without being told.
 * @param {string} branch @param {number} round @returns {string}
 */
export function sessionName(branch, round) {
  return `${SESSION_PREFIX}-${slug(branch)}-r${round}`;
}

/** Matches exactly what `sessionName` writes, and deliberately nothing else. */
export const SESSION_PATTERN = new RegExp(`^${SESSION_PREFIX}-[a-z0-9-]+-r\\d+$`);

/** @param {string} name @returns {boolean} */
export function isOurs(name) {
  return SESSION_PATTERN.test(name);
}

/**
 * `ps` elapsed time — `SS`, `MM:SS`, `HH:MM:SS`, or `DD-HH:MM:SS` — as seconds.
 * @param {string} etime @returns {number | null}
 */
export function etimeSeconds(etime) {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime.trim());
  if (!m) return null;
  const [, days, hours, minutes, seconds] = m;
  return ((Number(days ?? 0) * 24 + Number(hours ?? 0)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

/**
 * @typedef {object} Daemon
 * @property {number} pid
 * @property {number} ppid
 * @property {string} session
 * @property {number} ageSeconds
 */

/**
 * Every `cliDaemon.js` on this device, with the session name it was started under — the
 * daemon's last argv token — and how long it has been running.
 * @param {string} listing raw `ps -eo pid=,ppid=,etime=,command=` output
 * @returns {{daemons: Daemon[], children: Map<number, number[]>}}
 */
export function parsePs(listing) {
  /** @type {Daemon[]} */
  const daemons = [];
  /** @type {Map<number, number[]>} */
  const children = new Map();
  for (const line of listing.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    const ppid = Number(m[2]);
    const kids = children.get(ppid);
    if (kids) kids.push(pid);
    else children.set(ppid, [pid]);
    const daemon = /cliDaemon\.js\s+(\S+)\s*$/.exec(m[4]);
    if (!daemon) continue;
    const ageSeconds = etimeSeconds(m[3]);
    // An unparseable age is treated as brand new: a sweep must never reap on a guess.
    daemons.push({ pid, ppid, session: daemon[1], ageSeconds: ageSeconds ?? 0 });
  }
  return { daemons, children };
}

/** @param {number} pid @returns {boolean} */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Blocking sleep; the verb is synchronous throughout. @param {number} ms */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * A daemon and everything beneath it. Signalling the daemon alone leaves its Chrome tree
 * running and reparented.
 * @param {number} pid @param {Map<number, number[]>} children @returns {number[]}
 */
function tree(pid, children) {
  const out = [pid];
  for (let i = 0; i < out.length; i++) for (const kid of children.get(out[i]) ?? []) out.push(kid);
  return out;
}

/**
 * Close one session the way its owner would have. The CLI is asked first because it takes
 * the Chrome tree with it; signals are the fallback for a daemon that ignored the ask.
 * @param {Daemon} daemon @param {Map<number, number[]>} children @returns {string}
 */
function close(daemon, children) {
  boundedProbe('playwright-cli', [`-s=${daemon.session}`, 'close'], CLOSE_TIMEOUT_MS);
  if (!alive(daemon.pid)) return 'close';

  const pids = tree(daemon.pid, children);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone, or not ours to signal.
    }
  }
  for (let waited = 0; waited < TERM_GRACE_MS && pids.some(alive); waited += 100) sleep(100);
  let signal = 'SIGTERM';
  for (const pid of pids) {
    if (!alive(pid)) continue;
    try {
      process.kill(pid, 'SIGKILL');
      signal = 'SIGKILL';
    } catch {
      // Exited between the liveness check and the signal.
    }
  }
  return signal;
}

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const sub = ctx.positionals[0];
  if (sub === 'session') return session(ctx);
  if (sub === 'sweep') return sweep(ctx);
  throw new UsageError(`unknown subcommand \`${sub ?? ''}\` — expected session or sweep`, { usage });
}

/** @param {import('../cli.mjs').Ctx} ctx */
function session(ctx) {
  const raw = str(ctx.flags.round);
  const round = Number(raw);
  if (raw === undefined || !Number.isInteger(round) || round < 1) {
    throw new UsageError('`browser session` needs --round <n>, an integer of 1 or above', { round: raw ?? null });
  }
  const branch = str(ctx.flags.branch) ?? currentBranch(repoRoot(ctx.cwd));
  const name = sessionName(branch, round);
  return {
    session: name,
    branch,
    round,
    open: `playwright-cli -s=${name}`,
    close: `playwright-cli -s=${name} close`,
  };
}

/** @param {import('../cli.mjs').Ctx} ctx */
function sweep(ctx) {
  const raw = str(ctx.flags['older-than']);
  const minutes = raw === undefined ? DEFAULT_MINUTES : Number(raw);
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new UsageError('`--older-than` takes a number of minutes', { olderThan: raw });
  }
  const thresholdSeconds = minutes * 60;
  const dryRun = bool(ctx.flags['dry-run']);
  const keep = new Set(list(ctx.flags.keep));

  const listing = exec('ps', ['-eo', 'pid=,ppid=,etime=,command=']);
  if (!listing.ok) return { swept: [], kept: [], thresholdSeconds, dryRun, listed: false };
  const { daemons, children } = parsePs(listing.stdout);

  /** @type {{session: string, pid: number, ageSeconds: number, how: string}[]} */
  const swept = [];
  /** @type {{session: string, pid: number, ageSeconds: number, reason: string}[]} */
  const kept = [];
  for (const daemon of daemons) {
    // Ordered: the report names the first reason a daemon was spared, and one nobody
    // here started is never measured against a threshold at all.
    const reason = !isOurs(daemon.session)
      ? 'not-ours'
      : keep.has(daemon.session)
        ? 'protected'
        : daemon.ageSeconds < thresholdSeconds
          ? 'too-young'
          : null;
    if (reason !== null) {
      kept.push({ session: daemon.session, pid: daemon.pid, ageSeconds: daemon.ageSeconds, reason });
      continue;
    }
    const how = dryRun ? 'dry-run' : close(daemon, children);
    swept.push({ session: daemon.session, pid: daemon.pid, ageSeconds: daemon.ageSeconds, how });
  }
  return { swept, kept, thresholdSeconds, dryRun, listed: true };
}
