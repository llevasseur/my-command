#!/usr/bin/env node
// MyCommand install wizard. Run with: npx github:llevasseur/my-command
// Zero dependencies so it runs straight from GitHub with no install step.
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';
import { readdirSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = join(PKG_ROOT, 'src', 'commands');
const REPO = 'llevasseur/my-command';
const MARKETPLACE = 'my-command';
const PLUGIN = 'my-command';

const commands = existsSync(SRC_DIR)
  ? readdirSync(SRC_DIR).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
  : [];

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.error && r.error.code === 'ENOENT') {
    return { ok: false, missing: true };
  }
  return { ok: r.status === 0, missing: false };
}

async function installPlugin() {
  console.log('\nInstalling MyCommand as a Claude Code plugin…\n');
  const add = run('claude', ['plugin', 'marketplace', 'add', REPO]);
  if (add.missing) {
    console.log('Could not find the `claude` CLI on your PATH.');
    console.log('Install Claude Code first, then run these two commands:');
    console.log(`  claude plugin marketplace add ${REPO}`);
    console.log(`  claude plugin install ${PLUGIN}@${MARKETPLACE}`);
    return;
  }
  run('claude', ['plugin', 'install', `${PLUGIN}@${MARKETPLACE}`]);
  console.log('\nDone. In a Claude Code session run `/reload-plugins`, then use:');
  console.log(commands.map((c) => `  /${MARKETPLACE}:${c}`).join('\n'));
}

function installPersonal() {
  const dest = process.env.CLAUDE_COMMANDS_DIR || join(homedir(), '.claude', 'commands');
  mkdirSync(dest, { recursive: true });
  let copied = 0;
  let skipped = 0;
  for (const c of commands) {
    const target = join(dest, `${c}.md`);
    if (existsSync(target)) {
      console.log(`skip: ${c}.md already exists in ${dest} (not overwriting)`);
      skipped++;
      continue;
    }
    copyFileSync(join(SRC_DIR, `${c}.md`), target);
    copied++;
  }
  console.log(`\nCopied ${copied} command(s) into ${dest} (skipped ${skipped}).`);
  console.log('They run as bare slash commands:');
  console.log(commands.map((c) => `  /${c}`).join('\n'));
}

async function main() {
  console.log('MyCommand — Your Wish is My Command');
  console.log(`Bundles: ${commands.join(', ')}\n`);
  console.log('How would you like to install?');
  console.log('  1) Claude Code plugin   → namespaced commands, e.g. /my-command:task (auto-updates)');
  console.log('  2) Personal commands    → bare commands, e.g. /task (copied into ~/.claude/commands)');
  console.log('  3) Cancel');

  const rl = createInterface({ input, output });
  const choice = (await rl.question('\nChoice [1]: ')).trim() || '1';
  rl.close();

  if (choice === '1') {
    await installPlugin();
  } else if (choice === '2') {
    installPersonal();
  } else {
    console.log('Cancelled. Nothing changed.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
