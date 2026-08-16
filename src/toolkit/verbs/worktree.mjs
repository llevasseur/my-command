// `worktree begin|end|reap|list` — the isolated-workspace lifecycle.
//
// This verb does not move the caller's working directory: in Claude Code that is
// EnterWorktree/ExitWorktree's job. `begin` prepares the checkout and hands back the
// path to enter; `end` verifies the work is on origin before removing the local copy.
// `end` also stops the processes still running out of the worktree; `reap` is that
// step alone, for the teardowns ExitWorktree owns. `list` reports which of them have
// outlived their branch.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bool, str } from '../lib/flags.mjs';
import { run as exec, lines, must, ToolkitError, UsageError } from '../lib/proc.mjs';
import { defaultBranch, repoRoot, resolveBase } from '../lib/repo.mjs';

export const usage = `worktree begin --branch <name> [--base <ref>] [--existing] [--bootstrap]
worktree end --branch <name> [--force] [--no-reap]
worktree reap [--branch <name> | --path <dir>]
worktree list

  begin   Fetch, then create a worktree for <name> under .claude/worktrees/.
          --base <ref>   Branch off <ref> instead of origin/<default-branch>.
          --existing     Check out an existing branch instead of creating one.
                         Mutually exclusive with --base.
          --bootstrap    Run the repo's scripts/bootstrap-worktree.sh if it has one.
  end     Remove the worktree for <name>, refusing unless HEAD is on origin.
          --force        Remove even with unpushed commits or a dirty tree.
          --no-reap      Leave processes rooted in the worktree running.
  reap    Stop processes rooted in a worktree without removing it — the step
          ExitWorktree does not take. Names it by --branch or by --path.
  list    Report every registered worktree, each marked \`reclaimable\` when its
          branch has already merged into origin/<default-branch>.`;

const BOOTSTRAP = join('scripts', 'bootstrap-worktree.sh');

/** Branch names contain slashes; worktree directories should not. @param {string} branch */
function dirFor(branch) {
  return branch.replace(/[/\\]/g, '-');
}

/** @param {string} cwd @returns {{branch: string|null, path: string, head: string}[]} */
function listWorktrees(cwd) {
  const out = must('git', ['worktree', 'list', '--porcelain'], { cwd });
  /** @type {{branch: string|null, path: string, head: string}[]} */
  const trees = [];
  /** @type {{branch: string|null, path: string, head: string}} */
  let current = { branch: null, path: '', head: '' };
  for (const line of lines(out)) {
    if (line.startsWith('worktree ')) current = { branch: null, path: line.slice(9), head: '' };
    else if (line.startsWith('HEAD ')) current.head = line.slice(5);
    else if (line.startsWith('branch ')) current.branch = line.slice(7).replace('refs/heads/', '');
    if (line.startsWith('branch ') || line === 'detached') trees.push(current);
  }
  return trees;
}

/**
 * Whether `branch`'s work is already on the default branch, and so whether the worktree
 * holding it can be removed without losing anything.
 *
 * `null` means "cannot be judged" rather than "no": a detached worktree has no branch
 * whose merge could be read, and with no local `origin/<default>` there is nothing to
 * compare against. `false` there would read as live work and hide a reclaimable worktree.
 * @param {string} cwd
 * @param {string|null} branch
 * @param {string} fallback  The default branch, which is never its own reclaim candidate.
 * @param {string|null} against  The ref to compare with, or null when it is absent locally.
 * @returns {boolean|null}
 */
function isReclaimable(cwd, branch, fallback, against) {
  // Checked before `against`: the one answer needing no ref, and `requireBranch` already
  // refuses to target the default branch.
  if (branch === fallback) return false;
  if (against === null || branch === null) return null;
  return exec('git', ['merge-base', '--is-ancestor', `refs/heads/${branch}`, against], { cwd }).ok;
}

/**
 * Every registered worktree, each marked with whether its branch has already merged.
 *
 * Deliberately offline: the comparison reads the remote-tracking ref already on disk rather
 * than fetching, so the answer is only as fresh as the last fetch (`begin` fetches).
 *
 * No size field on purpose: `du` overstates a worktree severalfold on APFS, since pnpm
 * clones package files from its store rather than copying them, so apparent size measures
 * the store rather than what removing the worktree would return.
 * @param {string} cwd
 */
