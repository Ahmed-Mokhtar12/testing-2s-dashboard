import { test } from 'node:test';
import assert from 'node:assert/strict';

// secureStorage derives its key from window.location.origin; give node one.
(globalThis as unknown as { window?: unknown }).window ??= { location: { origin: 'http://test.local' } };
const { encryptData, decryptData } = await import('../../src/utils/secureStorage.ts');

// String.fromCharCode(...bytes) spread the whole ciphertext as call arguments and threw
// RangeError past ~125 KB, after which every Sera history save failed silently (audit A2).
test('round-trips a 1 MB payload', async () => {
  const big = 'x'.repeat(1_000_000);
  const enc = await encryptData(big, 'user-1');
  assert.equal(await decryptData(enc, 'user-1'), big);
});

test('round-trips a small payload and rejects the wrong user key', async () => {
  const enc = await encryptData('hello', 'user-1');
  assert.equal(await decryptData(enc, 'user-1'), 'hello');
  await assert.rejects(() => decryptData(enc, 'user-2'));
});
