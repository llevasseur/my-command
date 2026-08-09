// Fail closed when the workflow gates are not armed.
//
// The gates were rung 3 with a rung-1 activation: an unarmed device was fully runnable and
// only `doctor` said otherwise, and nothing a session calls reads `doctor`. So the closing
// turn kept going unrecorded on devices where the Stop hook was a file nobody executed.
// This removes the affordance instead of reporting it — the verbs every workflow command
// opens with refuse to run at all until the gates are registered.
import { deviceHooksStatus } from './hooks-status.mjs';
import { ToolkitError } from './proc.mjs';

/**
 * The verbs a workflow command calls before it does anything else. Gating these means an
 * unarmed device cannot start a run, rather than finishing one with no outcome recorded.
 */
export const GATED_VERBS = new Set(['state', 'scope', 'commit', 'pr']);

/** The escape hatch's off values, matching MY_COMMAND_HOOKS' own. */
const OFF = /^(0|off|false|no)$/i;

/**
 * The deliberate escape a caller used, or null. Never the default: a hook-less environment
 * has to say so, and says which way it said it.
 * @param {Record<string, string | boolean | string[]>} flags
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function armingEscape(flags, env = process.env) {
  if (flags.unarmed === true || flags.unarmed === 'true') return '--unarmed';
  const required = env.MY_COMMAND_REQUIRE_HOOKS;
  if (required !== undefined && OFF.test(required.trim())) return 'MY_COMMAND_REQUIRE_HOOKS=0';
  // The device-wide off switch already means "the gates are deliberately not running here";
  // demanding they be armed anyway would make that switch impossible to use.
  const hooks = env.MY_COMMAND_HOOKS;
  if (hooks !== undefined && OFF.test(hooks.trim())) return 'MY_COMMAND_HOOKS=0';
  return null;
}

/**
 * Refuse a gated verb on a device whose gates are not registered. `armed: null` — a Codex
 * install, or a detector that could not answer — passes, matching the hooks' fail-open rule.
 * @param {string} verb
 * @param {Record<string, string | boolean | string[]>} flags
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{gated: boolean, armed: boolean | null, escape: string | null}}
 */
export function requireArmed(verb, flags, env = process.env) {
  if (!GATED_VERBS.has(verb)) return { gated: false, armed: null, escape: null };

  const via = armingEscape(flags, env);
  if (via) return { gated: true, armed: null, escape: via };

  const status = deviceHooksStatus();
  if (status.armed !== false) return { gated: true, armed: status.armed, escape: null };

  throw new ToolkitError(
    `the workflow gates are not armed on this device, so \`${verb}\` will not run. ` +
      `The Stop gate is what keeps a run from ending with no outcome recorded, and an ` +
      `unregistered hook is a file nobody executes — a run started here would have no gate at all.`,
    {
      armed: false,
      verb,
      reason: status.reason ?? null,
      missing: status.missing ?? [],
      settingsPath: status.settingsPath ?? null,
      arm: status.hint ?? 'npx @llevasseur/my-command',
      escape:
        'Run it anyway with `--unarmed`, or set MY_COMMAND_REQUIRE_HOOKS=0 for a genuinely ' +
        'hook-less environment such as CI. MY_COMMAND_HOOKS=0 already covers a device where ' +
        'the gates are switched off on purpose.',
    },
  );
}
