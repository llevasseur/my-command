// The wizard's opencode step, which is the only thing that carries the workflows to a model
// that is not Anthropic's. These assert what makes the copy real — a SKILL.md on the device
// under the name opencode looks up — never against the real ~/.agents/skills.
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUILT = join(REPO_ROOT, 'dist', 'my-command.js');
assert.ok(existsSync(BUILT), `${BUILT} is missing — run \`pnpm build\` before \`pnpm test\``);
const { installOpencodeSkills } = await import(BUILT);

const SKILLS_SRC = join(REPO_ROOT, 'skills');
const shipped = readdirSync(SKILLS_SRC).filter((name) => existsSync(join(SKILLS_SRC, name, 'SKILL.md')));

/** @type {string[]} */
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway stand-in for ~/.agents/skills. */
function scratchDest() {
  const dest = mkdtempSync(join(tmpdir(), 'mco-'));
  made.push(dest);
  return dest;
}

test('copies every shipped SKILL.md under the name opencode discovers it by', () => {
  const dest = scratchDest();

  const result = installOpencodeSkills(dest);

  assert.equal(result.installed, true, result.reason);
  assert.equal(result.dest, dest);
  assert.equal(result.copied, shipped.length);
  assert.equal(result.symlinked, false);

  // opencode reads `<dir>/<name>/SKILL.md`; anything landing at another path is invisible to it.
  for (const skill of shipped) {
    assert.ok(existsSync(join(dest, skill, 'SKILL.md')), `${skill} did not land on the device`);
  }
});

test('re-running overwrites in place rather than stacking a second copy', () => {
  const dest = scratchDest();

  installOpencodeSkills(dest);
  writeFileSync(join(dest, shipped[0], 'SKILL.md'), 'stale\n');
  const second = installOpencodeSkills(dest);

  assert.equal(second.copied, shipped.length);
  assert.deepEqual(readdirSync(dest).sort(), [...shipped].sort());
  assert.ok(!existsSync(join(dest, shipped[0], 'SKILL.md.1')));
});

test('a skill directory symlinked into a checkout is left alone, never written through', () => {
  const dest = scratchDest();
  const checkout = join(SKILLS_SRC, shipped[0]);
  symlinkSync(checkout, join(dest, shipped[0]));

  const result = installOpencodeSkills(dest);

  assert.equal(result.installed, true, result.reason);
  assert.equal(result.symlinked, true);
  assert.equal(result.copied, shipped.length - 1);
  // Writing through the link would have written into the clone.
  assert.ok(lstatSync(join(dest, shipped[0])).isSymbolicLink());
});

test('a failed copy reports itself instead of throwing', () => {
  const dest = scratchDest();
  // A file where the first skill's directory has to go makes the write fail.
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, shipped[0]), 'not a directory\n');

  const result = installOpencodeSkills(dest);

  assert.equal(result.installed, false);
  assert.ok(result.reason, 'a failure must say why, not just report false');
});
