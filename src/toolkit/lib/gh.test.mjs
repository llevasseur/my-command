// The identity path reads `gh auth status`, so its parsing is what has to hold — including
// the two-login case it exists for.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isWrongIdentity, parseAccounts } from './gh.mjs';

const CURRENT = `github.com
  ✓ Logged in to github.com account llevasseurKG (keyring)
  - Active account: true
  - Git operations protocol: https
  ✓ Logged in to github.com account llevasseur (keyring)
  - Active account: false
  - Git operations protocol: https
`;

const OLDER = `github.com
  ✓ Logged in to github.com as llevasseur (oauth_token)
  ✓ Git operations for github.com configured to use https protocol.
`;

test('parseAccounts reads both logins and marks the active one', () => {
  const found = parseAccounts(CURRENT);
  assert.deepEqual(found, [
    { login: 'llevasseurKG', active: true },
    { login: 'llevasseur', active: false },
  ]);
});

test('parseAccounts handles the older single-account spelling', () => {
  // No `Active account:` line to read, and a lone login is active by definition.
  assert.deepEqual(parseAccounts(OLDER), [{ login: 'llevasseur', active: true }]);
});

test('parseAccounts reports nothing for a logged-out device', () => {
  assert.deepEqual(parseAccounts('You are not logged into any GitHub hosts.\n'), []);
});

test('a wrong-identity rejection is recognised in every wording GitHub uses for it', () => {
  assert.equal(isWrongIdentity('GraphQL: user must be a collaborator (createPullRequest)'), true);
  // `pr edit` answers this where `pr create` answers the line above; missing it cost the
  // owner-token retry on every update.
  assert.equal(
    isWrongIdentity('GraphQL: llevasseurKG does not have the correct permissions to execute `UpdatePullRequest`'),
    true,
  );
  assert.equal(isWrongIdentity('HTTP 403: Forbidden'), true);
  assert.equal(isWrongIdentity('Resource not accessible by integration'), true);
});

test('an ordinary failure is not read as the wrong account', () => {
  assert.equal(isWrongIdentity('no pull requests found for branch "feat/x"'), false);
  assert.equal(isWrongIdentity(''), false);
});
