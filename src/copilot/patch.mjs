// The GitHub Copilot CLI install surface, derived at install time from the Codex skills and the
// Claude subagent definitions rather than kept as a fourth hand-written copy.
//
// Three layers, applied in order: substitutions every skill takes, exact-string patches one
// skill takes, and the host notes appended to all of them. Every patch names text that must be
// present, and every skill names text that must be gone afterwards, so a Codex skill edited out
// from under a patch fails the build instead of shipping half-translated.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The workflows that run on Copilot CLI: none needs the proxy, a hosted store, or a Claude transcript. */
export const COPILOT_SKILLS = [
  'changelog',
  'clean',
  'cp',
  'diagram',
  'docs',
  'fb',
  'god',
  'manage',
  'mc',
  'merge-deps',
  'pr',
  'review',
  'standup',
  'task',
  'task-bootstrap',
  'ticket',
  'truncate',
  'verify',
];

/** The subagent definitions those workflows dispatch. */
export const COPILOT_AGENTS = ['mycommand-delegate', 'mycommand-finisher', 'mycommand-reviewer', 'mycommand-verifier'];

/** Claude tool names to the Copilot CLI `tools:` aliases that cover them. */
const TOOL_ALIASES = /** @type {Record<string, string>} */ ({
  Bash: 'execute',
  Read: 'read',
  Edit: 'edit',
  Write: 'edit',
  Glob: 'search',
  Grep: 'search',
  WebFetch: 'web',
  WebSearch: 'web',
  TodoWrite: 'todo',
  Agent: 'agent',
});

export class CopilotPatchError extends Error {
  /** @param {string} file @param {string} message */
  constructor(file, message) {
    super(`${file}: ${message}`);
    this.name = 'CopilotPatchError';
  }
}

/**
 * @typedef {{find: string, replace: string} | {from: string, to: string, replace: string}} Patch
 * A `find` patch replaces one exact string; a `from`/`to` patch replaces the span from the first
 * through the end of the second, both inclusive.
 */

/** @type {Record<string, {patches?: Patch[], forbid?: string[]}>} */
const SKILL_PATCHES = {
  task: {
    patches: [
      { find: '`--no-implement`, `--jev`, and', replace: '`--no-implement`, and' },
      // The judgement layer is a claude-proxy client, so the whole record-only pass goes.
      { from: '`--jev` asks an optional judgement layer', to: 'prose, no transcript.\n\n', replace: '' },
    ],
    forbid: ['--jev', 'TYPESAFE_API_KEY', '`noul`'],
  },
  manage: {
    patches: [
      { find: '`--delegate task|god|fb|work|work:god`', replace: '`--delegate task|god|fb`' },
      {
        find: '`task` (default), `god`, `fb`, `work`, or `work:god`.',
        replace:
          '`task` (default), `god`, or `fb`. No other delegate is installed on this host, so naming one is a stop before planning, never a fallback.',
      },
      {
        from: ' **`work` cuts no branch either, for the opposite reason: it cuts many.**',
        to: 'like `god` it must be typed and is never inherited.',
        replace: '',
      },
      { find: 'forwarded to each `task`, `god`, and `work` unit', replace: 'forwarded to each `task` and `god` unit' },
      {
        from: '### The `work on` form\n',
        to: 'comes back as one failed unit like any other.\n\n',
        replace: '',
      },
      {
        from: '- The **ideas** workflow — `work` and `work:god` —',
        to: 'and the answer is a plain `work` unit.\n',
        replace: '',
      },
      {
        find: 'a draft pull request under `--delegate god` or `work:god` is the one stop',
        replace: 'a draft pull request under `--delegate god` is the one stop',
      },
      {
        from: ' Under the `work on` form the units are the areas,',
        to: 'which already selects the union of several areas by itself.',
        replace: '',
      },
      {
        from: ', and none for a `work` unit either,',
        to: 'names a branch per idea when it claims it',
        replace: '',
      },
      {
        from: ' — a `work` unit is the one that cannot answer it,',
        to: "the ideas workflow's to discover",
        replace: '',
      },
      // Copilot CLI's todo tool takes markdown and has no task-dependency links, so the graph
      // becomes a wave plan written in it.
      {
        from: '**Record the dependency graph in the harness task list, not in a file**',
        to: 'A dry run prints the plan and stops here, before any task is created.',
        replace:
          "**Record the dependency graph as a markdown wave plan in this session's todo list, not in a file** — one `Wave <n>` heading per wave in dispatch order, and under it one checkbox per unit naming its branch, its base, and the units it waits on. A unit's wave is one past the latest wave of anything it waits on, so the order of the headings is the dependency order. Tick a unit when its report is collected, and mark a failed one with its cause instead. The todo list is live session state that a compaction carries forward and this prompt is not, so after a summary it is the only surviving record of what was dispatched and what is still owed. That is the same reasoning behind anchoring the closing turn, and it is why this workflow builds **no second task store, no progress file, and no status dashboard**. A dry run prints the plan and stops here, before any todo item is written.",
      },
      { find: 'a merging unit — `god` or `work:god` — prints', replace: 'a merging unit — `god` — prints' },
      {
        from: ', and a `work` unit prints its **area** where the others print a branch and a cut point,',
        to: 'undetermined until the ledger is read',
        replace: '',
      },
      { find: 'For every unit except a `work` one, run', replace: 'For every unit, run' },
      {
        from: '   **`work` is the exception, and only because it cannot be otherwise.**',
        to: 'resolve there rather than here.\n\n',
        replace: '',
      },
      {
        from: ' — **one line per idea it built, with the slug, for a `work` unit,',
        to: 'rather than a single pull request** — and',
        replace: ' and',
      },
    ],
    forbid: ['work:god', '`work`', 'ideas workflow', 'ledger', 'harness task list'],
  },
  review: {
    patches: [
      {
        find: '2. Independently inspect the PR body,',
        replace:
          "2. Dispatch `mycommand-reviewer` with `task` for this inspection, handing it the PR number, the checkout path, and any focus. Its findings are this step's result, and it applies none. If that agent is not installed, independently inspect the PR body,",
      },
    ],
  },
};

