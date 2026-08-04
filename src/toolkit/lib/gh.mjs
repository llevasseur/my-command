// GitHub access, with the identity resolved here rather than reported as an error.
//
// `gh`'s GraphQL-backed writes authenticate as whichever account is active, and on a repo
// owned by another of the user's accounts GitHub answers `must be a collaborator`. That is
// a wrong-identity condition with one right answer, not a permission to request, so a
// caller sees a PR and how the identity resolved rather than the condition.
import { run as exec } from './proc.mjs';

// GitHub's answer when the authenticated account cannot write to the repo. GraphQL-only:
// the REST endpoints for the same operations accept the token that this rejects, which is
// why REST is the last fallback below.
const WRONG_IDENTITY = /must be a collaborator|HTTP 403|Resource not accessible/i;

/**
 * The `owner/repo` the checkout pushes to. Parsed from the remote URL rather than asked of
 * `gh repo view`, so resolving an identity never depends on an authenticated call.
 * @param {string} cwd
 * @returns {{owner: string, repo: string} | null}
 */
export function originSlug(cwd) {
  const r = exec('git', ['remote', 'get-url', 'origin'], { cwd });
  if (!r.ok) return null;
  // Both spellings of a GitHub remote: scp-style `git@host:owner/repo` and any URL form
  // ending in `owner/repo`.
  const m = r.stdout.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/**
 * A token belonging to `owner`, when that account is one the device is logged in as.
 * @param {string} owner
 * @returns {string | null}
 */
export function ownerToken(owner) {
  const r = exec('gh', ['auth', 'token', '--user', owner]);
  return r.ok && r.stdout ? r.stdout : null;
}

/**
 * Run a `gh` write, recovering from a wrong-identity rejection without involving the
 * caller. Attempts, in order:
 *
 *  1. `gh` as configured — the ordinary path, and the only one most repos ever take.
 *  2. the same call under a `GH_TOKEN` belonging to the repository owner, when the
 *     device is logged in as that account.
 *  3. `restFallback`, if the caller supplied one. The REST endpoints accept the token
 *     GraphQL rejected, so this clears the condition even with no owner login present.
 *
 * @param {string} cwd
 * @param {string[]} args `gh` arguments for the GraphQL-backed form.
 * @param {{restFallback?: (env?: Record<string, string>) => import('./proc.mjs').RunResult}} [opts]
 * @returns {{result: import('./proc.mjs').RunResult, identity: string, owner: string | null}}
 */
export function ghWrite(cwd, args, opts = {}) {
  const slug = originSlug(cwd);
  const owner = slug?.owner ?? null;

  const direct = exec('gh', args, { cwd });
  if (direct.ok || !WRONG_IDENTITY.test(direct.stderr)) {
    return { result: direct, identity: 'active account', owner };
  }

  if (owner) {
    const token = ownerToken(owner);
    if (token) {
      const scoped = exec('gh', args, { cwd, env: { GH_TOKEN: token } });
      if (scoped.ok) return { result: scoped, identity: `owner-scoped token (${owner})`, owner };
    }
  }

  if (opts.restFallback) {
    const rest = opts.restFallback();
    if (rest.ok) return { result: rest, identity: 'REST', owner };
    // Report the REST failure over the GraphQL one: REST had the credential GraphQL
    // refused, so its error is the one that says something new.
    return { result: rest, identity: 'REST', owner };
  }

  return { result: direct, identity: 'active account', owner };
}

/**
 * Read-only `gh` call returning parsed JSON, or null when the call failed or answered
 * something unparseable. Reads authenticate as any account with visibility, so they need
 * none of the recovery above.
 * @param {string} cwd @param {string[]} args
 * @returns {unknown}
 */
export function ghJson(cwd, args) {
  const r = exec('gh', args, { cwd });
  if (!r.ok) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}
