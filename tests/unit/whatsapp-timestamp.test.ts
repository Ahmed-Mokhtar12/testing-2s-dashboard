import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatChatTimestamp } from '../../src/lib/whatsappTime.ts';

// All expectations are derived relative to an injected "now" (repo rule: no
// stale literals). A fixed mid-day anchor keeps day arithmetic unambiguous.
const NOW = new Date(2026, 7, 31, 12, 0, 0); // local time, Monday 2026-08-31

const iso = (d: Date) => d.toISOString();

test('same day renders a locale time, not a date', () => {
  const morning = new Date(2026, 7, 31, 9, 5, 0);
  const label = formatChatTimestamp(iso(morning), NOW);
  // Locale-dependent ("09:05" or "9:05 AM") — assert shape, not literal.
  assert.match(label, /9.?05/);
  assert.doesNotMatch(label, /2026/);
});

test('yesterday renders the word, regardless of clock time', () => {
  const lateYesterday = new Date(2026, 7, 30, 23, 55, 0);
  assert.equal(formatChatTimestamp(iso(lateYesterday), NOW), 'Yesterday');
});

test('within a week renders a weekday name', () => {
  const threeDaysAgo = new Date(2026, 7, 28, 8, 0, 0); // Friday
  const label = formatChatTimestamp(iso(threeDaysAgo), NOW);
  assert.equal(label, threeDaysAgo.toLocaleDateString(undefined, { weekday: 'long' }));
  assert.notEqual(label, 'Yesterday');
});

test('seven days or older renders a short date', () => {
  const eightDaysAgo = new Date(2026, 7, 23, 8, 0, 0);
  const label = formatChatTimestamp(iso(eightDaysAgo), NOW);
  assert.match(label, /2026/);
});

test('boundary: exactly 6 days ago is still a weekday; 7 is a date', () => {
  const six = new Date(2026, 7, 25, 1, 0, 0);
  const seven = new Date(2026, 7, 24, 23, 0, 0);
  assert.doesNotMatch(formatChatTimestamp(iso(six), NOW), /2026/);
  assert.match(formatChatTimestamp(iso(seven), NOW), /2026/);
});

test('garbage input renders empty, never NaN', () => {
  assert.equal(formatChatTimestamp('not-a-date', NOW), '');
});
