import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCallbackUrl } from '../../src/lib/auth-callback-url.ts';

// The callback used to read only ?code= and bounced every implicit-flow result (audit A7/W1).
test('implicit-flow results and errors live in the hash', () => {
  assert.deepEqual(parseCallbackUrl('', '#access_token=abc&token_type=bearer'), { hasResult: true, error: null, description: null });
  assert.deepEqual(parseCallbackUrl('', '#error=access_denied&error_description=User+cancelled+the+sign-in'),
    { hasResult: true, error: 'access_denied', description: 'User cancelled the sign-in' });
});

test('PKCE-style query results still count; a bare callback has no result', () => {
  assert.equal(parseCallbackUrl('?code=xyz', '').hasResult, true);
  assert.deepEqual(parseCallbackUrl('', ''), { hasResult: false, error: null, description: null });
});
