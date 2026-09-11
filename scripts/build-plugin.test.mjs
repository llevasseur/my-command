// The namespacing rewrite in build-plugin.sh turns a bare /<cmd> into /<ns>:<cmd>, and it has
// to leave an absolute path alone even when that path's first segment is a command name. It
// shipped without that: `dev` is a command, so `>/dev/null` in a shell snippet became
// `>/my-command:dev/null`, a redirect that fails on every machine — and it fails *silently*,
// because the caller reads the non-zero exit as the condition it was probing for. The bare
// source was right and only the generated copy was wrong, which is the half nobody re-reads.
//
// These assert the invariant over the committed commands/, so a regression fails `pnpm test`
// rather than waiting to be noticed on an installed device.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'commands');
const SRC_DIR = join(ROOT, 'src', 'commands');

/** The plugin namespace the build reads out of the manifest. */
const namespace = () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  return manifest.name;
};

const generated = () =>
  readdirSync(OUT_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, text: readFileSync(join(OUT_DIR, name), 'utf8') }));

test('no generated command namespaces a path segment', () => {
  const ns = namespace();
  // A real invocation is never followed by another slash; a path always is.
  const pathLike = new RegExp(`/${ns}:[a-z0-9-]+/`, 'g');
  for (const { name, text } of generated()) {
    const hits = text.match(pathLike) ?? [];
    assert.deepEqual(hits, [], `commands/${name} namespaced a path segment: ${hits.join(', ')}`);
  }
});

test('/dev/null survives the rewrite wherever the source uses it', () => {
  const sources = readdirSync(SRC_DIR).filter((name) => name.endsWith('.md'));
  for (const name of sources) {
    const src = readFileSync(join(SRC_DIR, name), 'utf8');
    const wanted = (src.match(/\/dev\/null/g) ?? []).length;
    if (wanted === 0) continue;
    const out = readFileSync(join(OUT_DIR, name), 'utf8');
    assert.equal(
      (out.match(/\/dev\/null/g) ?? []).length,
      wanted,
      `commands/${name} lost a /dev/null the source carries`,
    );
  }
});
