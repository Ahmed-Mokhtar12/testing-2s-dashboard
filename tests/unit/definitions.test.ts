import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averageAedPrice } from '../../src/hooks/insights/definitions.ts';

// A null converted_price_aed counted as AED 0 and dragged every average, rank and diff down
// (audit A10). Sera's rates-aggregator already skips non-numbers; the dashboard now agrees.
test('averages only numeric prices; null when none', () => {
  assert.equal(averageAedPrice([{ converted_price_aed: 100 }, { converted_price_aed: null }, { converted_price_aed: '300' }]), 200);
  assert.equal(averageAedPrice([{ converted_price_aed: null }, { converted_price_aed: 'n/a' }]), null);
  assert.equal(averageAedPrice([]), null);
});
