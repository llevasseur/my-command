#!/usr/bin/env node
// my-command-tools — the shared CLI behind the MyCommand slash commands.
//
// Every verb answers in JSON on stdout so a command reads one structured result
// instead of parsing porcelain it asked for in four separate calls. Judgment stays in
// the prompts; this owns the mechanics that are identical on every run.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ToolkitError } from './lib/proc.mjs';
import { GATED_VERBS, requireArmed } from './lib/require-armed.mjs';
import * as cleanup from './verbs/cleanup.mjs';
import * as commit from './verbs/commit.mjs';
import * as concepts from './verbs/concepts.mjs';
import * as doctor from './verbs/doctor.mjs';
import * as identity from './verbs/identity.mjs';
import * as pr from './verbs/pr.mjs';
import * as prs from './verbs/prs.mjs';
import * as scope from './verbs/scope.mjs';
import * as stash from './verbs/stash.mjs';
import * as state from './verbs/state.mjs';
import * as verify from './verbs/verify.mjs';
import * as worktree from './verbs/worktree.mjs';

/**
 * @typedef {object} Ctx
 * @property {string} verb
 * @property {string[]} positionals
 * @property {Record<string, string | boolean | string[]>} flags
 * @property {string} cwd
 */

/**
 * `line` is optional: a verb that declares one speaks a human status line by default.
 * @type {Record<string, {usage: string, run: (ctx: Ctx) => unknown, line?: (result: any) => string}>}
 */
const VERBS = {
  state,
  scope,
  verify,
  commit,
  pr,
  prs,
  worktree,
  cleanup,
  identity,
  concepts,
  stash,
  doctor,
};

// Flags that never take a value. Without this list the "next token is my value" rule
// below eats the token after a switch — `commit --compact a.md b.md` silently drops
// a.md from the commit, which is precisely the class of mistake this CLI exists to stop.
// A switch that wants an explicit value can still be spelled `--compact=false`.
const SWITCHES = new Set([
  'help',
  'compact',
  'draft',
  'retitle',
  'force',
  'bootstrap',
  'existing',
  'unarmed',
  'diff',
  'select',
  'json',
  'no-clipboard',
  'consume',
  'background',
  'keep-remote',
  'keep-local',
]);

/**
 * @param {string[]} argv
 * @returns {{verb: string, positionals: string[], flags: Record<string, string | boolean | string[]>}}
 */
export function parseArgs(argv) {
  // A leading flag means there is no verb — `my-command-tools --help` is help, not a
  // verb named `--help`. A bare `-` stays a positional; it is the read-from-stdin value.
  const leadsWithFlag = argv.length > 0 && argv[0].startsWith('-') && argv[0] !== '-';
  const verb = leadsWithFlag ? '' : (argv[0] ?? '');
  const rest = leadsWithFlag ? argv : argv.slice(1);
  /** @type {string[]} */
  const positionals = [];
  /** @type {Record<string, string | boolean | string[]>} */
  const flags = {};

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    // `-h` is the only short flag; spelling it long here keeps the rest of the parser
    // dealing with exactly one form.
    if (arg === '-h') {
      flags.help = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    let value;
    if (eq !== -1) value = arg.slice(eq + 1);
    else if (SWITCHES.has(key)) value = true;
    // A following token is this flag's value unless it is itself a flag.
    else if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) value = rest[++i];
    else value = true;

    const existing = flags[key];
    if (existing === undefined) flags[key] = value;
    else if (Array.isArray(existing)) existing.push(String(value));
    else flags[key] = [String(existing), String(value)];
  }

  return { verb, positionals, flags };
}

