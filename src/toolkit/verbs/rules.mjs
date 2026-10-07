// `rules` — list the counted rules, record a prose rule's fire, and report the rules that have
// stopped firing on current models as retirement candidates.
//
// The registry and the fire record live in `src/hooks/lib/rules.mjs`, because the gates write
// to them on every first refusal and a gate cannot depend on the toolkit being installed. They
// are imported lazily for the reason `trim` gives: the Codex installer ships the toolkit without
// the hooks, and a top-level import would take every verb down with this one.
//
// **The report is read-only toward the commands.** It names candidates and stops. Retiring a
// rule is an edit to a command or a gate, made by a person or a /task run that chose to.
import { bool, list, str } from '../lib/flags.mjs';
import { ToolkitError, UsageError } from '../lib/proc.mjs';

export const usage = `rules <list|fire|report> [options]

Count how often each command rule fires, so a rule that no longer fires on
current models can be found and retired.

  rules list
      Every counted rule: its stable id, kind (gate or prose), source, summary.

  rules fire --rule <prose id> [--model <m>] [--at <iso>] [--session <id>]
             [--suggestion <id>] [--bucket <n>] [--thread <id>]
      Record one fire of a prose rule. /judge calls this for a CONFIRMED
      suggestion that shows the shape a prose rule forbids. Gate rules record
      their own fires on first refusal and are refused here.

  rules report [--days <n>] [--model <m>]... [--max <n>] [--all]
      Rules with at most --max fires (default 1) in the last --days (default
      30) on current models, as retirement candidates. Current models are the
      --model values given, or else every model that fired anything in the
      window. --all lists every rule with its count, not only candidates.

Fires are appended to one JSONL file beside the claude-proxy store: the parent
of CLAUDE_PROXY_STORE when it is set, beside the gates' hooks.log otherwise,
and MY_COMMAND_RULE_FIRES overrides both. The report retires nothing.

Exit codes: 0 success · 1 the hooks library is not installed · 2 bad usage.`;

/** Below this many distinct sessions in the window, zero fires says little. */
const THIN_SESSIONS = 10;

/**
 * @typedef {import('../../hooks/lib/rules.mjs').Rule} Rule
 * @typedef {import('../../hooks/lib/rules.mjs').Fire} Fire
 */

/** @returns {Promise<typeof import('../../hooks/lib/rules.mjs')>} */
async function rulesLib() {
  try {
    return await import('../../hooks/lib/rules.mjs');
  } catch {
    throw new ToolkitError('the workflow gates are not installed beside this toolkit, so there is no rule registry', {
      expected: 'hooks/lib/rules.mjs beside toolkit/',
    });
  }
}

/**
 * A whole number from a flag, or the default when the flag is absent.
 * @param {string | undefined} text @param {string} name @param {number} fallback
 * @returns {number}
 */
function count(text, name, fallback) {
  if (text === undefined) return fallback;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0) throw new UsageError(`--${name} must be a whole number, not \`${text}\``);
  return n;
}

/**
 * The retirement report, as a pure function of the registry and the fires, so the test can
 * hand it both.
 * @param {{rules: Rule[], fires: Fire[], now: number, days: number, models: string[],
 *   max: number, all?: boolean, path?: string}} input
 */
