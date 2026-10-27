// `workflow` — the repository's workflow contract, and the state of one spec folder.
//
// A contract lets one repository opt into a different shape of run (a spec branch with a
// stacked implementation branch, a spec-centred review) without the commands hardcoding
// it. The local copy lives inside the git common dir, so it is shared by every worktree of
// the clone and can never be committed: one developer can follow a team's workflow without
// landing anything in that team's repository.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { str } from '../lib/flags.mjs';
import { asRecord } from '../lib/json.mjs';
import { run as exec, must, ToolkitError } from '../lib/proc.mjs';
import { repoRoot } from '../lib/repo.mjs';

export const usage = `workflow [--spec <dir>]

Print this repository's workflow contract as JSON, and where a local one is read from.

  --spec <dir>   Also report one spec folder: its files, the open
                 [NEEDS CLARIFICATION] markers in spec.md, the tasks.md checkbox
                 counts, and the spec branch with whether origin has it.

The contract is read from the first of:
  1. <git common dir>/my-command/workflow.json — local to this clone, shared by its
     worktrees, never committed. Reported as \`localPath\` whether or not it exists.
  2. scripts/bootstrap-worktree.sh --print-workflow-contract — the repository's own.
With neither, \`contract\` is null and every command keeps its default behaviour.`;

const MARKER = '[NEEDS CLARIFICATION';

/** @param {string} cwd @returns {string} */
export function localContractPath(cwd) {
  const common = must('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd });
  return join(common, 'my-command', 'workflow.json');
}

/**
 * @param {string} cwd
 * @returns {{source: 'local' | 'repo' | null, contract: Record<string, unknown> | null}}
 */
export function readContract(cwd) {
  const local = localContractPath(cwd);
  if (existsSync(local)) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(local, 'utf8'));
    } catch (err) {
      throw new ToolkitError(`${local} is not valid JSON: ${err instanceof Error ? err.message : err}`, {
        localPath: local,
      });
    }
    const contract = asRecord(parsed);
    if (!contract) throw new ToolkitError(`${local} must hold a JSON object`, { localPath: local });
    return { source: 'local', contract };
  }

  const script = join(cwd, 'scripts', 'bootstrap-worktree.sh');
  if (existsSync(script)) {
    const r = exec('bash', [script, '--print-workflow-contract'], { cwd });
    if (r.ok && r.stdout) {
      try {
        const contract = asRecord(JSON.parse(r.stdout));
        if (contract) return { source: 'repo', contract };
      } catch {
        // A bootstrap that does not know the flag prints its usage instead of JSON.
      }
    }
  }
  return { source: null, contract: null };
}

/** @param {string} text @returns {number} */
function countMarkers(text) {
  return text.split(MARKER).length - 1;
}

/**
 * The branch spec.md names on its `**Feature Branch**:` line, else the folder's own name,
 * which is the name the spec tooling gives the branch it creates.
 * @param {string} specText @param {string} dir
 */
function specBranch(specText, dir) {
  const m = specText.match(/\*\*Feature Branch\*\*:\s*`([^`]+)`/);
  return m ? m[1] : basename(dir);
}

/** @param {string} cwd @param {string} given */
export function specState(cwd, given) {
  const dir = isAbsolute(given) ? given : resolve(cwd, given);
  if (!existsSync(dir)) {
    return { dir, exists: false, files: [], clarifications: 0, tasks: null, branch: null, branchOnOrigin: false };
  }
  const files = readdirSync(dir).sort();
  const specPath = join(dir, 'spec.md');
  const specText = existsSync(specPath) ? readFileSync(specPath, 'utf8') : '';
  let clarifications = countMarkers(specText);
  for (const name of ['plan.md', 'tasks.md']) {
    const p = join(dir, name);
    if (existsSync(p)) clarifications += countMarkers(readFileSync(p, 'utf8'));
  }

  const tasksPath = join(dir, 'tasks.md');
  const tasksText = existsSync(tasksPath) ? readFileSync(tasksPath, 'utf8') : null;
  const tasks = tasksText
    ? {
        open: (tasksText.match(/^\s*[-*] \[ \]/gm) ?? []).length,
        done: (tasksText.match(/^\s*[-*] \[[xX]\]/gm) ?? []).length,
      }
    : null;

  const branch = specText ? specBranch(specText, dir) : basename(dir);
  const remote = exec('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch], { cwd });

  return { dir, exists: true, files, clarifications, tasks, branch, branchOnOrigin: remote.ok };
}

/**
 * @param {import('../cli.mjs').Ctx} ctx
 * @returns {ReturnType<typeof readContract> & {localPath: string, spec?: ReturnType<typeof specState>}}
 */
export function run(ctx) {
  const cwd = repoRoot(ctx.cwd);
  const { source, contract } = readContract(cwd);
  const result = { localPath: localContractPath(cwd), source, contract };
  const spec = str(ctx.flags.spec);
  return spec ? { ...result, spec: specState(cwd, spec) } : result;
}
