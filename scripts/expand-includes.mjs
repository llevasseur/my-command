#!/usr/bin/env node
// Expand `<!-- include: shared/<name>.md -->` directives in src/commands/*.md from the
// canonical snippets in src/shared/, in place:
//
//   <!-- include: shared/<name>.md -->…body, owned by src/shared/<name>.md…<!-- /include -->
//
// Expansion is inline on the directive's own line, so a directive keeps whatever list
// indentation and bullet prefix it was written under — hence the single-line snippet rule: a
// block-level expansion would land at column 0 and break out of any nested bullet.
// `--check` reports drift instead of writing, so a hand-edit inside a block fails CI rather
// than being silently overwritten by the next build.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CMD_DIR = join(REPO_ROOT, 'src', 'commands');
const SHARED_DIR = join(REPO_ROOT, 'src', 'shared');

const checkOnly = process.argv.includes('--check');

// Matches a directive plus the body it already owns, so re-running replaces that body rather
// than nesting a copy. `[^\n]*?` keeps the match on one line: an unclosed directive must not
// swallow the file up to some later block's end marker.
const BLOCK = /<!-- include: shared\/([\w.-]+)\.md -->(?:[^\n]*?<!-- \/include -->)?/g;

const snippet = (name) => {
  const path = join(SHARED_DIR, `${name}.md`);
  if (!existsSync(path)) throw new Error(`no such snippet: src/shared/${name}.md`);
  const body = readFileSync(path, 'utf8').trim();
  if (body.includes('\n')) throw new Error(`src/shared/${name}.md must be a single line`);
  return body;
};

const expand = (source) =>
  source.replace(BLOCK, (_, name) => `<!-- include: shared/${name}.md -->${snippet(name)}<!-- /include -->`);

const drifted = [];
let expanded = 0;

for (const file of readdirSync(CMD_DIR).filter((f) => f.endsWith('.md'))) {
  const path = join(CMD_DIR, file);
  const before = readFileSync(path, 'utf8');
  const after = expand(before);
  if (before === after) continue;
  drifted.push(file);
  if (!checkOnly) {
    writeFileSync(path, after);
    expanded += 1;
  }
}

if (checkOnly && drifted.length > 0) {
  console.error(
    `::error::src/commands/ is out of sync with src/shared/: ${drifted.join(', ')}. ` +
      'Edit the snippet in src/shared/, then run ./scripts/build-plugin.sh and commit the result. ' +
      'Never hand-edit between <!-- include: --> and <!-- /include -->.',
  );
  process.exit(1);
}

const total = readdirSync(SHARED_DIR).filter((f) => f.endsWith('.md')).length;
console.log(
  checkOnly
    ? `expand-includes: src/commands/ is in sync with ${total} shared snippet(s).`
    : `expand-includes: refreshed ${expanded} command file(s) from ${total} shared snippet(s).`,
);
