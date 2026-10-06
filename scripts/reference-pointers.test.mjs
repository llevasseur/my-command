// A command reads its rarely used branches from a reference file, and the one-line pointer it
// keeps is only worth anything if that file lands where the pointer says on every install surface.
//
//   Claude (plugin, bare commands, npx or install-personal.sh)  ~/.claude/my-command/references/<f>
//                                                               filled from src/references/<f>
//   Codex and opencode skills                                   references/<f> in the skill's own
//                                                               directory, shipped with the skill

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lint } from './lint-commands.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_POINTER = /~\/\.claude\/my-command\/references\/([A-Za-z0-9._-]+\.md)/g;
const SKILL_POINTER = /`references\/([A-Za-z0-9._-]+\.md)`/g;

/** The commands that keep a pointer, and the skills that mirror them. */
const POINTED = ['fb', 'teach', 'wayfinder'];

const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8');
const mdFiles = (dir) => readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.md'));
const pointers = (text, pattern) => [...text.matchAll(pattern)].map((m) => m[1]);

test('every Claude pointer, source and built, names a file in src/references/', () => {
  for (const dir of ['src/commands', 'commands']) {
    for (const name of mdFiles(dir)) {
      for (const file of pointers(read(dir, name), CLAUDE_POINTER)) {
        assert.ok(existsSync(join(ROOT, 'src', 'references', file)), `${dir}/${name} points at a missing ${file}`);
      }
    }
  }
});

test('each command that moved a branch out keeps exactly one pointer, to its own file', () => {
  for (const name of POINTED) {
    for (const dir of ['src/commands', 'commands']) {
      const found = pointers(read(dir, `${name}.md`), CLAUDE_POINTER);
      assert.deepEqual([...new Set(found)], [`${name}.md`], `${dir}/${name}.md`);
    }
  }
});

test('every skill pointer names a file inside that skill’s own directory', () => {
  for (const skill of readdirSync(join(ROOT, 'skills'))) {
    const path = join(ROOT, 'skills', skill, 'SKILL.md');
    if (!existsSync(path)) continue;
    for (const file of pointers(readFileSync(path, 'utf8'), SKILL_POINTER)) {
      assert.ok(
        existsSync(join(ROOT, 'skills', skill, 'references', file)),
        `skills/${skill} points at a missing ${file}`,
      );
    }
  }
  for (const skill of POINTED) {
    assert.equal(pointers(read('skills', skill, 'SKILL.md'), SKILL_POINTER).length, 1, `skills/${skill}/SKILL.md`);
  }
});

test('no reference file is orphaned', () => {
  const pointed = new Set(
    ['src/commands'].flatMap((dir) => mdFiles(dir).flatMap((n) => pointers(read(dir, n), CLAUDE_POINTER))),
  );
  for (const file of mdFiles('src/references')) assert.ok(pointed.has(file), `src/references/${file} has no pointer`);
});

test('the built pointer is not a MyCommand-repo-only path', () => {
  for (const name of POINTED) {
    const text = read('commands', `${name}.md`);
    const lines = text.split('\n').filter((l) => new RegExp(CLAUDE_POINTER.source).test(l));
    assert.equal(lines.length, 1, `commands/${name}.md`);
    assert.deepEqual(lint(`commands/${name}.md`, lines.join('\n')), [], `commands/${name}.md`);
  }
});

test('every install surface places the reference files where the pointers look', () => {
  // Bare commands from a clone: the directory is symlinked into the Claude config root.
  assert.match(read('scripts', 'install-personal.sh'), /REFS_DEST="\$CLAUDE_DIR\/my-command\/references"/);
  // The npx wizard, on both Claude choices, and with each skill's own references for opencode.
  const wizard = read('src', 'my-command.ts');
  assert.match(wizard, /join\(root, 'references'\)/);
  assert.equal(wizard.match(/reportReferences\(installReferences\(\)\);/g)?.length, 2);
  assert.match(wizard, /join\(SKILLS_DIR, skill, 'references'\)/);
  // Codex skills copy (wizard) or link (install-codex-personal.sh) the whole skill directory.
  assert.match(wizard, /cpSync\(join\(SKILLS_DIR, command\), skillDir, \{ recursive: true/);
  assert.match(read('scripts', 'install-codex-personal.sh'), /ln -s "\$source" "\$target"/);
  // The build refuses a pointer whose file is missing.
  assert.match(read('scripts', 'build-plugin.sh'), /src\/references\/\$file does not exist/);
});
