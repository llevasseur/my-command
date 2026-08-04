#!/usr/bin/env node
// Merge the hook registration and the read-only allowlist into the device's settings.json.
// The harness only runs what settings.json registers, so without this the hook scripts are
// files nobody executes.
//
// The merge is additive and identified: entries are recognized by the hooks directory in
// their command path, so re-running replaces exactly this install's entries and touches no
// hook the user added. Every unrelated setting survives.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRAGMENT = join(HERE, 'settings-fragment.json');

/** The events this installer manages. An event absent here is never touched. */
const MANAGED_EVENTS = ['PreToolUse', 'Stop'];

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

/** @param {string} path @returns {Record<string, any>} */
function readJson(path) {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    // Overwriting a settings file we could not parse would discard the user's whole
    // configuration. Refuse instead, and say which file to look at.
    throw new Error(`${path} is not valid JSON (${err instanceof Error ? err.message : err}) — fix it, then re-run`);
  }
}

/**
 * Whether a registered hook entry is one of ours.
 * @param {Record<string, any>} matcherEntry @param {string} hooksDir
 */
function isOurs(matcherEntry, hooksDir) {
  const hooks = Array.isArray(matcherEntry?.hooks) ? matcherEntry.hooks : [];
  return hooks.some((h) => typeof h?.command === 'string' && h.command.includes(hooksDir));
}

/**
 * @param {Record<string, any>} settings @param {string} hooksDir
 * @returns {number} how many of our entries were removed
 */
function removeOurs(settings, hooksDir) {
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== 'object') return 0;
  let removed = 0;
  for (const event of MANAGED_EVENTS) {
    const list = hooks[event];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((entry) => !isOurs(entry, hooksDir));
    removed += list.length - kept.length;
    if (kept.length > 0) hooks[event] = kept;
    else delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  return removed;
}

/**
 * @param {{hooksDir: string, settingsPath: string, uninstall: boolean}} opts
 * @returns {Record<string, any>}
 */
export function install(opts) {
  const { hooksDir, settingsPath, uninstall } = opts;
  const settings = readJson(settingsPath);

  // Clearing ours first is what keeps a re-run idempotent instead of stacking a second copy
  // of the same hook, which would deny twice for one violation.
  const removed = removeOurs(settings, hooksDir);

  if (uninstall) {
    write(settingsPath, settings);
    return { settingsPath, hooksDir, uninstalled: removed, registered: 0, allowAdded: 0 };
  }

  const fragment = JSON.parse(readFileSync(FRAGMENT, 'utf8').replaceAll('{{HOOKS_DIR}}', hooksDir));

  settings.hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};
  let registered = 0;
  for (const event of MANAGED_EVENTS) {
    const incoming = fragment.hooks?.[event];
    if (!Array.isArray(incoming)) continue;
    const existing = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
    settings.hooks[event] = [...existing, ...incoming];
    registered += incoming.length;
  }

  // Additive and deduped, so a permission the user narrowed by hand is never widened twice.
  const incomingAllow = Array.isArray(fragment.permissions?.allow) ? fragment.permissions.allow : [];
  settings.permissions = settings.permissions && typeof settings.permissions === 'object' ? settings.permissions : {};
  const currentAllow = Array.isArray(settings.permissions.allow) ? settings.permissions.allow : [];
  const merged = [...currentAllow];
  let allowAdded = 0;
  for (const rule of incomingAllow) {
    if (merged.includes(rule)) continue;
    merged.push(rule);
    allowAdded += 1;
  }
  settings.permissions.allow = merged;

  write(settingsPath, settings);
  return { settingsPath, hooksDir, uninstalled: 0, registered, allowAdded, replaced: removed };
}

/** @param {string} path @param {Record<string, any>} settings */
function write(path, settings) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}

// Direct invocation only, so the merge is testable without touching a real settings.json.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        'install-hooks.mjs [--hooks-dir <path>] [--settings <path>] [--uninstall]',
        '',
        "Register MyCommand's PreToolUse and Stop hooks, and the read-only Bash allowlist,",
        'in the device settings.json. Idempotent: a re-run replaces this install’s entries.',
        '',
        '  --hooks-dir <path>  Where the installed hook scripts live.',
        '                      Default: <CLAUDE_CONFIG_DIR>/my-command/hooks',
        '  --settings <path>   Settings file to merge into.',
        '                      Default: <CLAUDE_CONFIG_DIR>/settings.json',
        '  --uninstall         Remove this install’s hook entries and exit.',
        '',
        'To turn the gates off without uninstalling, set MY_COMMAND_HOOKS=0 in the',
        'environment Claude Code runs in — every hook exits immediately when it is set.',
        '',
      ].join('\n'),
    );
    process.exit(0);
  }
  const flag = (/** @type {string} */ name) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
  };
  try {
    const result = install({
      hooksDir: flag('--hooks-dir') ?? join(claudeDir(), 'my-command', 'hooks'),
      settingsPath: flag('--settings') ?? join(claudeDir(), 'settings.json'),
      uninstall: args.includes('--uninstall'),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
