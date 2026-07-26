#!/usr/bin/env node
// MyCommand install wizard. Run with: npx github:llevasseur/my-command
// Compiled from TypeScript to dist/ so the published bin ships dependency-free.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { emitKeypressEvents, type Key } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = join(PKG_ROOT, 'src', 'commands');
const TOOLKIT_SRC = join(PKG_ROOT, 'src', 'toolkit');
const TOOLKIT_BIN = 'my-command-tools';
const REPO = 'llevasseur/my-command';
const MARKETPLACE = 'my-command';
const PLUGIN = 'my-command';

// The device-wide root every command resolves the toolkit from.
// Keep in step with src/toolkit/lib/paths.mjs and src/toolkit/bin/my-command-tools.
const deviceRoot = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'my-command');

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

interface ToolkitResult {
  installed: boolean;
  bin: string;
  reason?: string;
  link?: PathLink;
}

interface PathLink {
  /** The link that now resolves a bare call, or null when none could be placed. */
  linked: string | null;
  /** Set when nothing was linked, or when an existing link was left alone. */
  reason?: string;
}

// Directories a PATH link may go in, most preferred first. User-owned, so no elevation.
// Keep in step with linkDirs() in src/toolkit/lib/paths.mjs and install-personal.sh.
const linkDirs = () => [join(homedir(), '.local', 'bin'), join(homedir(), 'bin')];

/** Fully resolved path, or null when it doesn't resolve. */
function realOrNull(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

// Put the shim where a bare `my-command-tools` resolves. Commands spell the call bare and
// declare it as `Bash(my-command-tools:*)`, so an unlinked shim reads as "not installed"
// and an absolute-path call would not match that permission rule either.
// Never edits a shell profile — links into a directory already on PATH instead.
function linkOnPath(shim: string): PathLink {
  const onPath = new Set(
    process.env.PATH?.split(delimiter)
      .filter(Boolean)
      .map((d) => (d.length > 1 && d.endsWith('/') ? d.slice(0, -1) : d)),
  );

  const dirs = linkDirs();
  const target = dirs.find((d) => onPath.has(d));
  if (!target) {
    return { linked: null, reason: `no user bin directory on PATH (looked for ${dirs.join(', ')})` };
  }

  const link = join(target, TOOLKIT_BIN);
  try {
    // lstat, not existsSync: a dangling link is broken, not absent, and must be replaced.
    const existing = lstatSync(link, { throwIfNoEntry: false });
    if (existing?.isSymbolicLink()) {
      // Resolve the link itself: its target may be absolute, and a dangling one is not correct.
      if (realOrNull(link) !== null && realOrNull(link) === realOrNull(shim)) return { linked: link };
      unlinkSync(link); // Ours by name — repoint it at this install.
    } else if (existing) {
      // A real file under our name is something else's; clobbering it is not ours to do.
      return { linked: null, reason: `${link} already exists and is not a symlink — left untouched` };
    }
    mkdirSync(target, { recursive: true });
    symlinkSync(shim, link);
    return { linked: link };
  } catch (err) {
    return { linked: null, reason: err instanceof Error ? err.message : String(err) };
  }
}

// Install the shared CLI to a fixed device path. Runs for BOTH install modes on
// purpose: a command must be able to spell the call one way without knowing whether it
// was installed as a plugin or copied in bare.
function installToolkit(): ToolkitResult {
  const shim = join(TOOLKIT_SRC, 'bin', TOOLKIT_BIN);
  if (!existsSync(shim)) return { installed: false, bin: '', reason: `no ${TOOLKIT_BIN} in ${TOOLKIT_SRC}` };

  const root = deviceRoot();
  const dest = join(root, 'toolkit');
  try {
    // Replace wholesale rather than merging, so a verb deleted upstream doesn't linger.
    rmSync(dest, { recursive: true, force: true });
    // Tests belong to CI, not the device — installing them is dead weight in ~/.claude.
    cpSync(TOOLKIT_SRC, dest, { recursive: true, filter: (src) => !src.endsWith('.test.mjs') });

    const binDir = join(root, 'bin');
    mkdirSync(binDir, { recursive: true });
    const bin = join(binDir, TOOLKIT_BIN);
    copyFileSync(shim, bin);
    chmodSync(bin, 0o755);
    chmodSync(join(dest, 'bin', TOOLKIT_BIN), 0o755);
    writeFileSync(join(root, 'VERSION'), `${version()} ${new Date().toISOString()}\n`);
    // Links the fixed shim path, not this payload, so it survives a later install.
    return { installed: true, bin, link: linkOnPath(bin) };
  } catch (err) {
    return { installed: false, bin: '', reason: err instanceof Error ? err.message : String(err) };
  }
}

// What version of the toolkit landed on the device. The commit SHA, not package.json's
// `version` — that field is pinned at 1.0.0 and this repo versions by commit, so
// stamping it would make every install report the same string forever.
function version(): string {
  const sha = spawnSync('git', ['-C', PKG_ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  if (sha.status === 0 && sha.stdout.trim()) return sha.stdout.trim();
  // Not a git checkout (a plain tarball install) — fall back to the package version.
  try {
    return JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function reportToolkit(result: ToolkitResult) {
  if (result.installed) {
    console.log(`\nShared CLI installed: ${result.bin}`);
    if (result.link?.linked) {
      console.log(`On PATH as \`${TOOLKIT_BIN}\` via: ${result.link.linked}`);
      console.log(`Check it any time with: ${TOOLKIT_BIN} doctor   (new shells only)`);
    } else {
      console.log(`Not on PATH (${result.link?.reason ?? 'unknown'}).`);
      console.log(`Commands call it as a bare \`${TOOLKIT_BIN}\`, so add it to PATH with either:`);
      console.log(`  ln -s ${result.bin} ${join(linkDirs()[0], TOOLKIT_BIN)}   # if that dir is on your PATH`);
      console.log(`  export PATH="${dirname(result.bin)}:$PATH"                # in your shell profile`);
      console.log(`Check it any time with: ${result.bin} doctor`);
    }
  } else {
    console.log(`\nShared CLI not installed (${result.reason}).`);
    console.log('Commands that shell out to it will report the missing toolkit when run.');
  }
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
    reportToolkit(installToolkit());
  } else if (choice === '2') {
    await installPersonal();
    reportToolkit(installToolkit());
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

export { checkboxPrompt, installPersonal, installToolkit, linkOnPath };
