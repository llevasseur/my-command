#!/usr/bin/env node
// Hold CHANGELOG.md bullets to the shape src/shared/changelog-entry-shape.md prescribes.
//
// The shape says 2 to 3 sentences under 60 words; this gate fails a bullet over 80, so a
// bullet that drifted past the target by a sentence still passes and one that became a
// design doc does not. Only the top two dated sections are checked: older entries are
// history, and rewriting them to satisfy a rule that did not exist when they were written
// would be its own change. The shape and the gate are described in docs/features/changelog.md.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The most a bullet may carry before the gate fails it. */
export const MAX_WORDS = 80;

/** How many dated sections, newest first, the gate reads. */
export const SECTIONS_CHECKED = 2;

/** A `## YYYY-MM-DD` heading, the layout this repo's changelog groups by. */
const DATED = /^## (\d{4}-\d{2}-\d{2})\s*$/;

/**
 * @typedef {object} Bullet
 * @property {string} section The dated heading the bullet sits under.
 * @property {number} line    1-indexed line of the bullet's first line.
 * @property {number} words   Whitespace-separated word count over the bullet and its continuation lines.
 * @property {string} lead    The bullet's first 60 characters, for the report.
 */

/**
 * Every top-level bullet under the newest `count` dated sections. A bullet runs until the
 * next line that is blank, a heading, or another top-level bullet, so a wrapped bullet is
 * counted whole and an indented sub-bullet is counted against its parent.
 * @param {string} text
 * @param {number} [count]
 * @returns {Bullet[]}
 */
export function bullets(text, count = SECTIONS_CHECKED) {
  const lines = text.split('\n');
  /** @type {Bullet[]} */
  const out = [];
  let section = null;
  let seen = 0;
  let current = null;

  const flush = () => {
    if (!current) return;
    const body = current.text.join(' ');
    out.push({
      section: current.section,
      line: current.line,
      words: body.split(/\s+/).filter(Boolean).length,
      lead: body.slice(0, 60),
    });
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dated = line.match(DATED);
    if (dated) {
      flush();
      seen++;
      if (seen > count) break;
      section = dated[1];
      continue;
    }
    if (!section) continue;

    if (line.startsWith('- ')) {
      flush();
      current = { section, line: i + 1, text: [line.slice(2)] };
    } else if (current && line.trim() !== '' && !line.startsWith('#')) {
      current.text.push(line.trim());
    } else {
      flush();
    }
  }
  flush();
  return out;
}

function main() {
  const file = join(ROOT, 'CHANGELOG.md');
  const all = bullets(readFileSync(file, 'utf8'));
  const over = all.filter((b) => b.words > MAX_WORDS);

  for (const b of over) {
    process.stdout.write(
      `::error::CHANGELOG.md:${b.line} — ${b.words} words under ${b.section}; the limit is ${MAX_WORDS}.\n` +
        `    ${b.lead}…\n` +
        '  Cut it to one change, 2 to 3 sentences, and link docs/features/<cmd>.md for the why ' +
        '(src/shared/changelog-entry-shape.md).\n',
    );
  }

  if (over.length > 0) {
    process.stdout.write(`check-changelog: ${over.length} bullet(s) over ${MAX_WORDS} words.\n`);
    process.exit(1);
  }
  process.stdout.write(
    `check-changelog: ${all.length} bullet(s) in the newest ${SECTIONS_CHECKED} dated section(s) are under ${MAX_WORDS} words.\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
