// Whether the workflow gates are actually armed on this device.
//
// A hook script is inert until settings.json registers it, and the registration is a
// separate step from installing the commands — so the gates can ship, be pulled, and still
// never execute. Nothing reported that, which is how a mechanical gate spent a week as a
// file nobody ran. This answers it from the two places that decide: the settings file the
// harness reads, and the link the registration points at.
import { existsSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

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
 * Every hook command registered in `settings`, by event.
 * @param {Record<string, any>} settings
 * @returns {Record<string, string[]>}
 */
function registeredCommands(settings) {
  /** @type {Record<string, string[]>} */
  const out = {};
  const hooks = settings?.hooks;
  if (!hooks || typeof hooks !== 'object') return out;
  for (const [event, list] of Object.entries(hooks)) {
    if (!Array.isArray(list)) continue;
    out[event] = list.flatMap((entry) => {
      const hooked = Array.isArray(entry?.hooks) ? entry.hooks : [];
      /** @type {string[]} */
      const commands = [];
      for (const hook of hooked) if (typeof hook?.command === 'string') commands.push(hook.command);
      return commands;
    });
  }
  return out;
}

/**
 * What the fragment asks for: one `{event, command}` per hook it registers, with
 * `{{HOOKS_DIR}}` resolved to where the scripts are installed.
 * @param {string} fragmentPath @param {string} hooksDir
 * @returns {{event: string, command: string, script: string}[]}
 */
function expected(fragmentPath, hooksDir) {
  const fragment = JSON.parse(readFileSync(fragmentPath, 'utf8').replaceAll('{{HOOKS_DIR}}', hooksDir));
  /** @type {{event: string, command: string, script: string}[]} */
  const out = [];
  for (const [event, list] of Object.entries(fragment.hooks ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      for (const hook of Array.isArray(entry?.hooks) ? entry.hooks : []) {
        if (typeof hook?.command !== 'string') continue;
        out.push({ event, command: hook.command, script: hook.command.split(/\s+/)[0] });
      }
    }
  }
  return out;
}

/**
 * The command that arms the gates on *this* device. Which one it is depends on how the
 * device was installed, and naming the wrong one is worse than naming none: the hint used
 * to be a hardcoded `bash <…>/scripts/install-personal.sh`, which only exists inside a git
 * checkout — on a device installed by the npx wizard it pointed at a path that is not there.
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
  // A wizard install copies the scripts to the device instead of linking, and then runs the
  // toolkit from beside them — so hooksDir *is* hooksSrc. That is current, not stale, and
  // must not be reported as a copy `git pull` does not update.
  const current = linked || real(hooksDir) === real(hooksSrc);

  /** @type {{event: string, command: string, registered: boolean}[]} */
  const gates = [];
  const registered = registeredCommands(settings);
  for (const want of expected(fragmentPath, hooksDir)) {
    // Accept the script registered from the link or straight from the checkout: both run it.
    const candidates = [real(expand(want.script)), real(join(hooksSrc, want.script.split('/').pop() ?? ''))];
    const present = (registered[want.event] ?? []).some((cmd) =>
      candidates.includes(real(expand(cmd.split(/\s+/)[0]))),
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
