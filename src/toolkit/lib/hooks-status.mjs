// Whether the workflow gates are actually armed on this device.
//
// A hook script is inert until settings.json registers it, and the registration is a
// separate step from installing the commands — so the gates can ship, be pulled, and still
// never execute. Nothing reported that, which is how a mechanical gate spent a week as a
// file nobody ran. This answers it from the two places that decide: the settings file the
// harness reads, and the link the registration points at.
import { existsSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asRecord, recordOrEmpty } from './json.mjs';
import { codexDeviceRoot, deviceRoot } from './paths.mjs';

/**
 * Expand a leading `~` and resolve to an absolute path, so a hook registered as
 * `~/.claude/…` compares equal to the same file spelled in full.
 * @param {string} path
 * @returns {string}
 */
function expand(path) {
  const home = homedir();
  const full = path === '~' ? home : path.startsWith('~/') ? join(home, path.slice(2)) : path;
  return isAbsolute(full) ? full : resolve(full);
}

/** @param {string} path @returns {string} */
function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Every hook a settings document registers, as one `{event, command}` per hook.
 *
 * Both documents this file compares are the same shape — the settings file the harness
 * reads and the fragment this repo ships — so what counts as a registration is settled
 * here, once, and the comparison below works over registrations rather than over two
 * separately-walked JSON trees.
 * @param {unknown} document
 * @returns {{event: string, command: string}[]}
 */
function registrations(document) {
  /** @type {{event: string, command: string}[]} */
  const out = [];
  for (const [event, entries] of Object.entries(recordOrEmpty(asRecord(document)?.hooks))) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      for (const hook of Array.isArray(entry?.hooks) ? entry.hooks : []) {
        // A hook with no command registers nothing — there is no file for the harness to run.
        if (hook?.command === undefined || hook?.command === null) continue;
        out.push({ event, command: String(hook.command) });
      }
    }
  }
  return out;
}

/** The first word of a registered command: the script the harness actually executes. */
const scriptOf = (/** @type {string} */ command) => command.split(/\s+/)[0];

/**
 * The fragment as a settings document, with `{{HOOKS_DIR}}` resolved to where the scripts
 * are installed. Throws on an unreadable or invalid fragment, which `deviceHooksStatus`
 * reports as "no verdict" rather than as "not armed".
 * @param {string} fragmentPath @param {string} hooksDir
 * @returns {unknown}
 */
function fragmentDocument(fragmentPath, hooksDir) {
  return JSON.parse(readFileSync(fragmentPath, 'utf8').replaceAll('{{HOOKS_DIR}}', hooksDir));
}

/**
 * The command that arms the gates on *this* device, chosen by install surface. Naming the
 * wrong one is worse than naming none: a hardcoded install-personal.sh points at a path a
 * wizard-installed device does not have.
 * @param {string} hooksSrc @param {string} hooksDir
 * @returns {string}
 */
function fixHint(hooksSrc, hooksDir) {
  const script = join(hooksSrc, '..', '..', 'scripts', 'install-personal.sh');
  // A clone: the installer relinks the commands, the toolkit, and the gates in one pass.
  if (existsSync(script)) return `bash ${script}`;
  // A wizard install: the scripts are already on the device, so only the merge is missing.
  if (existsSync(join(hooksDir, 'install-hooks.mjs'))) return `node ${join(hooksDir, 'install-hooks.mjs')}`;
  // Neither — the hook bundle never landed, so re-running the wizard is the whole fix.
  return 'npx @llevasseur/my-command';
}

/**
 * Report whether every gate the fragment declares is registered in the settings file the
 * harness reads, and whether the installed hooks directory points at this checkout.
 *
 * A clear negative is the whole point: `armed: false` with the missing entries named, and a
 * `hint` that is the exact command to fix it.
 * @param {{fragmentPath: string, hooksSrc: string, hooksDir: string, settingsPath: string}} opts
 * @returns {Record<string, any>}
 */
