import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateWhatsApp, dubaiDateKey, phoneDigits } from '../../supabase/functions/chat-with-data/whatsapp-aggregator.ts';
import type { HandledBy, WhatsAppRow } from '../../supabase/functions/chat-with-data/whatsapp-aggregator.ts';

// Row builders. `legacy` is the pre-2026-07-31 shape: a real reply, no stamp.
const row = (
  iso: string, sender: string,
  opts: { human?: boolean; stamp?: HandledBy; hasReply?: boolean } = {},
): WhatsAppRow => ({
  created_at: iso,
  sender,
  name: null,
  humanControlled: opts.human ?? false,
  handledBy: opts.stamp ?? null,
  hasReply: opts.hasReply ?? true,
});

const legacy = (iso: string, sender: string, human = false) => row(iso, sender, { human });

test('counts totals, unique guests, and human vs ai handling', () => {
  const s = aggregateWhatsApp([
    legacy('2026-07-26T10:00:00+04:00', '9715550001'),
    legacy('2026-07-26T11:00:00+04:00', '9715550001', true),
    legacy('2026-07-27T09:00:00+04:00', '9715550002'),
  ]);
  assert.equal(s.total_messages, 3);
  assert.equal(s.unique_guests, 2);
  assert.equal(s.human_handled_messages, 1);
  assert.equal(s.ai_handled_messages, 2);
  assert.deepEqual(s.by_day.map(d => d.messages), [2, 1]);
});

test('an all-legacy window keeps the old signal and says so', () => {
  const s = aggregateWhatsApp([
    legacy('2026-07-26T10:00:00+04:00', 'a'),
    legacy('2026-07-26T11:00:00+04:00', 'a', true),
  ]);
  assert.equal(s.handling.primary_signal, 'is_human_controlled');
  assert.equal(s.handling.coverage_complete, false);
  assert.equal(s.handling.legacy_unstamped_rows, 2);
  assert.equal(s.handling.disagreement_rows, 0);
  assert.match(s.handling.instruction_to_model!, /OVERSTATES human handling/);
  assert.match(s.handling.instruction_to_model!, /2 of 2 rows/);
});

test('a fully stamped window switches to handled_by on its own', () => {
  const s = aggregateWhatsApp([
    row('2026-08-01T10:00:00+04:00', 'a', { stamp: 'ai' }),
    row('2026-08-01T11:00:00+04:00', 'a', { stamp: 'human', human: true }),
    row('2026-08-01T12:00:00+04:00', 'b', { stamp: 'ai' }),
  ]);
  assert.equal(s.handling.primary_signal, 'handled_by');
  assert.equal(s.handling.coverage_complete, true);
  assert.equal(s.handling.human_handled_messages, 1);
  assert.equal(s.handling.ai_handled_messages, 2);
  assert.equal(s.handling.disagreement_rows, 0);
  // No caveat once the bridge has retired for this window.
  assert.equal(s.handling.instruction_to_model, null);
});

test('the retroactive-relabel signature is counted as a disagreement, not believed', () => {
  // Three AI exchanges for one sender, then a takeover flips is_human_controlled
  // on the sender's whole history. The flag now claims 3 human rows; the stamps
  // say 0 human, 3 ai.
  const s = aggregateWhatsApp([
    row('2026-08-01T10:00:00+04:00', 'a', { stamp: 'ai', human: true }),
    row('2026-08-01T11:00:00+04:00', 'a', { stamp: 'ai', human: true }),
    row('2026-08-01T12:00:00+04:00', 'a', { stamp: 'ai', human: true }),
  ]);
  assert.equal(s.handling.primary_signal, 'handled_by');
  assert.equal(s.handling.human_handled_messages, 0, 'the stamp must win');
  assert.equal(s.handling.ai_handled_messages, 3);
  assert.equal(s.handling.legacy_control_flag.human_handled_messages, 3, 'the old flag is still reported');
  assert.equal(s.handling.disagreement_rows, 3);
  assert.match(s.handling.instruction_to_model!, /disagrees on 3/);
});

test('a human row the flag missed also counts as a disagreement', () => {
  // The reverse direction: 61 such rows existed live at the time of writing —
  // a human reply on a row whose flag was never set (or was later cleared).
  const s = aggregateWhatsApp([
    row('2026-08-01T10:00:00+04:00', 'a', { stamp: 'human', human: false }),
  ]);
  assert.equal(s.handling.human_handled_messages, 1);
  assert.equal(s.handling.legacy_control_flag.human_handled_messages, 0);
  assert.equal(s.handling.disagreement_rows, 1);
});

