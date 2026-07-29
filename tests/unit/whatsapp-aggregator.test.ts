import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateWhatsApp, dubaiDateKey, phoneDigits } from '../../supabase/functions/chat-with-data/whatsapp-aggregator.ts';

const row = (iso: string, sender: string, human = false) => ({ created_at: iso, sender, name: null, humanControlled: human });

test('counts totals, unique guests, and human vs ai handling', () => {
  const s = aggregateWhatsApp([
    row('2026-07-26T10:00:00+04:00', '9715550001'),
    row('2026-07-26T11:00:00+04:00', '9715550001', true),
    row('2026-07-27T09:00:00+04:00', '9715550002'),
  ]);
  assert.equal(s.total_messages, 3);
  assert.equal(s.unique_guests, 2);
  assert.equal(s.human_handled_messages, 1);
  assert.equal(s.ai_handled_messages, 2);
  assert.deepEqual(s.by_day.map(d => d.messages), [2, 1]);
});

test('dubaiDateKey converts UTC timestamps into Dubai calendar days', () => {
  assert.equal(dubaiDateKey('2026-07-26T22:30:00Z'), '2026-07-27'); // 02:30 Dubai next day
});

test('empty input yields zeroed summary', () => {
  const s = aggregateWhatsApp([]);
  assert.equal(s.total_messages, 0);
  assert.deepEqual(s.by_day, []);
});

test('phoneDigits: a guest name with no digits collapses to an empty string', () => {
  assert.equal(phoneDigits('Ahmed'), '');
});

test('phoneDigits: strips formatting characters, keeping only digits', () => {
  assert.equal(phoneDigits('+971 55-123 4567'), '971551234567');
});

test('phoneDigits: undefined and null are treated as no filter', () => {
  assert.equal(phoneDigits(undefined), '');
  assert.equal(phoneDigits(null), '');
});

test('phoneDigits: empty string stays empty', () => {
  assert.equal(phoneDigits(''), '');
});