function list(cwd) {
  const fallback = defaultBranch(cwd);
  const ref = `origin/${fallback}`;
  const present = exec('git', ['rev-parse', '--verify', `refs/remotes/${ref}^{commit}`], { cwd }).ok;
  const against = present ? ref : null;
  return {
    root: cwd,
    // null here with null throughout means fetch first, not that every branch is live.
    comparedWith: against,
    worktrees: listWorktrees(cwd).map((w) => ({ ...w, reclaimable: isReclaimable(cwd, w.branch, fallback, against) })),
  };
}

/**
 * Every process whose command line names `dir`, minus this process and its ancestors.
 * Matches on the command line rather than the working directory: a watcher's reloaded
 * child still carries the worktree path in argv, and `ps` is portable where a cwd scan
 * needs lsof.
 * @param {string} dir @returns {{pid: number, command: string}[]}
 */
function processesUnder(dir) {
  const listing = exec('ps', ['-eo', 'pid=,ppid=,command=']);
  if (!listing.ok) return [];
  /** @type {Map<number, number>} */
  const parents = new Map();
  /** @type {{pid: number, ppid: number, command: string}[]} */
  const rows = [];
  for (const line of lines(listing.stdout)) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    const row = { pid: Number(m[1]), ppid: Number(m[2]), command: m[3] };
    parents.set(row.pid, row.ppid);
    rows.push(row);
  }
  const own = new Set();
  for (let pid = process.pid; pid && !own.has(pid); pid = parents.get(pid) ?? 0) own.add(pid);
  return rows
    .filter((r) => !own.has(r.pid) && r.command.includes(dir))
    .map((r) => ({ pid: r.pid, command: r.command }));
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
 * Stop everything still running out of `dir`. SIGTERM first, then SIGKILL after two
 * seconds for whatever ignored it.
 * @param {string} dir @returns {{pid: number, command: string, signal: string}[]}
 */
function reapProcesses(dir) {
  const found = processesUnder(dir);
  /** @type {{pid: number, command: string, signal: string}[]} */
  const reaped = [];
  for (const p of found) {
    try {
      process.kill(p.pid, 'SIGTERM');
      reaped.push({ ...p, signal: 'SIGTERM' });
    } catch {
      // Already gone, or not ours to signal.
    }
  }
  for (let waited = 0; waited < 2000 && reaped.some((p) => alive(p.pid)); waited += 100) sleep(100);
  for (const p of reaped) {
    if (!alive(p.pid)) continue;
    try {
      process.kill(p.pid, 'SIGKILL');
      p.signal = 'SIGKILL';
    } catch {
      // Exited between the liveness check and the signal.
    }
  }
  return reaped;
}

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const sub = ctx.positionals[0];
  const cwd = repoRoot(ctx.cwd);
  if (sub === 'begin') return begin(ctx, cwd);
  if (sub === 'end') return end(ctx, cwd);
  if (sub === 'reap') return reap(ctx, cwd);
  if (sub === 'list') return list(cwd);
  throw new UsageError(`unknown subcommand \`${sub ?? ''}\` — expected begin, end, reap, or list`, { usage });
}

/**
 * Reap without removing the checkout — the step ExitWorktree's teardown lacks.
 * Targets `--path`, else the worktree registered for `--branch`.
 * @param {import('../cli.mjs').Ctx} ctx @param {string} cwd
 */
function reap(ctx, cwd) {
  const explicit = str(ctx.flags.path);
  let target = explicit ? resolve(explicit) : null;
  if (!target) {
    const branch = requireBranch(ctx, cwd);
    const tree = listWorktrees(cwd).find((w) => w.branch === branch);
    if (!tree) throw new ToolkitError(`no worktree checked out for branch ${branch}`, { branch });
    target = tree.path;
  }
  return { path: target, reaped: reapProcesses(target) };
}

