#!/usr/bin/env node
// MyCommand install wizard. Run with: npx github:llevasseur/my-command
// Compiled from TypeScript to dist/ so the published bin ships dependency-free.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { emitKeypressEvents, type Key } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = join(PKG_ROOT, 'src', 'commands');
const REPO = 'llevasseur/my-command';
const MARKETPLACE = 'my-command';
const PLUGIN = 'my-command';

const commands: string[] = existsSync(SRC_DIR)
  ? readdirSync(SRC_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
  : [];

interface CheckboxPromptOptions {
  message: string;
  items: string[];
  requireSelection?: boolean;
  stream?: NodeJS.ReadStream;
  out?: NodeJS.WriteStream;
}

// Zero-dependency interactive checkbox with a "Select all" toggle pinned at
// the top. Returns the chosen subset of `items`, or null if the user cancels.
// With `requireSelection`, confirming an empty selection keeps the prompt open
// and shows a warning instead of resolving — the user must pick or Esc-cancel.
function checkboxPrompt({
  message,
  items,
  requireSelection = false,
  stream = input,
  out = output,
}: CheckboxPromptOptions): Promise<string[] | null> {
  return new Promise((resolve) => {
    const selected = new Array<boolean>(items.length).fill(false);
    const rowCount = items.length + 1; // row 0 is the select-all toggle
    let cursor = 0;
    let rendered = 0;
    let warning = '';

    const allChecked = () => items.length > 0 && selected.every(Boolean);
    const box = (on: boolean) => (on ? '[x]' : '[ ]');
    const point = (row: number) => (cursor === row ? '❯' : ' ');

    function render() {
      const lines = [message];
      lines.push(`${point(0)} ${box(allChecked())} Select all / Deselect all`);
      items.forEach((it, i) => {
        lines.push(`${point(i + 1)} ${box(selected[i])} ${it}`);
      });
      lines.push('  (Space toggle · a all · ↑↓ move · Enter confirm · Esc cancel)');
      if (warning) lines.push(`\x1b[33m${warning}\x1b[0m`); // yellow
      const prefix = rendered > 0 ? `\x1b[${rendered}A` : '';
      out.write(`${prefix}\x1b[0J${lines.join('\n')}\n`);
      rendered = lines.length;
    }

    function cleanup() {
      stream.removeListener('keypress', onKey);
      if (stream.isTTY) stream.setRawMode(false);
      stream.pause();
    }

    function toggleAll() {
      selected.fill(!allChecked());
    }

    function onKey(str: string | undefined, key: Key | undefined) {
      if (!key) return;
      if (key.ctrl && key.name === 'c') {
        cleanup();
        out.write('\n');
        process.exit(130);
      } else if (key.name === 'up' || key.name === 'k') {
        cursor = (cursor - 1 + rowCount) % rowCount;
        render();
      } else if (key.name === 'down' || key.name === 'j') {
        cursor = (cursor + 1) % rowCount;
        render();
      } else if (key.name === 'space') {
        if (cursor === 0) toggleAll();
        else selected[cursor - 1] = !selected[cursor - 1];
        warning = '';
        render();
      } else if (str === 'a' || str === 'A') {
        toggleAll();
        warning = '';
        render();
      } else if (key.name === 'return' || key.name === 'enter') {
        const picked = items.filter((_, i) => selected[i]);
        if (requireSelection && picked.length === 0) {
          warning = 'Select at least one command to overwrite, or press Esc to cancel.';
          render();
          return;
        }
        cleanup();
        resolve(picked);
      } else if (key.name === 'escape' || str === 'q') {
        cleanup();
        resolve(null);
      }
    }

    emitKeypressEvents(stream);
    if (stream.isTTY) stream.setRawMode(true);
    stream.resume();
    stream.on('keypress', onKey);
    render();
  });
}

interface RunResult {
  ok: boolean;
  missing: boolean;
}

function run(cmd: string, args: string[]): RunResult {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.error && (r.error as NodeJS.ErrnoException).code === 'ENOENT') {
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

async function installPersonal() {
  const dest = process.env.CLAUDE_COMMANDS_DIR || join(homedir(), '.claude', 'commands');
  mkdirSync(dest, { recursive: true });

  const fresh: string[] = [];
  const conflicts: string[] = [];
  for (const c of commands) {
    (existsSync(join(dest, `${c}.md`)) ? conflicts : fresh).push(c);
  }

  const install = (c: string) => copyFileSync(join(SRC_DIR, `${c}.md`), join(dest, `${c}.md`));

  let copied = 0;
  for (const c of fresh) {
    install(c);
    copied++;
  }

  let overwritten = 0;
  let skipped = 0;
  if (conflicts.length > 0) {
    let chosen: string[] | null = null;
    if (input.isTTY) {
      console.log(`\n${conflicts.length} command(s) already exist in ${dest}.`);
      // Require a pick only when nothing is fresh — an empty selection would be a no-op.
      chosen = await checkboxPrompt({
        message: 'Select which existing commands to overwrite:',
        items: conflicts,
        requireSelection: fresh.length === 0,
      });
    } else {
      // No TTY to prompt on — keep the safe default of never clobbering.
      console.log(`\n${conflicts.length} existing command(s) left untouched (non-interactive shell).`);
    }
    const overwrite = new Set(chosen || []);
    for (const c of conflicts) {
      if (overwrite.has(c)) {
        install(c);
        overwritten++;
      } else {
        skipped++;
      }
    }
  }

  // Nothing installed or overwritten — report the cancel plainly rather than "Copied 0, overwrote 0".
  if (copied === 0 && overwritten === 0) {
    console.log(`\nNothing changed${skipped > 0 ? ` — left ${skipped} existing command(s) untouched` : ''}.`);
    return;
  }

  console.log(`\nCopied ${copied} new, overwrote ${overwritten}, skipped ${skipped} in ${dest}.`);
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
    await installPersonal();
  } else {
    console.log('Cancelled. Nothing changed.');
  }
}

// Run the wizard only when invoked directly, so the helpers stay importable.
// realpathSync on argv[1]: npx runs the bin via a symlink, so the raw path
// would never match import.meta.url (the resolved real path).
const entry = process.argv[1];
const invokedDirectly = Boolean(entry && import.meta.url === pathToFileURL(realpathSync(entry)).href);

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { checkboxPrompt, installPersonal };
