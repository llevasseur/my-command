// `doctor` — prove the toolkit is reachable and its dependencies are present.
//
// The whole point of installing to a fixed device path is that a command can rely on
// it without knowing how it was installed. This verb is how that claim gets checked
// rather than assumed.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateRoots, deviceRoot } from '../lib/paths.mjs';
import { run as exec } from '../lib/proc.mjs';

export const usage = `doctor

Report where the toolkit resolved from, which install roots exist, and whether the
external tools the verbs shell out to are available.`;

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));

/** @param {string} bin @param {string[]} args */
function probe(bin, args) {
  const r = exec(bin, args);
  return { available: !r.missing && r.ok, version: r.ok ? r.stdout.split('\n')[0] : null };
}

export function run() {
  const roots = candidateRoots().map((c) => ({ ...c, exists: existsSync(join(c.path, 'cli.mjs')) }));
  const device = deviceRoot();
  const stamp = join(device, 'VERSION');

  return {
    runningFrom: HERE,
    resolvedBy: roots.find((r) => r.exists)?.source ?? 'direct invocation',
    roots,
    deviceRoot: device,
    installed: existsSync(join(device, 'toolkit', 'cli.mjs')),
    version: existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : null,
    node: process.version,
    git: probe('git', ['--version']),
    // gh is only needed by the `pr` verb; the rest of the toolkit works without it.
    gh: probe('gh', ['--version']),
  };
}
