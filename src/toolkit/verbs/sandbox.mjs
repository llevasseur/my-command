// `sandbox` — one private GitHub repo per `/ab` arm, generated from a template the user
// names and cloned under `~/.my-command/ab/sandboxes/<arm>/`. The template's
// `scripts/reset-scenario.sh` puts both into one named scenario.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { bool, str } from '../lib/flags.mjs';
import { ownerToken, parseAccounts } from '../lib/gh.mjs';
import { run as exec, ToolkitError, UsageError } from '../lib/proc.mjs';

export const usage = `sandbox init|reset|status|destroy [options]

The two private GitHub repos /ab arms run against, one per arm (a and b), each generated
from a template repo you own and cloned under <root>/<arm>/.

  init                  Create each repo from the template if it is absent, and clone it
                        if the clone is absent. An existing repo or clone is reused.
  reset --scenario <n>  Fetch each clone, then run its scripts/reset-scenario.sh against
                        its repo. --dry-run is passed through and changes nothing.
  status                Report both sandboxes. Reads only; creates and fetches nothing.
  destroy --yes         Delete both repos and both clones. Needs the delete_repo scope on
                        the owner's gh login; a missing scope is reported, never requested.

Options (each falls back to an env var, then ~/.my-command/ab/config.json):
  --owner <login>          Owner of both sandbox repos. Then $MY_COMMAND_AB_OWNER, then
                           config "owner", then the active gh login. The gh-login fallback is
                           refused when more than one account is logged in to github.com.
  --template <owner/name>  Template repo. Then $MY_COMMAND_AB_TEMPLATE, then config
                           "template". No default: init and reset fail without one.
  --name-a <name>          Arm a's repo name. Default my-command-ab-a.
  --name-b <name>          Arm b's repo name. Default my-command-ab-b.
  --root <dir>             Where the clones live. Then $MY_COMMAND_SANDBOX_ROOT, then config
                           "root", then ~/.my-command/ab/sandboxes.
  --git-host <host>        SSH host clones use: git@<host>:<owner>/<name>.git. Then
                           $MY_COMMAND_GIT_HOST, then config "gitHost", then github.com. Set it
                           to an ~/.ssh/config alias where plain github.com is another account.
  --fixture-remote <url>   reset: where the scenario refs come from. Default $FIXTURE_REMOTE,
                           then the template over --git-host.

Each sandbox reports arm, nameWithOwner, url, clone, cloneUrl, defaultBranch, and env:
CLAUDE_PROXY_STORE and LOG_DIR pointing at the clone's synthetic claude-proxy store, or
nothing plus a warning when the template carries no such store.`;

const DEFAULTS = {
  'name-a': 'my-command-ab-a',
  'name-b': 'my-command-ab-b',
};

/** The keys `~/.my-command/ab/config.json` may set. */
const CONFIG_KEYS = ['template', 'owner', 'gitHost', 'root'];

/**
 * `~/.my-command/ab/config.json`, or `{}` when there is none. A file that exists and does
 * not parse, or sets a key to something other than a non-empty string, is refused rather than
 * read around.
 * @returns {{path: string, values: Partial<Record<'template' | 'owner' | 'gitHost' | 'root', string>>}}
 */
function readConfigFile() {
  const path = join(homedir(), '.my-command', 'ab', 'config.json');
  if (!existsSync(path)) return { path, values: {} };
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ToolkitError(`${path} is not valid JSON: ${/** @type {Error} */ (err).message}`, { configPath: path });
  }
  // JSON.parse builds plain objects and primitive strings, so the constructor names the JSON type.
  if (/** @type {{constructor?: unknown} | null} */ (parsed)?.constructor !== Object) {
    throw new ToolkitError(`${path} must hold a JSON object with ${CONFIG_KEYS.join(', ')}`, { configPath: path });
  }
  /** @type {Record<string, string>} */
  const values = {};
  for (const key of CONFIG_KEYS) {
    const v = /** @type {Record<string, unknown>} */ (parsed)[key];
    if (v === undefined) continue;
    if (/** @type {{constructor?: unknown} | null} */ (v)?.constructor !== String || String(v).trim() === '') {
      throw new ToolkitError(`${path}: "${key}" must be a non-empty string`, { configPath: path, key });
    }
    values[key] = String(v);
  }
  return { path, values };
}

/**
 * The owner when no flag, env var or config names one: the active gh login, but only when it
 * is the only github.com login. With two, the active one is whichever was switched to last,
 * and the sandboxes would land under it silently.
 * @returns {string}
 */