test('a mixed window reports both signals, both counts, and the partial disagreement', () => {
  const s = aggregateWhatsApp([
    legacy('2026-07-26T10:00:00+04:00', 'a', true),                   // legacy, flagged
    row('2026-08-01T10:00:00+04:00', 'a', { stamp: 'ai' }),           // agrees
    row('2026-08-01T11:00:00+04:00', 'b', { stamp: 'human', human: true }), // agrees
    row('2026-08-01T12:00:00+04:00', 'b', { stamp: 'ai', human: true }),    // disagrees
  ]);
  assert.equal(s.handling.primary_signal, 'is_human_controlled');
  assert.equal(s.handling.legacy_unstamped_rows, 1);
  // Top-level figures stay on the old signal while a legacy row is in range:
  // 3 flagged rows out of 4, which is exactly the overstatement being warned
  // about — the stamp says only 1 of the stamped rows was human.
  assert.equal(s.human_handled_messages, 3);
  assert.equal(s.ai_handled_messages, 1);
  assert.equal(s.handling.legacy_control_flag.human_handled_messages, 3);
  assert.equal(s.handling.disagreement_rows, 1);
  assert.match(s.handling.instruction_to_model!, /1 of 4 rows/);
  assert.match(s.handling.instruction_to_model!, /3 rows that DO carry the stamp/);
  assert.match(s.handling.instruction_to_model!, /disagree about 1/);
});

test('an incomplete window with no contradictions omits the disagreement clause', () => {
  const s = aggregateWhatsApp([
    legacy('2026-07-26T10:00:00+04:00', 'a', true),
    row('2026-08-01T10:00:00+04:00', 'a', { stamp: 'ai' }),
    row('2026-08-01T11:00:00+04:00', 'b', { stamp: 'human', human: true }),
  ]);
  assert.equal(s.handling.disagreement_rows, 0);
  assert.match(s.handling.instruction_to_model!, /1 of 3 rows/);
  assert.doesNotMatch(s.handling.instruction_to_model!, /disagree/);
});

test('marker rows and unanswered messages are not handling categories', () => {
  const s = aggregateWhatsApp([
    row('2026-08-01T10:00:00+04:00', 'a', { stamp: 'system', hasReply: false }),
    row('2026-08-01T10:05:00+04:00', 'a', { stamp: 'system', hasReply: false, human: true }),
    row('2026-08-01T11:00:00+04:00', 'b', { stamp: null, hasReply: false }), // awaiting a reply
    row('2026-08-01T12:00:00+04:00', 'b', { stamp: 'ai' }),
  ]);
  assert.equal(s.handling.system_rows, 2);
  assert.equal(s.handling.awaiting_reply_rows, 1);
  // An unreplied row does NOT block coverage — it carries no handling claim.
  assert.equal(s.handling.coverage_complete, true);
  assert.equal(s.handling.primary_signal, 'handled_by');
  assert.equal(s.handling.human_handled_messages, 0);
  assert.equal(s.handling.ai_handled_messages, 1);
  // A flagged marker row is not counted as a disagreement.
  assert.equal(s.handling.disagreement_rows, 0);
  // total_messages still counts every row fetched.
  assert.equal(s.total_messages, 4);
});

test('a legacy row WITH a reply blocks coverage; one without does not', () => {
  const blocked = aggregateWhatsApp([
    row('2026-08-01T10:00:00+04:00', 'a', { stamp: 'ai' }),
    row('2026-07-01T10:00:00+04:00', 'a', { stamp: null, hasReply: true }),
  ]);
  assert.equal(blocked.handling.coverage_complete, false);
  assert.equal(blocked.handling.legacy_unstamped_rows, 1);

  const notBlocked = aggregateWhatsApp([
    row('2026-08-01T10:00:00+04:00', 'a', { stamp: 'ai' }),
    row('2026-08-01T10:01:00+04:00', 'a', { stamp: null, hasReply: false }),
  ]);
  assert.equal(notBlocked.handling.coverage_complete, true);
  assert.equal(notBlocked.handling.legacy_unstamped_rows, 0);
});

test('dubaiDateKey converts UTC timestamps into Dubai calendar days', () => {
  assert.equal(dubaiDateKey('2026-07-26T22:30:00Z'), '2026-07-27'); // 02:30 Dubai next day
});

test('empty input yields zeroed summary with no caveat', () => {
  const s = aggregateWhatsApp([]);
  assert.equal(s.total_messages, 0);
  assert.deepEqual(s.by_day, []);
  // Nothing legacy in an empty window, so coverage is trivially complete and
  // there is nothing to warn about.
  assert.equal(s.handling.coverage_complete, true);
  assert.equal(s.handling.primary_signal, 'handled_by');
  assert.equal(s.handling.instruction_to_model, null);
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
