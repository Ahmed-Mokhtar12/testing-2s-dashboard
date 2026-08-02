import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenCache, TOKEN_SAFETY_MARGIN_MS } from './token-cache.ts';

const T0 = 1_700_000_000_000;
const HOUR_SECONDS = 3600;

test('the safety margin is a real, positive interval', () => {
  // Every "does not serve a token past X" assertion below is vacuous if the
  // margin is zero, so establish it once.
  assert.ok(TOKEN_SAFETY_MARGIN_MS > 0);
});

test('an empty cache returns null rather than an empty token', () => {
  const cache = new TokenCache();
  assert.equal(cache.get(T0), null);
});

test('a cached token is served for its lifetime minus the safety margin', () => {
  const cache = new TokenCache();
  cache.set('tok-a', HOUR_SECONDS, T0);

  const usableMs = HOUR_SECONDS * 1000 - TOKEN_SAFETY_MARGIN_MS;
  assert.equal(cache.get(T0), 'tok-a');
  assert.equal(cache.get(T0 + usableMs - 1), 'tok-a');

  // The boundary is exclusive: at the expiry instant the token is already gone.
  assert.equal(cache.get(T0 + usableMs), null);
  assert.equal(cache.get(T0 + usableMs + 1), null);

  // ANTI-VACUITY: prove the margin is actually subtracted. A cache that ignored
  // it would still satisfy every assertion above.
  assert.equal(cache.get(T0 + HOUR_SECONDS * 1000 - 1), null);
});

test('a numeric string expires_in is accepted', () => {
  // Azure sends a number, but the value reaches us through JSON.parse of a
  // third-party body; a quoted number must not silently disable the cache.
  const cache = new TokenCache();
  cache.set('tok-b', String(HOUR_SECONDS), T0);
  assert.equal(cache.get(T0), 'tok-b');
});

test('an untrustworthy expires_in caches nothing at all', () => {
  // Each of these must degrade to "fetch a fresh token every request", never to
  // "hold this token forever".
  for (const bad of [undefined, null, '', 'soon', NaN, Infinity, 0, -1, -HOUR_SECONDS]) {
    const cache = new TokenCache();
    cache.set('tok-bad', bad, T0);
    assert.equal(cache.get(T0), null, `expires_in ${String(bad)} should not be cached`);
    // ...and it must not become usable later either, which a stored NaN or
    // negative expiresAt could.
    assert.equal(cache.get(T0 + 10 * HOUR_SECONDS * 1000), null);
  }
});

test('a token whose whole lifetime is inside the safety margin is not cached', () => {
  const cache = new TokenCache();
  const marginSeconds = TOKEN_SAFETY_MARGIN_MS / 1000;

  cache.set('tok-short', marginSeconds, T0);
  assert.equal(cache.get(T0), null);

  // One second more than the margin is cacheable, for that one second.
  const cache2 = new TokenCache();
  cache2.set('tok-just-long-enough', marginSeconds + 1, T0);
  assert.equal(cache2.get(T0), 'tok-just-long-enough');
  assert.equal(cache2.get(T0 + 1000), null);
});

test('clear() drops a token that is still within its lifetime', () => {
  const cache = new TokenCache();
  cache.set('tok-rotated', HOUR_SECONDS, T0);
  assert.equal(cache.get(T0), 'tok-rotated');

  cache.clear();
  assert.equal(cache.get(T0), null);
});

test('a second set replaces the first token and its expiry', () => {
  const cache = new TokenCache();
  cache.set('tok-old', HOUR_SECONDS, T0);
  cache.set('tok-new', HOUR_SECONDS, T0 + 1000);

  assert.equal(cache.get(T0 + 1000), 'tok-new');
  // The new expiry is measured from the new `now`, not the old one.
  const usableMs = HOUR_SECONDS * 1000 - TOKEN_SAFETY_MARGIN_MS;
  assert.equal(cache.get(T0 + 1000 + usableMs - 1), 'tok-new');
  assert.equal(cache.get(T0 + 1000 + usableMs), null);
});
