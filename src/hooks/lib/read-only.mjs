// Deciding whether a tool call is a read-only probe.
//
// Anything not recognized is not read-only. The bias is asymmetric on purpose: calling a
// mutation read-only inflates the discovery run and can deny a legitimate call, while
// calling a probe not-read-only only resets the counter.

/** Tools whose whole purpose is reading. Bash is decided by its command, below. */
const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob']);

/** Binaries that cannot change the repository, whatever arguments they are given. */
const READ_ONLY_BINS = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'wc',
  'rg',
  'grep',
  'egrep',
  'fgrep',
  'find',
  'file',
  'stat',
  'pwd',
  'echo',
  'printf',
  'which',
  'type',
  'jq',
  'yq',
  'sort',
  'uniq',
  'cut',
  'tr',
  'basename',
  'dirname',
  'readlink',
  'realpath',
  'diff',
  'cmp',
  'column',
  'date',
  'true',
  'test',
  'awk',
  'tree',
  'du',
  'df',
  'okq',
]);

/** `git` subcommands that only report. Anything absent — even a read-ish one — is not. */
const READ_ONLY_GIT = new Set([
  'status',
  'log',
  'diff',
  'show',
  'rev-parse',
  'rev-list',
  'ls-files',
  'ls-remote',
  'ls-tree',
  'merge-base',
  'symbolic-ref',
  'describe',
  'blame',
  'shortlog',
  'cat-file',
  'for-each-ref',
  'check-ignore',
  'whatchanged',
  'count-objects',
  'name-rev',
  'grep',
]);

/** `gh` read-only forms, matched on the first two words. */
const READ_ONLY_GH = new Set([
  'pr view',
  'pr list',
  'pr diff',
  'pr checks',
  'pr status',
  'repo view',
  'issue view',
  'issue list',
  'run list',
  'run view',
  'auth status',
  'release view',
  'release list',
  'label list',
  'workflow list',
]);

/** Toolkit verbs that only report. `verify` runs the repo's gates, so it is not a probe. */
const READ_ONLY_TOOLKIT = new Set(['state', 'scope', 'doctor', 'prs']);

/** Shapes that make a segment impossible to judge, so it is never read-only. */
const OPAQUE = /[`$><]|\bsudo\b/;

/**
 * Split a command into the segments a shell would run. A pipeline counts as several:
 * `git log | head` is read-only only because both halves are.
 * @param {string} command
 * @returns {string[]}
 */
function segments(command) {
  return command
    .split(/\|\||&&|[;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} segment
 * @returns {boolean}
 */
function segmentReadsOnly(segment) {
  // A substitution, redirection, or elevation makes the real command something other than
  // what is written here.
  if (OPAQUE.test(segment)) return false;

  const words = segment.split(/\s+/).filter(Boolean);
  const bin = words[0];
  if (!bin) return false;
  // A trailing `&` backgrounds it: a process to manage, not a probe that answers and exits.
  if (words[words.length - 1] === '&') return false;

  if (bin === 'git') {
    // Skip `-C <path>` and other global options to reach the subcommand.
    let i = 1;
    while (i < words.length && words[i].startsWith('-')) i += words[i] === '-C' || words[i] === '-c' ? 2 : 1;
    const sub = words[i];
    if (sub === 'worktree' || sub === 'stash' || sub === 'remote' || sub === 'config' || sub === 'branch') {
      // Each has both reporting and mutating forms; only the listing form is a probe.
      const next = words[i + 1];
      if (sub === 'branch')
        return next === undefined || next === '--show-current' || next === '--list' || next === '-a';
      if (sub === 'config') return next === '--get' || next === '--get-all' || next === '--list';
      if (sub === 'remote') return next === undefined || next === '-v' || next === 'get-url' || next === 'show';
      return next === 'list';
    }
    return sub !== undefined && READ_ONLY_GIT.has(sub);
  }

  if (bin === 'gh') {
    const pair = `${words[1] ?? ''} ${words[2] ?? ''}`.trim();
    // `gh pr checks --watch` blocks the turn instead of answering it.
    if (words.includes('--watch')) return false;
    return READ_ONLY_GH.has(pair);
  }

  if (bin === 'my-command-tools') {
    const sub = words[1];
    if (sub === 'worktree') return words[2] === 'list';
    return sub !== undefined && READ_ONLY_TOOLKIT.has(sub);
  }

  // `sed`/`perl` read only without an in-place flag, but the flag spellings are many and a
  // miss writes to a file — so they stay out of the list entirely.
  return READ_ONLY_BINS.has(bin);
}

/**
 * Whether a tool call only reads.
 * @param {string} name @param {Record<string, any>} input
 * @returns {boolean}
 */
export function isReadOnly(name, input) {
  if (READ_ONLY_TOOLS.has(name)) return true;
  if (name !== 'Bash') return false;
  const command = input?.command;
  if (typeof command !== 'string' || !command.trim()) return false;
  // A backgrounded call is a process, not a probe, whichever binary it names.
  if (input?.run_in_background === true) return false;
  const parts = segments(command);
  return parts.length > 0 && parts.every(segmentReadsOnly);
}
