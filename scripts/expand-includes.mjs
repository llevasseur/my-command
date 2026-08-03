#!/usr/bin/env node
// Expand shared-snippet directives in src/commands/*.md from the canonical snippets in
// src/shared/, in place. Two forms, picked by whether the snippet body is one line or many:
//
//   inline   <!-- include: shared/<name>.md -->…body…<!-- /include -->
//
//   block    <!-- include-block: shared/<name>.md -->
//            …body…
//            <!-- /include-block -->
//
// Inline expansion stays on the directive's own line, so the directive keeps whatever list
// indentation and bullet prefix it was written under — hence the single-line rule: a
// multi-line body there would break out of a nested bullet. The block form carries a
// multi-line body and must start at column 0 for the same reason; an indented one is refused
// rather than emitting broken Markdown.
// `--check` reports drift instead of writing, so a hand-edit inside either form fails CI
// rather than being silently repaired by the next build.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CMD_DIR = join(REPO_ROOT, 'src', 'commands');
const SHARED_DIR = join(REPO_ROOT, 'src', 'shared');

// Matches a directive plus the body it already owns, so re-running replaces that body rather
// than nesting a copy. `[^\n]*?` keeps the match on one line: an unclosed directive must not
// swallow the file up to some later block's end marker.
const INLINE_RE = /<!-- include: shared\/([\w.-]+)\.md -->(?:[^\n]*?<!-- \/include -->)?/g;

// A block directive owns its own line. The capture on leading whitespace exists to reject an
// indented directive, not to support one.
const BLOCK_OPEN_RE = /^([ \t]*)<!-- include-block: shared\/([\w.-]+)\.md -->[ \t]*$/;
const BLOCK_CLOSE = '<!-- /include-block -->';

/** A snippet's body, trimmed. Throws when it does not exist. */
export const readSnippet = (sharedDir, name) => {
  const path = join(sharedDir, `${name}.md`);
  if (!existsSync(path)) throw new Error(`no such snippet: src/shared/${name}.md`);
  return readFileSync(path, 'utf8').trim();
};

/** Expand inline `<!-- include: -->` directives. The snippet body must be a single line. */
export const expandInline = (source, read) =>
  source.replace(INLINE_RE, (_, name) => {
    const body = read(name);
    if (body.includes('\n')) {
      throw new Error(
        `src/shared/${name}.md must be a single line to be included inline; ` +
          'use the block form <!-- include-block: --> for a multi-line snippet.',
      );
    }
    return `<!-- include: shared/${name}.md -->${body}<!-- /include -->`;
  });

/** Expand block `<!-- include-block: -->` directives. The body may span lines. */
export const expandBlock = (source, read) => {
  const lines = source.split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = BLOCK_OPEN_RE.exec(lines[i]);
    if (!match) {
      out.push(lines[i]);
      continue;
    }

    const [, indent, name] = match;
    if (indent.length > 0) {
      throw new Error(
        `<!-- include-block: shared/${name}.md --> is indented. A block directive must start at ` +
          'column 0 so its body cannot break out of a surrounding list; use the inline ' +
          '<!-- include: --> form at that position instead.',
      );
    }

    out.push(`<!-- include-block: shared/${name}.md -->`, read(name), BLOCK_CLOSE);

    // Drop the body this directive already owns, so a re-run replaces it rather than stacking
    // a copy. Stop at the next directive: an unclosed one must not swallow the following
    // block's body.
    for (let j = i + 1; j < lines.length; j += 1) {
      if (BLOCK_OPEN_RE.test(lines[j])) break;
      if (lines[j] === BLOCK_CLOSE) {
        i = j;
        break;
      }
    }
  }

  return out.join('\n');
};

export const expand = (source, read) => expandBlock(expandInline(source, read), read);

const main = () => {
  const checkOnly = process.argv.includes('--check');
  const read = (name) => readSnippet(SHARED_DIR, name);
  const drifted = [];
  let expanded = 0;

  for (const file of readdirSync(CMD_DIR).filter((f) => f.endsWith('.md'))) {
    const path = join(CMD_DIR, file);
    const before = readFileSync(path, 'utf8');
    const after = expand(before, read);
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
        'Never hand-edit between an <!-- include --> or <!-- include-block --> marker pair.',
    );
    process.exit(1);
  }

  const total = readdirSync(SHARED_DIR).filter((f) => f.endsWith('.md')).length;
  console.log(
    checkOnly
      ? `expand-includes: src/commands/ is in sync with ${total} shared snippet(s).`
      : `expand-includes: refreshed ${expanded} command file(s) from ${total} shared snippet(s).`,
  );
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
