import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryAfterSeconds, MAX_RETRY_AFTER_SECONDS } from '../../supabase/functions/_shared/retry-after.ts';

// Graph can answer 429 with Retry-After: 300; three uncapped sleeps exceed the 400 s edge
// wall clock and leave an orphan Monthly_Training item (audit E9-M4).
test('Retry-After is honoured up to a ceiling and defaults sanely', () => {
  assert.equal(MAX_RETRY_AFTER_SECONDS, 30);
  assert.equal(retryAfterSeconds('5'), 5);
  assert.equal(retryAfterSeconds('300'), 30);
  assert.equal(retryAfterSeconds('Wed, 21 Oct 2026 07:28:00 GMT'), 10);
  assert.equal(retryAfterSeconds(null), 10);
  assert.equal(retryAfterSeconds('0'), 10);
});