function ghLogin() {
  const status = exec('gh', ['auth', 'status', '--hostname', 'github.com']);
  if (status.missing) throw new ToolkitError('`gh` is not on PATH');
  const logins = parseAccounts(`${status.stdout}\n${status.stderr}`).map((a) => a.login);
  if (logins.length > 1) {
    throw new UsageError(
      `more than one gh account is logged in to github.com (${logins.join(', ')}), so the sandbox owner ` +
        'cannot be taken from the active login. Pass --owner <login>, set MY_COMMAND_AB_OWNER, or set "owner" ' +
        'in ~/.my-command/ab/config.json.',
      { accounts: logins },
    );
  }
  const r = exec('gh', ['api', 'user', '--jq', '.login']);
  if (!r.ok || !r.stdout) {
    throw new UsageError(
      'no sandbox owner: pass --owner <login>, set MY_COMMAND_AB_OWNER, set "owner" in ' +
        '~/.my-command/ab/config.json, or log in with `gh auth login`.',
      { stderr: r.stderr },
    );
  }
  return r.stdout;
}

/** `gh repo view` on a repo that does not exist, or one this token cannot see. */
const ABSENT = /Could not resolve to a Repository|HTTP 404|not found/i;

/** `gh repo delete` without the scope it needs. */
const NO_DELETE_SCOPE = /delete_repo/i;

/**
 * @typedef {object} Config
 * @property {string} owner
 * @property {'flag' | 'env' | 'config' | 'gh-login'} ownerSource
 * @property {string | null} template  Null when nothing names one; init and reset refuse that.
 * @property {string} root
 * @property {string} gitHost
 * @property {Record<string, string>} env  gh's environment: the owner's token when the device has it.
 * @property {string} identity
 * @property {{arm: 'a' | 'b', name: string}[]} arms
 */

/**
 * Flags, then env, then the config file, then the built-in fallback, for every setting.
 * @param {import('../cli.mjs').Ctx} ctx
 * @param {boolean} needsTemplate  Checked before the owner, so a missing template costs no gh call.
 * @returns {Config}
 */
function config(ctx, needsTemplate) {
  const f = ctx.flags;
  const file = readConfigFile().values;

  const template = str(f.template) || process.env.MY_COMMAND_AB_TEMPLATE || file.template || null;
  if (template === null && needsTemplate) {
    throw new UsageError(
      'no sandbox template: pass --template <owner/name>, set MY_COMMAND_AB_TEMPLATE, or set "template" in ' +
        '~/.my-command/ab/config.json. /ab-bootstrap will write that config file.',
    );
  }
  if (template !== null && !/^[^/\s]+\/[^/\s]+$/.test(template)) {
    throw new UsageError(`the template must be <owner/name>, got '${template}'`);
  }
  const root =
    str(f.root) ||
    process.env.MY_COMMAND_SANDBOX_ROOT ||
    file.root ||
    join(homedir(), '.my-command', 'ab', 'sandboxes');
  const gitHost = str(f['git-host']) || process.env.MY_COMMAND_GIT_HOST || file.gitHost || 'github.com';

  /** @type {[string | undefined, Config['ownerSource']][]} */
  const named = [
    [str(f.owner), 'flag'],
    [process.env.MY_COMMAND_AB_OWNER, 'env'],
    [file.owner, 'config'],
  ];
  const hit = named.find(([v]) => v);
  const [owner, ownerSource] = hit
    ? [/** @type {string} */ (hit[0]), hit[1]]
    : [ghLogin(), /** @type {const} */ ('gh-login')];

  // Every gh call runs as the owner: another active account cannot see the private sandboxes.
  const token = ownerToken(owner);
  return {
    owner,
    ownerSource,
    template,
    root,
    gitHost,
    env: token ? { GH_TOKEN: token } : {},
    identity: token ? `owner-scoped token (${owner})` : 'active account',
    arms: [
      { arm: 'a', name: str(f['name-a']) ?? DEFAULTS['name-a'] },
      { arm: 'b', name: str(f['name-b']) ?? DEFAULTS['name-b'] },
    ],
  };
}

/** @param {Config} c @param {string} slug */
const sshUrl = (c, slug) => `git@${c.gitHost}:${slug}.git`;

/** @param {Config} c @param {string[]} args @param {string} [cwd] */
function gh(c, args, cwd) {
  const r = exec('gh', args, { cwd, env: c.env });
  if (r.missing) throw new ToolkitError('`gh` is not on PATH', { args });
  return r;
}

/**
 * The repo as GitHub reports it, or null when it does not exist.
 * @param {Config} c @param {string} slug
 * @returns {{nameWithOwner: string, url: string, defaultBranch: string | null} | null}
 */