/** @param {import('../cli.mjs').Ctx} ctx @param {string} cwd */
function begin(ctx, cwd) {
  const branch = requireBranch(ctx, cwd);
  const existing = bool(ctx.flags.existing);

  if (existing && str(ctx.flags.base) !== undefined) {
    throw new UsageError('--existing checks out a branch that already has a base; --base cannot apply', { usage });
  }

  // Fetch first: the worktree's base is only as fresh as the remote-tracking ref,
  // and a stale origin/<default> silently plants the branch on old code.
  const fetched = exec('git', ['fetch', 'origin'], { cwd });
  const path = join(cwd, '.claude', 'worktrees', dirFor(branch));

  if (existsSync(path)) throw new ToolkitError(`worktree path already exists: ${path}`, { path, branch });

  const hasLocal = exec('git', ['rev-parse', '--verify', `refs/heads/${branch}`], { cwd }).ok;

  if (existing) {
    const hasRemote = exec('git', ['rev-parse', '--verify', `refs/remotes/origin/${branch}`], { cwd }).ok;
    if (!hasLocal && !hasRemote) {
      throw new ToolkitError(`branch does not exist locally or on origin: ${branch}`, { branch });
    }
    // With no local ref, `git worktree add <path> <branch>` creates it from the
    // remote-tracking ref and sets up tracking.
    const added = exec('git', ['worktree', 'add', path, branch], { cwd });
    if (!added.ok) throw new ToolkitError('git worktree add failed', { code: added.code, stderr: added.stderr });
    return report(ctx, { path, branch, base: null, fetched: fetched.ok, existing: true });
  }

  const base = resolveBase(cwd, str(ctx.flags.base));
  if (hasLocal)
    throw new ToolkitError(`branch already exists: ${branch} — pass --existing to check it out`, { branch });

  const added = exec('git', ['worktree', 'add', path, '-b', branch, base.sha], { cwd });
  if (!added.ok) throw new ToolkitError('git worktree add failed', { code: added.code, stderr: added.stderr });
  return report(ctx, { path, branch, base, fetched: fetched.ok, existing: false });
}

/**
 * @param {import('../cli.mjs').Ctx} ctx
 * @param {{path: string, branch: string, base: {ref: string, sha: string} | null, fetched: boolean, existing: boolean}} made
 */
function report(ctx, made) {
  const { path } = made;

  // Check the script in the new worktree, which is where it runs. The main checkout can
  // disagree — the branch may add or drop the script relative to whatever is checked out
  // over there.
  const bootstrap = join(path, BOOTSTRAP);
  let bootstrapped = null;
  if (bool(ctx.flags.bootstrap) && existsSync(bootstrap)) {
    const r = exec('bash', [BOOTSTRAP], { cwd: path });
    bootstrapped = { ok: r.ok, code: r.code, output: r.ok ? undefined : [r.stdout, r.stderr].join('\n').slice(-4000) };
  }

  return {
    ...made,
    // Reported either way so the caller knows whether the repo has its own bootstrap
    // or needs the generic install/env-symlink fallback.
    bootstrapScript: existsSync(bootstrap) ? BOOTSTRAP : null,
    bootstrapped,
  };
}

/** @param {import('../cli.mjs').Ctx} ctx @param {string} cwd */
function end(ctx, cwd) {
  const branch = requireBranch(ctx, cwd);
  const tree = listWorktrees(cwd).find((w) => w.branch === branch);
  if (!tree) throw new ToolkitError(`no worktree checked out for branch ${branch}`, { branch });

  const force = bool(ctx.flags.force);
  const remote = exec('git', ['rev-parse', '--verify', `refs/remotes/origin/${branch}`], { cwd });
  const local = exec('git', ['rev-parse', 'HEAD'], { cwd: tree.path });
  const pushed = remote.ok && local.ok && remote.stdout === local.stdout;
  const dirty = exec('git', ['status', '--porcelain'], { cwd: tree.path }).stdout.length > 0;

  if (!pushed && !force) {
    throw new ToolkitError('refusing to remove: HEAD is not on origin — push first, or pass --force', {
      branch,
      path: tree.path,
      local: local.stdout,
      remote: remote.ok ? remote.stdout : null,
    });
  }

  // Before the removal, not after — a survivor outlives the directory silently.
  const reaped = bool(ctx.flags['no-reap']) ? [] : reapProcesses(tree.path);

  const args = ['worktree', 'remove', tree.path];
  if (force || dirty) args.push('--force');
  const removed = exec('git', args, { cwd });
  if (!removed.ok) throw new ToolkitError('git worktree remove failed', { code: removed.code, stderr: removed.stderr });
  exec('git', ['worktree', 'prune'], { cwd });

  return { removed: true, branch, path: tree.path, pushed, wasDirty: dirty, reaped };
}

/** @param {import('../cli.mjs').Ctx} ctx @param {string} cwd @returns {string} */
function requireBranch(ctx, cwd) {
  const branch = str(ctx.flags.branch);
  if (typeof branch !== 'string' || !branch.trim()) throw new UsageError('--branch is required', { usage });
  if (branch === defaultBranch(cwd)) throw new ToolkitError('refusing to target the default branch', { branch });
  return branch;
}
