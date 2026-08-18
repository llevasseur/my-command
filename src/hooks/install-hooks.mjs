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
import { asRecord, asText } from './lib/parse.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRAGMENT = join(HERE, 'settings-fragment.json');

/** The events this installer manages. An event absent here is never touched. */
const MANAGED_EVENTS = ['PreToolUse', 'Stop'];

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

/**
 * A settings document's fields. Anything on disk that is not a JSON object carries no settings
 * to merge into, so it reads as an empty document — the same as a file that is not there.
 * @param {string} path @returns {Record<string, any>}
 */
function readJson(path) {
  if (!existsSync(path)) return {};
  try {
    return asRecord(JSON.parse(readFileSync(path, 'utf8')));
  } catch (err) {
    // Overwriting a settings file we could not parse would discard the user's whole
    // configuration. Refuse instead, and say which file to look at.
    throw new Error(`${path} is not valid JSON (${err instanceof Error ? err.message : err}) — fix it, then re-run`);
  }
}

/**
 * The commands a registered entry runs. An entry in the user's settings is theirs — written
 * back exactly as it was found — so the only thing decoded out of one is what this installer
 * has to recognize its own entries by.
 * @param {unknown} matcherEntry @returns {string[]}
 */
function commandsIn(matcherEntry) {
  const hooks = asRecord(matcherEntry).hooks;
  if (!Array.isArray(hooks)) return [];
  /** @type {string[]} */
  const out = [];
  for (const hook of hooks) {
    const command = asText(asRecord(hook).command);
    if (command !== undefined) out.push(command);
  }
  return out;
}

/**
 * Whether a registered hook entry is one of ours.
 * @param {unknown} matcherEntry @param {string} hooksDir
 */
function isOurs(matcherEntry, hooksDir) {
  return commandsIn(matcherEntry).some((command) => command.includes(hooksDir));
}

/**
 * A settings document, decoded. `fields` is everything the file holds and is what gets written
 * back, so a setting this installer knows nothing about survives untouched. `hooks` and
 * `permissions` are the two sections it does own, settled here into records once — a section
 * the file carried as something other than an object of named entries holds no entries to
 * merge with, so it reads as empty, and stays detached from `fields` until the installer
 * actually puts something in it.
 *
 * @typedef {object} SettingsDoc
 * @property {Record<string, any>} fields
 * @property {Record<string, any>} hooks
 * @property {Record<string, any>} permissions
 * @property {boolean} hadHooks Whether the file carried a hook registry of its own.
 */

/** @param {string} path @returns {SettingsDoc} */
function readSettings(path) {
  const fields = readJson(path);
  const hooks = asRecord(fields.hooks);
  return { fields, hooks, permissions: asRecord(fields.permissions), hadHooks: hooks === fields.hooks };
}

/**
 * @param {SettingsDoc} doc @param {string} hooksDir
 * @returns {number} how many of our entries were removed
 */
function removeOurs(doc, hooksDir) {
  const hooks = doc.hooks;
  let removed = 0;
  for (const event of MANAGED_EVENTS) {
    const list = hooks[event];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((entry) => !isOurs(entry, hooksDir));
    removed += list.length - kept.length;
    if (kept.length > 0) hooks[event] = kept;
    else delete hooks[event];
  }
  // A registry we emptied is dropped rather than written back as `{}` — but only when it was
  // the document's own registry to begin with.
  if (doc.hadHooks && Object.keys(hooks).length === 0) delete doc.fields.hooks;
  return removed;
}

/**
 * The bundled fragment, decoded with this install's hooks directory written into it. It ships
 * with the repo, so it is well formed by construction; decoding it here gives the merge below
 * the same settled sections it already has for the document on disk.
 * @param {string} hooksDir
 * @returns {{hooks: Record<string, any>, allow: any[]}}
 */
function readFragment(hooksDir) {
  const fragment = asRecord(JSON.parse(readFileSync(FRAGMENT, 'utf8').replaceAll('{{HOOKS_DIR}}', hooksDir)));
  const allow = asRecord(fragment.permissions).allow;
  return { hooks: asRecord(fragment.hooks), allow: Array.isArray(allow) ? allow : [] };
}

/**
 * @param {{hooksDir: string, settingsPath: string, uninstall: boolean}} opts
 * @returns {Record<string, any>}
 */
export function install(opts) {
  const { hooksDir, settingsPath, uninstall } = opts;
  const doc = readSettings(settingsPath);

  // Clearing ours first is what keeps a re-run idempotent instead of stacking a second copy
  // of the same hook, which would deny twice for one violation.
  const removed = removeOurs(doc, hooksDir);

  if (uninstall) {
    write(settingsPath, doc.fields);
    return { settingsPath, hooksDir, uninstalled: removed, registered: 0, allowAdded: 0 };
  }

  const fragment = readFragment(hooksDir);

  const hooks = doc.hooks;
  doc.fields.hooks = hooks;
  let registered = 0;
  for (const event of MANAGED_EVENTS) {
    const incoming = fragment.hooks[event];
    if (!Array.isArray(incoming)) continue;
    const existing = Array.isArray(hooks[event]) ? hooks[event] : [];
    hooks[event] = [...existing, ...incoming];
    registered += incoming.length;
  }

  // Additive and deduped, so a permission the user narrowed by hand is never widened twice.
  const incomingAllow = fragment.allow;
  const permissions = doc.permissions;
  doc.fields.permissions = permissions;
  const currentAllow = Array.isArray(permissions.allow) ? permissions.allow : [];
  const merged = [...currentAllow];
  let allowAdded = 0;
  for (const rule of incomingAllow) {
    if (merged.includes(rule)) continue;
    merged.push(rule);
    allowAdded += 1;
  }
  permissions.allow = merged;

  write(settingsPath, doc.fields);
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