/** Substitutions every Copilot skill takes, after its own patches. */
const SHARED = [
  // Codex invokes a skill as `$name`; Copilot CLI as `/name`.
  /** @param {string} text @param {string} file */
  (text, file) =>
    text.replace(/\$([a-z][a-z-]*[a-z])\b/g, (whole, name) => {
      if (COPILOT_SKILLS.includes(name)) return `/${name}`;
      if (SKILL_NAMES.has(name)) throw new CopilotPatchError(file, `references $${name}, which is not on this host`);
      return whole;
    }),
  /** @param {string} text */
  (text) => text.replaceAll('.codex/worktrees', '.copilot/worktrees'),
  /** @param {string} text */
  (text) => text.replace(/\bworktree begin\b(?! --host)/g, 'worktree begin --host copilot'),
  /** @param {string} text */
  (text) => text.replaceAll('~/.codex', '~/.copilot'),
  /** @param {string} text */
  (text) => text.replace(/\bCodex\b/g, 'Copilot CLI'),
  /** @param {string} text */
  (text) => text.replaceAll('SendMessage', '`write_agent`'),
];

/** Every skill this repo ships, so a reference to one that is not on this host is caught. */
const SKILL_NAMES = new Set(
  readdirSync(join(HERE, '..', '..', 'skills')).filter((name) =>
    existsSync(join(HERE, '..', '..', 'skills', name, 'SKILL.md')),
  ),
);

/** @param {string} text @param {Patch} patch @param {string} file */
function applyPatch(text, patch, file) {
  if ('find' in patch) {
    const at = text.indexOf(patch.find);
    if (at < 0) throw new CopilotPatchError(file, `patch anchor not found: ${JSON.stringify(patch.find)}`);
    return text.slice(0, at) + patch.replace + text.slice(at + patch.find.length);
  }
  const start = text.indexOf(patch.from);
  if (start < 0) throw new CopilotPatchError(file, `patch start not found: ${JSON.stringify(patch.from)}`);
  const end = text.indexOf(patch.to, start);
  if (end < 0) throw new CopilotPatchError(file, `patch end not found after its start: ${JSON.stringify(patch.to)}`);
  return text.slice(0, start) + patch.replace + text.slice(end + patch.to.length);
}

/**
 * The Copilot CLI `SKILL.md` for one workflow, from its Codex skill.
 * @param {string} name @param {string} codex the Codex `SKILL.md`
 * @returns {string}
 */
export function copilotSkill(name, codex) {
  const file = `skills/${name}/SKILL.md`;
  const own = SKILL_PATCHES[name] ?? {};
  let text = codex;
  for (const patch of own.patches ?? []) text = applyPatch(text, patch, file);
  for (const substitute of SHARED) text = substitute(text, file);
  for (const gone of own.forbid ?? []) {
    if (text.includes(gone)) throw new CopilotPatchError(file, `still mentions ${JSON.stringify(gone)} after patching`);
  }
  const notes = readFileSync(join(HERE, 'host-notes.md'), 'utf8');
  return `${text.trimEnd()}\n\n${notes}`;
}