function helpText() {
  const names = Object.keys(VERBS).sort();
  return [
    'my-command-tools <verb> [options]',
    '',
    'Shared plumbing for the MyCommand slash commands. Prints JSON on stdout.',
    '',
    'Verbs:',
    ...names.map((n) => `  ${n}`),
    '',
    'Global options:',
    '  --cwd <path>   Run against a different directory.',
    '  --compact      Print single-line JSON instead of indented.',
    '  --unarmed      Run a gated verb on a device whose workflow gates are not armed.',
    "  --help, -h     Show this, or a verb's options with `<verb> --help`.",
    '',
    `Gated verbs (${[...GATED_VERBS].join(', ')}) refuse to run until the workflow gates are`,
    'registered, since a run started without them can end with no outcome recorded.',
    '`--unarmed` or MY_COMMAND_REQUIRE_HOOKS=0 is the deliberate escape for CI and for a',
    'fresh clone; MY_COMMAND_HOOKS=0 already covers a device with the gates switched off.',
    '',
    'Exit codes: 0 success · 1 the verb failed · 2 bad usage.',
  ].join('\n');
}

/**
 * Write one verb's answer: its `line` by default, the structured result under `--json`.
 * @param {{line?: (result: any) => string}} entry
 * @param {unknown} result
 * @param {Record<string, string | boolean | string[]>} flags
 * @param {number | undefined} indent
 */
function emit(entry, result, flags, indent) {
  if (entry.line && flags.json !== true) process.stdout.write(`${entry.line(result)}\n`);
  else process.stdout.write(`${JSON.stringify(result, null, indent)}\n`);
}

/**
 * @param {unknown} err @param {number | undefined} indent @returns {number}
 */
function emitError(err, indent) {
  const detail = err instanceof ToolkitError ? err.detail : {};
  const message = err instanceof Error ? err.message : String(err);
  process.stdout.write(`${JSON.stringify({ error: message, ...detail }, null, indent)}\n`);
  return err instanceof ToolkitError ? err.exitCode : 1;
}

/** @param {string[]} argv @returns {number} */
export function main(argv) {
  const { verb, positionals, flags } = parseArgs(argv);

  if (!verb || verb === 'help' || flags.help === true) {
    const target = verb === 'help' ? positionals[0] : verb;
    const topic = target && target !== 'help' ? VERBS[target] : undefined;
    if (target && target !== 'help' && !topic) {
      process.stderr.write(`unknown verb \`${target}\`\n\n${helpText()}\n`);
      return 2;
    }
    process.stdout.write(`${topic ? topic.usage : helpText()}\n`);
    return 0;
  }

  const entry = VERBS[verb];
  if (!entry) {
    process.stderr.write(`unknown verb \`${verb}\`\n\n${helpText()}\n`);
    return 2;
  }

  const cwd = typeof flags.cwd === 'string' ? flags.cwd : process.cwd();
  const indent = flags.compact ? undefined : 2;

  try {
    // Before the verb, not after: an unarmed device must not be able to start a run at all.
    requireArmed(verb, flags);
    const result = entry.run({ verb, positionals, flags, cwd });
    // A verb that answers over the network returns a promise. It prints and settles its own
    // exit code once it resolves, and the pending promise keeps the process alive until then.
    if (result instanceof Promise) {
      result.then(
        (value) => emit(entry, value, flags, indent),
        (err) => {
          process.exitCode = emitError(err, indent);
        },
      );
      return 0;
    }
    emit(entry, result, flags, indent);
    // Verbs that report a verdict set `pass`; surface it as the exit code so a caller
    // can branch on the shell result without re-reading the payload.
    const pass = /** @type {{pass?: boolean}} */ (result)?.pass;
    return pass === false ? 1 : 0;
  } catch (err) {
    return emitError(err, indent);
  }
}

// Importable for tests; only the direct invocation runs and exits.
// realpathSync on argv[1]: the shim and any bin symlink resolve to this real path,
// which is what import.meta.url reports.
const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(realpathSync(entryPath)).href) {
  const code = main(process.argv.slice(2));
  // Never `process.exit(0)`: an async verb is still settling, and exiting now would truncate
  // the answer it is about to print. Node exits 0 on its own once nothing is pending.
  if (code !== 0) process.exit(code);
}