function view(c, slug) {
  const r = gh(c, ['repo', 'view', slug, '--json', 'nameWithOwner,url,defaultBranchRef']);
  if (!r.ok) {
    if (ABSENT.test(r.stderr)) return null;
    throw new ToolkitError(`gh repo view ${slug} failed`, { code: r.code, stderr: r.stderr });
  }
  const json = JSON.parse(r.stdout);
  return { nameWithOwner: json.nameWithOwner, url: json.url, defaultBranch: json.defaultBranchRef?.name ?? null };
}

/**
 * What is on disk at a clone path: nothing, a git clone (and where its origin points), or
 * something else that must not be cloned over.
 * @param {string} path
 * @returns {{state: 'absent' | 'clone' | 'occupied', origin: string | null, branch: string | null}}
 */
function inspectClone(path) {
  if (!existsSync(path) || readdirSync(path).length === 0) return { state: 'absent', origin: null, branch: null };
  if (!existsSync(join(path, '.git'))) return { state: 'occupied', origin: null, branch: null };
  const origin = exec('git', ['-C', path, 'remote', 'get-url', 'origin']);
  const branch = exec('git', ['-C', path, 'symbolic-ref', '--quiet', '--short', 'HEAD']);
  return { state: 'clone', origin: origin.ok ? origin.stdout : null, branch: branch.ok ? branch.stdout : null };
}

/** Whether a remote URL names `slug`, over any host or protocol. @param {string | null} url @param {string} slug */
const pointsAt = (url, slug) =>
  url !== null &&
  url
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase()
    .endsWith(slug.toLowerCase());

/**
 * One sandbox's report: the fields every subcommand prints.
 * @param {Config} c @param {{arm: string, name: string}} a
 * @param {{nameWithOwner: string, url: string, defaultBranch: string | null} | null} repo
 */
function describe(c, a, repo) {
  const slug = `${c.owner}/${a.name}`;
  const clone = join(c.root, a.arm);
  const storeRoot = join(clone, 'fixtures', 'claude-proxy-store');
  const local = inspectClone(clone);
  const hasStore = existsSync(storeRoot);
  /** @type {Record<string, unknown>} */
  const report = {
    arm: a.arm,
    nameWithOwner: repo?.nameWithOwner ?? slug,
    url: repo?.url ?? null,
    clone,
    cloneUrl: sshUrl(c, slug),
    defaultBranch: repo?.defaultBranch ?? null,
    repo: repo ? 'present' : 'absent',
    local: { state: local.state, origin: local.origin, branch: local.branch },
    // The claude-proxy readers take the log dir as the store's parent and pin LOG_DIR to it.
    // Exported only when the store is on disk: a path that does not exist reads as an empty store.
    env: hasStore ? { CLAUDE_PROXY_STORE: join(storeRoot, 'logs', 'sessions'), LOG_DIR: join(storeRoot, 'logs') } : {},
  };
  if (local.state === 'clone' && !hasStore) {
    report.warning =
      'the template has no synthetic store (fixtures/claude-proxy-store/), so this arm exports no ' +
      'CLAUDE_PROXY_STORE or LOG_DIR';
  }
  return report;
}

/** @param {Config} c @param {{arm: 'a' | 'b', name: string}} a */
function initOne(c, a) {
  const slug = `${c.owner}/${a.name}`;
  let repo = view(c, slug);
  let created = false;
  if (!repo) {
    // config() refused init without a template.
    const template = /** @type {string} */ (c.template);
    const r = gh(c, ['repo', 'create', slug, '--template', template, '--private', '--include-all-branches']);
    if (!r.ok) throw new ToolkitError(`gh repo create ${slug} failed`, { arm: a.arm, stderr: r.stderr });
    created = true;
    repo = view(c, slug);
    if (!repo) throw new ToolkitError(`${slug} was created but gh cannot see it`, { arm: a.arm });
  }

  const clone = join(c.root, a.arm);
  const local = inspectClone(clone);
  let cloned = false;
  if (local.state === 'occupied') {
    throw new ToolkitError(`${clone} exists and is not a git clone; move it aside first`, { arm: a.arm, clone });
  }
  if (local.state === 'clone' && !pointsAt(local.origin, slug)) {
    throw new ToolkitError(`${clone} is a clone of ${local.origin}, not ${slug}`, { arm: a.arm, clone });
  }
  if (local.state === 'absent') {
    const r = exec('git', ['clone', '--quiet', sshUrl(c, slug), clone]);
    if (!r.ok) throw new ToolkitError(`git clone ${sshUrl(c, slug)} failed`, { arm: a.arm, stderr: r.stderr });
    cloned = true;
  }
  return { ...describe(c, a, repo), created, cloned };
}

