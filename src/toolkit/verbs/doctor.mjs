// `doctor` — prove the toolkit is reachable and its dependencies are present.
//
// The whole point of installing to a fixed device path is that a command can rely on
// it without knowing how it was installed. This verb is how that claim gets checked
// rather than assumed.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deviceHooksStatus } from '../lib/hooks-status.mjs';
import { candidateRoots, codexDeviceRoot, deviceRoot, findOnPath, linkDirs, TOOLKIT_BIN } from '../lib/paths.mjs';
import { run as exec } from '../lib/proc.mjs';

export const usage = `doctor

Report where the toolkit resolved from, which install roots exist, whether a bare
${TOOLKIT_BIN} call resolves on PATH, and whether the external tools the verbs shell
out to are available.

\`checkout\` names the MyCommand clone this install is symlinked to, and how far its
branch is from origin — the answer /sync needs, so nothing has to derive it by nesting
\`readlink\` and \`dirname\` inside a command substitution.

\`hooks\` reports whether the workflow gates are actually armed: every entry the settings
fragment declares checked against the settings file the harness reads, plus whether the
installed hooks directory points at this checkout. \`hooks.armed: false\` means the gates
are files nobody executes, and \`hooks.hint\` is the command that fixes it.

\`playwright\` reports \`{installed, version, source}\` for the browser driver a closed-loop
check wants — a device-level fact, not a repository one. \`source\` names which probe
answered: \`playwright-cli\` for a global CLI on PATH, \`npx\` for one \`npx --no-install\`
already resolves. Both probes are non-installing and time-bounded, and neither absent
binary is an error: no Playwright anywhere reads \`{installed: false, version: null,
source: null}\`, which is a report rather than a failure.

\`gitExcludes\` reports whether the artifact directories the workflow commands produce are
ignored **once for this device** rather than once per repository. It names the resolved
\`path\` of the file \`core.excludesFile\` points at, and a \`patterns\` map saying which of
\`.playwright-cli/\` and \`.my-command/\` that file actually holds — so a half-written
state reads as one pattern present and one \`missing\`, not as a bare false. \`path\` is the
file git *effectively* reads, falling back to git's own XDG default where the config is
unset, because git honors that file either way; \`configured\` is whether the config is
set at all, and \`exists\` whether the file is there;
\`complete\` is the single answer, and \`hint\` is the append command that fixes a partial
state. Nothing here writes: \`scripts/install-marketplace-personal.sh\` is what puts the
lines in place, and no repository's own \`.gitignore\` is ever involved.`;

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));

/** @param {string} bin @param {string[]} args */
function probe(bin, args) {
  const r = exec(bin, args);
  return { available: !r.missing && r.ok, version: r.ok ? r.stdout.split('\n')[0] : null };
}

/** How long any one Playwright probe may run before it is abandoned. `npx` can block on a cold cache. */
export const PROBE_TIMEOUT_MS = 5000;

/**
 * Tried in order, first one that answers wins. `--no-install` is what keeps the second a
 * probe: plain `npx playwright` fetches the package on a device that lacks it.
 *
 * `scripts/install-marketplace-personal.sh` reads the verb rather than re-probing, so the
 * order lives here only.
 * @type {{source: string, cmd: string, args: string[]}[]}
 */
export const PLAYWRIGHT_PROBES = [
  { source: 'playwright-cli', cmd: 'playwright-cli', args: ['--version'] },
  { source: 'npx', cmd: 'npx', args: ['--no-install', 'playwright', '--version'] },
];

/** The one global install that makes the `npx` probe resolve. Printed, never run. */
export const PLAYWRIGHT_INSTALL_HINT = 'npm i -g playwright';

/**
 * A bounded, throw-free single probe. Reaches `spawnSync` directly because `proc.mjs`'s
 * `run` has no timeout. A missing binary, a non-zero exit, and a timeout are one answer:
 * this did not resolve.
 * @param {string} cmd
 * @param {string[]} args
 * @param {number} [timeoutMs]
 * @returns {{ok: boolean, stdout: string}}
 */