export function report({ rules, fires, now, days, models, max, all = false, path }) {
  const since = now - days * 86_400_000;
  const inWindow = fires.filter((f) => {
    const at = Date.parse(f.at);
    return Number.isFinite(at) && at >= since && at <= now;
  });
  const current = models.length
    ? [...new Set(models)].sort()
    : [...new Set(inWindow.map((f) => f.model).filter((m) => m !== null))].sort();
  const counted = inWindow.filter((f) => f.model !== null && current.includes(f.model));

  /** @type {Map<string, number>} */
  const perRule = new Map();
  for (const f of counted) perRule.set(f.rule, (perRule.get(f.rule) ?? 0) + 1);

  /** The most recent fire of each rule, on any model and at any time. @type {Map<string, Fire>} */
  const last = new Map();
  for (const f of fires) {
    const prev = last.get(f.rule);
    if (!prev || Date.parse(f.at) > Date.parse(prev.at)) last.set(f.rule, f);
  }

  const rows = rules.map((rule) => {
    const lastFire = last.get(rule.id);
    return {
      id: rule.id,
      kind: rule.kind,
      source: rule.source,
      summary: rule.summary,
      fires: perRule.get(rule.id) ?? 0,
      lastFire: lastFire ? { at: lastFire.at, model: lastFire.model } : null,
    };
  });
  const candidates = rows
    .filter((row) => row.fires <= max)
    .sort((a, b) => a.fires - b.fires || a.id.localeCompare(b.id));

  const known = new Set(rules.map((r) => r.id));
  const sessions = new Set(counted.map((f) => f.session).filter(Boolean)).size;
  const hookFires = counted.filter((f) => f.origin === 'hook').length;
  const proseFires = counted.filter((f) => f.origin !== 'hook').length;

  /** @type {string[]} */
  const notes = ['Read-only: this lists candidates and retires nothing.'];
  if (current.length === 0) {
    notes.push('No fires carry a model in this window, so there are no current models to count against.');
  }
  if (sessions < THIN_SESSIONS) {
    notes.push(
      `Only ${sessions} session${sessions === 1 ? '' : 's'} fired anything in this window. ` +
        'Sessions where nothing fired are not recorded, so a zero here is weak evidence until the record grows.',
    );
  }
  if (hookFires === 0) {
    notes.push('No gate fired in this window. If the gates are off (MY_COMMAND_HOOKS=0), every gate reads as zero.');
  }
  if (proseFires === 0) {
    notes.push('No prose rule fired in this window. Prose fires come only from /judge confirmations.');
  }

  return {
    path: path ?? null,
    window: { days, since: new Date(since).toISOString(), until: new Date(now).toISOString() },
    models: current,
    modelsFrom: models.length ? 'flag' : 'fires',
    max,
    fires: counted.length,
    sessions,
    rules: rules.length,
    candidates,
    unknownRules: [...new Set(fires.map((f) => f.rule).filter((id) => !known.has(id)))].sort(),
    notes,
    // Undefined drops out of the printed JSON, so `all` appears only when asked for.
    all: all ? rows : undefined,
  };
}

/** @param {import('../cli.mjs').Ctx} ctx */
export async function run(ctx) {
  const sub = ctx.positionals[0];
  if (sub === undefined) throw new UsageError('rules needs a subcommand: list, fire, or report');
  if (!['list', 'fire', 'report'].includes(sub)) {
    throw new UsageError(`rules has no subcommand \`${sub}\``, { subcommands: ['list', 'fire', 'report'] });
  }
  const lib = await rulesLib();

  if (sub === 'list') {
    return { path: lib.firesPath(), rules: lib.RULES };
  }

  if (sub === 'fire') {
    const id = str(ctx.flags.rule);
    if (id === undefined) throw new UsageError('rules fire needs --rule <prose id>');
    const rule = lib.ruleById(id);
    if (!rule) {
      throw new UsageError(`there is no rule \`${id}\``, {
        prose: lib.RULES.filter((r) => r.kind === 'prose').map((r) => r.id),
      });
    }
    if (rule.kind !== 'prose') {
      throw new UsageError(`\`${id}\` is a gate, and gates record their own fires on first refusal`);
    }
    const at = str(ctx.flags.at);
    if (at !== undefined && !Number.isFinite(Date.parse(at))) {
      throw new UsageError(`--at must be a date, not \`${at}\``);
    }
    const row = lib.recordFire(id, {
      model: str(ctx.flags.model) ?? null,
      session: str(ctx.flags.session) ?? '',
      at: at === undefined ? undefined : new Date(at).toISOString(),
      origin: 'judge',
      suggestion: str(ctx.flags.suggestion),
      bucket: str(ctx.flags.bucket),
      thread: str(ctx.flags.thread),
    });
    if (row === null) throw new ToolkitError('the fire could not be written', { path: lib.firesPath() });
    return { recorded: true, path: lib.firesPath(), fire: row };
  }

  const path = lib.firesPath();
  return report({
    rules: lib.RULES,
    fires: lib.readFires(path),
    now: Date.now(),
    days: count(str(ctx.flags.days), 'days', 30),
    models: list(ctx.flags.model),
    max: count(str(ctx.flags.max), 'max', 1),
    all: bool(ctx.flags.all),
    path,
  });
}