/** @param {Config} c @param {{arm: 'a' | 'b', name: string}} a @param {string} scenario @param {string} fixtureRemote @param {boolean} dryRun */
function resetOne(c, a, scenario, fixtureRemote, dryRun) {
  const slug = `${c.owner}/${a.name}`;
  const clone = join(c.root, a.arm);
  const local = inspectClone(clone);
  if (local.state !== 'clone') {
    throw new ToolkitError(`no clone at ${clone}; run \`my-command-tools sandbox init\` first`, { arm: a.arm });
  }
  const fetched = exec('git', ['-C', clone, 'fetch', '--quiet', '--prune', 'origin']);
  if (!fetched.ok) throw new ToolkitError(`git fetch in ${clone} failed`, { arm: a.arm, stderr: fetched.stderr });

  const script = join(clone, 'scripts', 'reset-scenario.sh');
  if (!existsSync(script)) {
    throw new ToolkitError(`${script} is missing; the template this sandbox came from has no reset script`, {
      arm: a.arm,
    });
  }
  const args = [script, '--scenario', scenario, '--repo', slug, '--clone', clone, '--fixture-remote', fixtureRemote];
  if (dryRun) args.push('--dry-run');
  const r = exec('bash', args, { cwd: clone, env: c.env });
  if (!r.ok) {
    throw new ToolkitError(`reset-scenario.sh failed for arm ${a.arm}`, { arm: a.arm, code: r.code, stderr: r.stderr });
  }
  /** @type {unknown} */
  let result;
  try {
    result = JSON.parse(r.stdout);
  } catch {
    throw new ToolkitError(`reset-scenario.sh printed no JSON for arm ${a.arm}`, { arm: a.arm, stdout: r.stdout });
  }
  return { ...describe(c, a, view(c, slug)), reset: result };
}

/** @param {Config} c @param {{arm: 'a' | 'b', name: string}} a */
function destroyOne(c, a) {
  const slug = `${c.owner}/${a.name}`;
  let repo = 'already-absent';
  if (view(c, slug)) {
    const r = gh(c, ['repo', 'delete', slug, '--yes']);
    if (!r.ok) {
      if (NO_DELETE_SCOPE.test(r.stderr)) {
        throw new ToolkitError(
          `deleting ${slug} needs the delete_repo scope, which ${c.owner}'s gh login does not have. ` +
            'Grant it yourself with `gh auth refresh -h github.com -s delete_repo`, then re-run destroy.',
          { arm: a.arm, missingScope: 'delete_repo', stderr: r.stderr },
        );
      }
      throw new ToolkitError(`gh repo delete ${slug} failed`, { arm: a.arm, stderr: r.stderr });
    }
    repo = 'deleted';
  }
  const clone = join(c.root, a.arm);
  const existed = existsSync(clone);
  if (existed) rmSync(clone, { recursive: true, force: true });
  return { arm: a.arm, nameWithOwner: slug, clone, repo, local: existed ? 'removed' : 'already-absent' };
}

/** @param {import('../cli.mjs').Ctx} ctx */
export function run(ctx) {
  const sub = ctx.positionals[0];
  if (!['init', 'reset', 'status', 'destroy'].includes(sub ?? '')) {
    throw new UsageError('sandbox needs a subcommand: init, reset, status, or destroy');
  }
  // Checked before any gh call: a refused destroy reads nothing and touches nothing.
  if (sub === 'destroy' && !bool(ctx.flags.yes)) {
    throw new UsageError('destroy deletes both sandbox repos and cannot be undone; pass --yes to confirm');
  }
  const scenario = str(ctx.flags.scenario);
  if (sub === 'reset' && !scenario) throw new UsageError('reset needs --scenario <name>');

  // reset reads the template only as the default fixture remote.
  const explicitRemote = str(ctx.flags['fixture-remote']) || process.env.FIXTURE_REMOTE;
  const c = config(ctx, sub === 'init' || (sub === 'reset' && !explicitRemote));
  const common = {
    action: sub,
    owner: c.owner,
    ownerSource: c.ownerSource,
    template: c.template,
    root: c.root,
    identity: c.identity,
  };

  if (sub === 'status') {
    return { ...common, sandboxes: c.arms.map((a) => describe(c, a, view(c, `${c.owner}/${a.name}`))) };
  }
  if (sub === 'init') return { ...common, sandboxes: c.arms.map((a) => initOne(c, a)) };
  if (sub === 'destroy') return { ...common, sandboxes: c.arms.map((a) => destroyOne(c, a)) };

  const fixtureRemote = explicitRemote || sshUrl(c, /** @type {string} */ (c.template));
  const dryRun = bool(ctx.flags['dry-run']);
  return {
    ...common,
    scenario,
    fixtureRemote,
    dryRun,
    sandboxes: c.arms.map((a) => resetOne(c, a, /** @type {string} */ (scenario), fixtureRemote, dryRun)),
  };
}
