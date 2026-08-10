// Which GitHub account a checkout wants is read off `gh auth status`, so the parsing of
// that output is what has to hold — a device with two logins is the case the whole
// identity path exists for.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAccounts } from './gh.mjs';

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