export function hooksStatus(opts) {
  const { fragmentPath, hooksSrc, hooksDir, settingsPath } = opts;
  const fix = fixHint(hooksSrc, hooksDir);

  if (!existsSync(fragmentPath)) {
    return { armed: false, reason: `no settings fragment at ${fragmentPath}`, fragmentPath, settingsPath, hint: fix };
  }

  /** @type {Record<string, any>} */
  let settings = {};
  let settingsReadable = true;
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      settingsReadable = false;
    }
  }

  // The link is what makes `git pull` update the gates; a real directory there is a stale
  // copy that no longer tracks the checkout.
  let linkTarget = null;
  let linkKind = 'missing';
  if (existsSync(hooksDir)) {
    try {
      linkKind = statSync(hooksDir).isDirectory() ? 'directory' : 'file';
      linkTarget = readlinkSync(hooksDir);
      linkKind = 'symlink';
    } catch {
      // Not a symlink; the kind set above stands.
    }
  }
  const linked = linkTarget !== null && real(expand(linkTarget)) === real(hooksSrc);
  // A wizard install copies rather than links and runs the toolkit from beside the copy, so
  // hooksDir *is* hooksSrc. Current, not the stale copy the unlinked case reports.
  const current = linked || real(hooksDir) === real(hooksSrc);

  /** @type {{event: string, command: string, registered: boolean}[]} */
  const gates = [];
  const registered = registrations(settings);
  for (const want of registrations(fragmentDocument(fragmentPath, hooksDir))) {
    const script = scriptOf(want.command);
    // Accept the script registered from the link or straight from the checkout: both run it.
    const candidates = [real(expand(script)), real(join(hooksSrc, script.split('/').pop() ?? ''))];
    const present = registered.some(
      (got) => got.event === want.event && candidates.includes(real(expand(scriptOf(got.command)))),
    );
    gates.push({ event: want.event, command: want.command, registered: present });
  }

  const missing = gates.filter((g) => !g.registered);
  const armed = settingsReadable && missing.length === 0;

  return {
    armed,
    settingsPath,
    settingsReadable,
    hooksDir,
    hooksSrc,
    link: { kind: linkKind, target: linkTarget, pointsAtCheckout: linked },
    gates,
    missing: missing.map((g) => `${g.event}: ${g.command}`),
    disabledByEnv:
      process.env.MY_COMMAND_HOOKS !== undefined && /^(0|off|false|no)$/i.test(process.env.MY_COMMAND_HOOKS.trim()),
    reason: armed
      ? current
        ? null
        : `registered, but ${hooksDir} does not point at ${hooksSrc} — the gates run from a copy that git pull does not update`
      : !settingsReadable
        ? `${settingsPath} is not valid JSON, so the harness reads no hooks from it`
        : `${missing.length} of ${gates.length} gate(s) are not registered in ${settingsPath} — they are files nobody executes`,
    hint: armed && current ? null : fix,
  };
}

/** This toolkit's own directory, symlinks resolved: `<checkout>/src/toolkit` or `<device>/toolkit`. */
function toolkitDir() {
  return real(dirname(dirname(fileURLToPath(import.meta.url))));
}

/**
 * `hooksStatus` for the device this toolkit is running on, with every path resolved from
 * where this file actually sits. The single detector — `doctor` reports it and the arming
 * gate decides on it, so the two can never disagree about whether the gates are armed.
 *
 * `armed: null` means the question does not apply here rather than that the answer is no:
 * a Codex install registers no Claude hooks on purpose, and a detector that throws has no
 * verdict to give. Both cases pass the gate, matching the hooks' own fail-open rule.
 * @returns {Record<string, any>}
 */
export function deviceHooksStatus() {
  const here = toolkitDir();
  const hooksSrc = join(dirname(here), 'hooks');
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');

  if (here === real(join(codexDeviceRoot(), 'toolkit'))) {
    return {
      armed: null,
      surface: 'codex',
      reason: 'a Codex install registers no Claude hooks; the gates are a Claude Code mechanism',
      hooksSrc,
    };
  }

  try {
    return {
      surface: 'claude',
      ...hooksStatus({
        fragmentPath: join(hooksSrc, 'settings-fragment.json'),
        hooksSrc,
        hooksDir: join(deviceRoot(), 'hooks'),
        settingsPath: join(claudeDir, 'settings.json'),
      }),
    };
  } catch (err) {
    return { armed: null, surface: 'claude', error: err instanceof Error ? err.message : String(err), hooksSrc };
  }
}
