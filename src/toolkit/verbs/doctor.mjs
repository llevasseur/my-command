// `doctor` — prove the toolkit is reachable and its dependencies are present.
//
// The whole point of installing to a fixed device path is that a command can rely on
// it without knowing how it was installed. This verb is how that claim gets checked
// rather than assumed.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
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
are files nobody executes, and \`hooks.hint\` is the command that fixes it.`;

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));

/** @param {string} bin @param {string[]} args */
function probe(bin, args) {
  const r = exec(bin, args);
  return { available: !r.missing && r.ok, version: r.ok ? r.stdout.split('\n')[0] : null };
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
  };
}
