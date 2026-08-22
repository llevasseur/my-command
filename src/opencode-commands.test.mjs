// The wizard's opencode commands choice, which writes ~/.config/opencode/command/<name>.md.
// These assert what makes the file real to opencode — the path it reads, and a body that names
// the skill the request is handed to — never against the user's real config directory.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUILT = join(REPO_ROOT, 'dist', 'my-command.js');
assert.ok(existsSync(BUILT), `${BUILT} is missing — run \`pnpm build\` before \`pnpm test\``);
const { installOpencodeCommands } = await import(BUILT);

const SKILLS_SRC = join(REPO_ROOT, 'skills');
const shipped = readdirSync(SKILLS_SRC).filter((name) => existsSync(join(SKILLS_SRC, name, 'SKILL.md')));

/** @type {string[]} */
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway stand-in for ~/.config/opencode/command. */
function scratchDest() {
  const dest = mkdtempSync(join(tmpdir(), 'occ-'));
  made.push(dest);
  return dest;
}

/** The `description:` from a skill's own frontmatter, to compare the command file against. */
function shippedDescription(name) {
  const text = readFileSync(join(SKILLS_SRC, name, 'SKILL.md'), 'utf8');
  return /^description:[ \t]*(.+)$/m.exec(text)[1].trim();
}

test('writes one command file per shipped skill, at the name opencode invokes it by', async () => {
  const dest = scratchDest();

  await installOpencodeCommands(dest);

  assert.deepEqual(readdirSync(dest).sort(), shipped.map((name) => `${name}.md`).sort());
});

test('each command hands the request to the skill of the same name', async () => {
  const dest = scratchDest();

  await installOpencodeCommands(dest);

  for (const skill of shipped) {
    const body = readFileSync(join(dest, `${skill}.md`), 'utf8');
    // Without the skill name and $ARGUMENTS the file loads and invokes nothing.
    assert.match(body, new RegExp(`Use the "${skill}" skill for this request: \\$ARGUMENTS`));
  }
});

test('carries the skill description as frontmatter, quoted so a colon stays valid YAML', async () => {
  const dest = scratchDest();

  await installOpencodeCommands(dest);

  const body = readFileSync(join(dest, 'task.md'), 'utf8');
  const quoted = /^description: (.+)$/m.exec(body)?.[1];
  assert.ok(quoted, 'task.md carries no description; opencode would list the command bare');
  assert.equal(JSON.parse(quoted), shippedDescription('task'));
});

test('a non-interactive re-run leaves an edited command untouched rather than clobbering it', async () => {
  const dest = scratchDest();

  await installOpencodeCommands(dest);
  writeFileSync(join(dest, `${shipped[0]}.md`), 'mine\n');
  await installOpencodeCommands(dest);

  // `node --test` has no TTY, which is the branch that must never overwrite.
  assert.equal(readFileSync(join(dest, `${shipped[0]}.md`), 'utf8'), 'mine\n');
});