export function boundedProbe(cmd, args, timeoutMs = PROBE_TIMEOUT_MS) {
  try {
    const r = spawnSync(cmd, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      // stdin closed: a probe must never sit waiting on a prompt it cannot answer.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: !r.error && r.status === 0, stdout: r.stdout ?? '' };
  } catch {
    // ENOENT and a timeout arrive through `error`; this covers anything spawnSync throws.
    return { ok: false, stdout: '' };
  }
}

/**
 * The version number out of a `--version` line, whose wording differs between the two
 * CLIs. Falls back to the whole first line, so an unrecognized wording still names
 * what answered.
 * @param {string} out
 * @returns {string | null}
 */
function versionFrom(out) {
  const first = (out.split('\n')[0] ?? '').trim();
  if (first.length === 0) return null;
  return /\d+\.\d+\.\d+[\w.+-]*/.exec(first)?.[0] ?? first;
}

/**
 * Whether this **device** has Playwright, and by which route. Whether a *repository* has
 * Playwright of its own is a separate question, asked elsewhere.
 * @param {(cmd: string, args: string[]) => {ok: boolean, stdout: string}} [runner]
 * @returns {{installed: boolean, version: string | null, source: string | null}}
 */
export function playwright(runner = boundedProbe) {
  for (const { source, cmd, args } of PLAYWRIGHT_PROBES) {
    const r = runner(cmd, args);
    if (!r.ok) continue;
    const version = versionFrom(r.stdout);
    // A zero exit that printed nothing is not a resolved version; keep looking.
    if (version === null) continue;
    return { installed: true, version, source };
  }
  return { installed: false, version: null, source: null };
}

/**
 * The artifact directories the workflow commands drop inside whatever repository they run
 * in. They belong to the tooling, so they are ignored once per **device**; no repository's
 * own `.gitignore` is ever touched.
 *
 * Spelled with the trailing slash git uses for a directory-only match.
 * `scripts/install-marketplace-personal.sh` names these verbatim; `doctor.test.mjs` pins
 * the two together.
 * @type {string[]}
 */
export const DEVICE_IGNORE_PATTERNS = ['.playwright-cli/', '.my-command/'];

/**
 * Where the installer puts the device excludes file when `core.excludesFile` is unset:
 * git's own XDG location, which git reads whether or not the config names it.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [home]
 * @returns {string}
 */
export function defaultExcludesFile(env = process.env, home = homedir()) {
  const xdg = env.XDG_CONFIG_HOME;
  return join(xdg !== undefined && xdg.length > 0 ? xdg : join(home, '.config'), 'git', 'ignore');
}

/**
 * `~` resolved at read time: git stores `core.excludesFile` exactly as it was typed, so an
 * unexpanded path would have `doctor` call a correct install broken.
 * @param {string} p
 * @param {string} [home]
 * @returns {string}
 */
export function expandTilde(p, home = homedir()) {
  if (p === '~') return home;
  if (p.startsWith('~/')) return join(home, p.slice(2));
  return p;
}

/**
 * The excludes lines a file actually declares: blank lines and comments dropped, nothing
 * trimmed — git treats a trailing space in an ignore line as significant.
 * @param {string} contents
 * @returns {Set<string>}
 */
function excludeLines(contents) {
  return new Set(contents.split('\n').filter((l) => l.length > 0 && !l.startsWith('#')));
}

/**
 * Whether a file already ignores `pattern`. The slashless spelling counts, so a
 * hand-written entry gets no near-duplicate appended beside it.
 * @param {Set<string>} declared
 * @param {string} pattern
 * @returns {boolean}
 */
function declares(declared, pattern) {
  return declared.has(pattern) || declared.has(pattern.replace(/\/$/, ''));
}

/**
 * The one command that closes a partial state, for a human to run.
 * @param {string} path
 * @param {string[]} missing
 * @returns {string}
 */
function excludesHint(path, missing) {
  const args = missing.map((p) => `'${p}'`).join(' ');
  return `printf '%s\\n' ${args} >> ${path} (or re-run the MyCommand installer)`;
}

/**
 * Whether this **device** ignores the tooling's artifact directories, and how completely.
 * Read-only: it never sets the config and never creates the file.
 *
 * `path` is the file git *effectively* reads, not the configured one: with
 * `core.excludesFile` unset git still honors its XDG default. `configured` keeps them apart.
 * @param {{config?: () => string | null, readFile?: (path: string) => string | null}} [io]
 * @returns {{configured: boolean, path: string, exists: boolean, patterns: Record<string, boolean>, missing: string[], complete: boolean, hint: string | null}}
 */
export function gitExcludes(io = {}) {
  const config =
    io.config ??
    (() => {
      const r = exec('git', ['config', '--global', 'core.excludesFile']);
      return r.ok && r.stdout.length > 0 ? r.stdout : null;
    });
  const readFile =
    io.readFile ??
    ((/** @type {string} */ p) => {
      try {
        return readFileSync(p, 'utf8');
      } catch {
        // Absent, unreadable, or a directory — all one answer: no patterns declared here.
        return null;
      }
    });

  const configured = config();
  const path = configured === null ? defaultExcludesFile() : expandTilde(configured);
  const contents = readFile(path);
  const declared = excludeLines(contents ?? '');
  const patterns = Object.fromEntries(DEVICE_IGNORE_PATTERNS.map((p) => [p, declares(declared, p)]));
  const missing = DEVICE_IGNORE_PATTERNS.filter((p) => !patterns[p]);
  return {
    configured: configured !== null,
    path,
    exists: contents !== null,
    patterns,
    missing,
    complete: missing.length === 0,
    hint: missing.length === 0 ? null : excludesHint(path, missing),
  };
}

/**
 * Resolve through symlinks so a dev-symlinked root still matches where we loaded from.
 * @param {string} p @returns {string}
 */
function real(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Whether a bare `my-command-tools` call resolves, and to the shim this install placed.
 * A caller reporting "not installed" while `installed` is true is really reporting this.
 * @param {string} device
 */
function pathReachability(device) {
  const shim = join(device, 'bin', TOOLKIT_BIN);
  const resolved = findOnPath(TOOLKIT_BIN);
  return {
    reachable: resolved !== null,
    resolved,
    // A different my-command-tools means commands run a copy this install does not control.
    isDeviceShim: resolved !== null && real(resolved) === real(shim),
    hint: resolved !== null ? null : `ln -s ${shim} ${join(linkDirs()[0], TOOLKIT_BIN)} (or re-run the installer)`,
  };
}

/**
 * The MyCommand clone behind this install, if it is a checkout rather than a copied
 * payload. A personal install symlinks the toolkit back into the clone, so resolving this
 * file's real path and asking git for its root is the whole derivation — composed in the
 * shell it took `$(cd "$(dirname "$(readlink -f …)")/../.." && pwd)`, three nested
 * substitutions the harness refuses.
 * @returns {{root: string, branch: string, head: string, behind: number, ahead: number, dirty: boolean} | null}
 */
function checkout() {
  const root = exec('git', ['rev-parse', '--show-toplevel'], { cwd: real(HERE) });
  if (!root.ok) return null;
  const cwd = root.stdout;
  const branch = exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  // Counted without fetching: doctor is read-only and must not mutate refs.
  const counts = exec('git', ['rev-list', '--left-right', '--count', `HEAD...@{upstream}`], { cwd });
  const [ahead, behind] = counts.ok ? counts.stdout.split(/\s+/).map(Number) : [0, 0];
  return {
    root: cwd,
    branch: branch.ok ? branch.stdout : 'unknown',
    head: exec('git', ['rev-parse', 'HEAD'], { cwd }).stdout,
    behind: Number.isFinite(behind) ? behind : 0,
    ahead: Number.isFinite(ahead) ? ahead : 0,
    dirty: exec('git', ['status', '--porcelain'], { cwd }).stdout.length > 0,
  };
}

export function run() {
  const roots = candidateRoots().map((c) => ({ ...c, exists: existsSync(join(c.path, 'cli.mjs')) }));

  // Match against where this process actually loaded from, not merely the first root
  // that exists — otherwise doctor can name a root it did not run from and contradict
  // its own `runningFrom`.
  const here = real(HERE);
  const resolved = roots.find((root) => root.exists && real(root.path) === here);
  const devices = [deviceRoot(), codexDeviceRoot()];
  const device = devices.find((root) => real(join(root, 'toolkit')) === here) ?? deviceRoot();
  const stamp = join(device, 'VERSION');

  return {
    runningFrom: HERE,
    resolvedBy: resolved?.source ?? 'direct invocation',
    roots,
    deviceRoot: device,
    installed: existsSync(join(device, 'toolkit', 'cli.mjs')),
    onPath: pathReachability(device),
    checkout: checkout(),
    hooks: deviceHooksStatus(),
    version: existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : null,
    node: process.version,
    git: probe('git', ['--version']),
    // gh is only needed by the `pr` verb; the rest of the toolkit works without it.
    gh: probe('gh', ['--version']),
    // Needed by no verb; reported because a closed-loop check picks its driver tier from it.
    playwright: playwright(),
    // Also device-level: whether the tooling's own artifacts are ignored once here.
    gitExcludes: gitExcludes(),
  };
}