/** @type {Record<string, Patch[]>} */
const AGENT_PATCHES = {
  'mycommand-delegate': [
    { find: '/task, /god, /fb or /work', replace: '/task, /god or /fb' },
    { find: 'Dispatched one per unit by /work, /manage and /improve.', replace: 'Dispatched one per unit by /manage.' },
  ],
  'mycommand-finisher': [
    {
      find: 'Invoke both with the Skill tool.',
      replace: 'Load each from its `SKILL.md` under `~/.copilot/skills` and follow it in this conversation.',
    },
    {
      find: "so you do not own it: `ExitWorktree` will refuse, and `git worktree remove` will refuse too\nwhile the owner's lock is live.",
      replace: "so you do not own it: `git worktree remove` will refuse while the owner's lock is live.",
    },
  ],
  'mycommand-verifier': [
    { find: 'continued with SendMessage', replace: 'continued with write_agent' },
    {
      find: 'Open each screenshot from this\n   round with `Read`',
      replace: 'Open each screenshot from this\n   round with `view`',
    },
    { find: 'absolute path; `Read` it.', replace: 'absolute path; `view` it.' },
  ],
};

/**
 * The Copilot CLI custom agent for one subagent definition, from the Claude one: the tool list
 * rewritten to Copilot's aliases, and `model` dropped so the agent inherits the session's model,
 * since the Claude tier names mean nothing to Copilot's model picker.
 * @param {string} name @param {string} claude the Claude `agents/<name>.md`
 * @returns {string}
 */
export function copilotAgent(name, claude) {
  const file = `agents/${name}.md`;
  const match = /^---\n([\s\S]*?)\n---\n/.exec(claude);
  if (!match) throw new CopilotPatchError(file, 'no frontmatter block');
  let body = claude.slice(match[0].length);
  let front = match[1];
  for (const patch of AGENT_PATCHES[name] ?? []) {
    const target = 'find' in patch && front.includes(patch.find) ? 'front' : 'body';
    if (target === 'front') front = applyPatch(front, patch, file);
    else body = applyPatch(body, patch, file);
  }
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell expansion the agent types, not a JS placeholder.
  body = body.replaceAll('$CLAUDE_JOB_DIR/tmp', '${TMPDIR:-/tmp}/my-command');

  const lines = front.split('\n').filter((line) => !line.startsWith('model:'));
  const tools = lines.findIndex((line) => line.startsWith('tools:'));
  if (tools < 0) throw new CopilotPatchError(file, 'no tools line');
  const declared = lines[tools].slice('tools:'.length).trim();
  const aliases =
    declared === '"*"' || declared === '*'
      ? ['*']
      : [
          ...new Set(
            declared
              .split(',')
              .map((tool) => tool.trim())
              // Skill has no Copilot alias: a finisher reads each skill's file instead.
              .filter((tool) => tool !== 'Skill')
              .map((tool) => {
                const alias = TOOL_ALIASES[tool];
                if (!alias) throw new CopilotPatchError(file, `no Copilot CLI alias for tool ${tool}`);
                return alias;
              }),
          ),
        ];
  lines[tools] = `tools: ${JSON.stringify(aliases)}`;

  for (const leftover of ['SendMessage', 'ExitWorktree', 'EnterWorktree', 'Skill tool', '$CLAUDE_JOB_DIR']) {
    if (body.includes(leftover) || lines.join('\n').includes(leftover)) {
      throw new CopilotPatchError(file, `still mentions ${leftover} after porting`);
    }
  }
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

/**
 * Every file the Copilot CLI surface installs, keyed by its path under the Copilot config
 * directory: `skills/<name>/SKILL.md` and `agents/<name>.agent.md`.
 * @param {string} pkgRoot the repo or package root holding `skills/` and `agents/`
 * @returns {Map<string, string>}
 */
export function buildCopilot(pkgRoot) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const name of COPILOT_SKILLS) {
    const codex = readFileSync(join(pkgRoot, 'skills', name, 'SKILL.md'), 'utf8');
    out.set(join('skills', name, 'SKILL.md'), copilotSkill(name, codex));
    // A skill's on-demand reference files sit beside it, and its SKILL.md points at them there.
    const refs = join(pkgRoot, 'skills', name, 'references');
    if (!existsSync(refs)) continue;
    for (const ref of readdirSync(refs).filter((f) => f.endsWith('.md'))) {
      const path = join('skills', name, 'references', ref);
      let text = readFileSync(join(pkgRoot, path), 'utf8');
      for (const substitute of SHARED) text = substitute(text, path);
      out.set(path, text);
    }
  }
  for (const name of COPILOT_AGENTS) {
    const claude = readFileSync(join(pkgRoot, 'agents', `${name}.md`), 'utf8');
    out.set(join('agents', `${name}.agent.md`), copilotAgent(name, claude));
  }
  return out;
}
