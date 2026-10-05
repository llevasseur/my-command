// Fails when command prose drifts from src/manifest.json: flags, verbs, stores, the idea
// claimant, the claude-proxy dependency, and the default branch.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(ROOT, 'src', 'manifest.json'), 'utf8'));
const CMD_DIR = join(ROOT, 'src', 'commands');
const names = readdirSync(CMD_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.slice(0, -3))
  .sort();

/** @param {string} name */
const source = (name) => readFileSync(join(CMD_DIR, `${name}.md`), 'utf8');
/** @param {string} name */
const skill = (name) => readFileSync(join(ROOT, 'skills', name, 'SKILL.md'), 'utf8');

/** The command's own words: expanded snippets and fenced code removed. @param {string} text */
function ownProse(text) {
  return text
    .replace(/<!-- include-block: [^>]+ -->[\s\S]*?<!-- \/include-block -->/g, '')
    .replace(/<!-- include: [^>]+ -->[\s\S]*?<!-- \/include -->/g, '')
    .replace(/^```[\s\S]*?^```/gm, '');
}

/** argument-hint plus the lead of every `## Flags` bullet. @param {string} text */
function declaredFlags(text) {
  const out = new Set();
  const hint = text.match(/^argument-hint:(.*)$/m);
  if (hint) for (const m of hint[1].matchAll(/--[A-Za-z][\w-]*/g)) out.add(m[0]);
  const section = text.match(/^## Flags[^\n]*\n([\s\S]*?)(?=^## )/m);
  if (section) {
    for (const line of section[1].split('\n')) {
      if (!line.startsWith('- ')) continue;
      for (const m of line.split(' — ')[0].matchAll(/`(--[A-Za-z][\w-]*)/g)) out.add(m[1]);
    }
  }
  return [...out].sort();
}

/** @param {string} s */
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** @param {any} store */
function storeMarker(store) {
  const parts = [];
  if (store.cli) parts.push(reEscape(store.cli));
  if (store.verb) parts.push(`my-command-tools ${reEscape(store.verb)} [a-z]`);
  for (const tool of store.mcpTools ?? []) parts.push(`\\b${reEscape(tool)}\\b`);
  return new RegExp(parts.join('|'));
}

test('the manifest lists every command and nothing else', () => {
  assert.deepEqual(Object.keys(manifest.commands).sort(), names);
});

for (const name of names) {
  const entry = manifest.commands[name];
  const text = source(name);

  test(`${name}: flags match its argument-hint and Flags section`, () => {
    assert.deepEqual(declaredFlags(text), entry.flags);
  });

  test(`${name}: my-command-tools verbs match the manifest and exist`, () => {
    const used = [...new Set([...text.matchAll(/my-command-tools ([a-z][a-z-]*)/g)].map((m) => m[1]))].sort();
    assert.deepEqual(used, entry.verbs);
    for (const verb of used) {
      assert.ok(existsSync(join(ROOT, 'src', 'toolkit', 'verbs', `${verb}.mjs`)), `no verb ${verb}`);
    }
  });

  test(`${name}: stores match the manifest`, () => {
    const used = Object.entries(manifest.stores)
      .filter(([, store]) => storeMarker(store).test(text))
      .map(([key]) => key);
    assert.deepEqual(used.sort(), [...entry.stores].sort());
  });

  test(`${name}: a "together with" flag pair names only its own flags`, () => {
    for (const m of ownProse(text).matchAll(/`(--[\w-]+)`[^.\n]{0,20}? together with `(--[\w-]+)`/g)) {
      for (const flag of [m[1], m[2]]) assert.ok(entry.flags.includes(flag), `${name} does not accept ${flag}`);
    }
  });

  test(`${name}: the description names it unnamespaced`, () => {
    const front = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    assert.doesNotMatch(front, /\/my-command:/);
  });

  if (entry.baseBranch === 'defaultBranch') {
    test(`${name}: names the default branch rather than main`, () => {
      const prose = ownProse(text);
      assert.match(text, /defaultBranch/);
      assert.doesNotMatch(prose, /instead of `main`|latest `main`|never on `main`/);
    });
  }
}

test('every store role names a command that touches that store', () => {
  for (const [key, store] of Object.entries(manifest.stores)) {
    for (const [field, value] of Object.entries(store)) {
      if (!field.endsWith('By')) continue;
      for (const name of [value].flat()) {
        assert.ok(manifest.commands[name]?.stores.includes(key), `${key}.${field}: ${name}`);
      }
    }
  }
});

test('a sentence about a claim credits only the claimant', () => {
  const files = [
    ...names.map((n) => join(CMD_DIR, `${n}.md`)),
    ...readdirSync(join(ROOT, 'src', 'shared')).map((f) => join(ROOT, 'src', 'shared', f)),
    ...names.map((n) => join(ROOT, 'skills', n, 'SKILL.md')),
  ];
  for (const store of Object.values(manifest.stores)) {
    if (!store.claimTerm) continue;
    const owner = store.claimedBy;
    for (const file of files) {
      for (const sentence of readFileSync(file, 'utf8').split(/(?<=[.!?])\s+/)) {
        if (!sentence.includes(store.claimTerm)) continue;
        const named = [...sentence.matchAll(/[`$]\/?([a-z][a-z-]*)`?/g)]
          .map((m) => m[1])
          .filter((n) => manifest.commands[n]);
        if (named.length) assert.ok(named.includes(owner), `${file}: "${sentence.trim()}" credits ${named}`);
      }
    }
  }
});

test('a store reached without a variable never carries it', () => {
  for (const store of Object.values(manifest.stores)) {
    if (!store.cli) continue;
    for (const env of store.forbiddenEnv ?? []) {
      const envOnCli = new RegExp(`${reEscape(env)}=\\S*\\s+${reEscape(store.cli)}`);
      for (const name of names) assert.doesNotMatch(source(name), envOnCli, name);
    }
  }
});

test('claude-proxy: includers match the manifest, and optional ones say so', () => {
  const snippet = readFileSync(join(ROOT, 'src', 'shared', 'claude-proxy-checkout.md'), 'utf8');
  assert.doesNotMatch(snippet, /cannot run without claude-proxy|suggestion tooling/);
  assert.match(snippet, /declares it optional/);
  for (const name of names) {
    const entry = manifest.commands[name];
    const includes = source(name).includes('include-block: shared/claude-proxy-checkout.md');
    assert.equal(includes, entry.claudeProxy !== 'none', name);
    if (entry.claudeProxy === 'optional') {
      assert.match(ownProse(source(name)), /_optional_ dependency/, name);
      assert.match(skill(name), /\*\*optional\*\* dependency/, `skills/${name}`);
      assert.ok(entry.claudeProxyFallback, `${name} names no fallback`);
    }
  }
});

test('approval-gated git calls are never chained', () => {
  for (const name of names) {
    const text = source(name);
    if (!text.includes('include: shared/approval-own-call.md')) continue;
    assert.doesNotMatch(ownProse(text), /git checkout [^`]*&& git pull/, name);
  }
});
