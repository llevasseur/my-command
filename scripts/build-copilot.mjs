#!/usr/bin/env node
// Build the GitHub Copilot CLI skills and custom agents from the Codex skills and the Claude
// subagent definitions (src/copilot/patch.mjs).
//
//   node scripts/build-copilot.mjs --check        build in memory; fail on any patch that no longer applies
//   node scripts/build-copilot.mjs --out <dir>    write <dir>/skills/<name>/SKILL.md and <dir>/agents/<name>.agent.md
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCopilot, CopilotPatchError } from '../src/copilot/patch.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : undefined;

if (!args.includes('--check') && !out) {
  console.error('usage: build-copilot.mjs --check | --out <dir>');
  process.exit(2);
}

let files;
try {
  files = buildCopilot(ROOT);
} catch (err) {
  if (!(err instanceof CopilotPatchError)) throw err;
  console.error(`::error::${err.message} — update src/copilot/patch.mjs to match the source it patches.`);
  process.exit(1);
}

if (out) {
  for (const [path, content] of files) {
    const target = join(resolve(out), path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
console.log(`build-copilot: ${files.size} file(s) ${out ? `written to ${out}` : 'build cleanly'}.`);
