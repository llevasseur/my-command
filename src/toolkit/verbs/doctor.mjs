// `doctor` — prove the toolkit is reachable and its dependencies are present.
//
// The whole point of installing to a fixed device path is that a command can rely on
// it without knowing how it was installed. This verb is how that claim gets checked
// rather than assumed.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateRoots, deviceRoot, deviceShim, findOnPath, linkDirs, TOOLKIT_BIN } from '../lib/paths.mjs';
import { run as exec } from '../lib/proc.mjs';

export const usage = `doctor

Report where the toolkit resolved from, which install roots exist, whether a bare
${TOOLKIT_BIN} call resolves on PATH, and whether the external tools the verbs shell
out to are available.`;

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
 * Whether a command's bare `my-command-tools` call actually resolves, and to the shim
 * this install placed. Installing to a fixed path is only half the claim — a command
 * spells the call bare, so an unlinked shim is invisible to it. A caller that reports
 * "not installed" when `installed` is true is really reporting this.
 */
function pathReachability() {
  const shim = deviceShim();
  const resolved = findOnPath(TOOLKIT_BIN);
  return {
    reachable: resolved !== null,
    resolved,
    // A resolved binary that is some *other* my-command-tools is worth naming, since it
    // means commands run a copy this install does not control.
    isDeviceShim: resolved !== null && real(resolved) === real(shim),
    hint: resolved !== null ? null : `ln -s ${shim} ${join(linkDirs()[0], TOOLKIT_BIN)} (or re-run the installer)`,
  };
}

export function run() {
  const roots = candidateRoots().map((c) => ({ ...c, exists: existsSync(join(c.path, 'cli.mjs')) }));
  const device = deviceRoot();
  const stamp = join(device, 'VERSION');

  // Match against where this process actually loaded from, not merely the first root
  // that exists — otherwise doctor can name a root it did not run from and contradict
  // its own `runningFrom`.
  const here = real(HERE);

  return {
    runningFrom: HERE,
    resolvedBy: roots.find((r) => r.exists && real(r.path) === here)?.source ?? 'direct invocation',
    roots,
    deviceRoot: device,
    installed: existsSync(join(device, 'toolkit', 'cli.mjs')),
    onPath: pathReachability(),
    version: existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : null,
    node: process.version,
    git: probe('git', ['--version']),
    // gh is only needed by the `pr` verb; the rest of the toolkit works without it.
    gh: probe('gh', ['--version']),
  };
}
