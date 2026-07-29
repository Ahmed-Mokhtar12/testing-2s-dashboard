import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateEmails } from '../../supabase/functions/chat-with-data/emails-aggregator.ts';

const row = (sent_at: string, email_type: string, category: string | null, guest_email: string | null) => ({ sent_at, email_type, category, guest_email });

test('splits new vs reply and counts unique guests', () => {
  const s = aggregateEmails([
    row('2026-07-26T10:00:00+04:00', 'new', 'booking', 'a@x.com'),
    row('2026-07-26T11:00:00+04:00', 'reply', 'booking', 'a@x.com'),
    row('2026-07-27T09:00:00+04:00', 'new', null, 'b@x.com'),
  ]);
  assert.equal(s.total_emails, 3);
  assert.equal(s.new_emails, 2);
  assert.equal(s.reply_emails, 1);
  assert.equal(s.unique_guests, 2);
  assert.deepEqual(s.by_category, [{ category: 'booking', emails: 2 }, { category: 'uncategorized', emails: 1 }]);
});

test('empty input', () => {
  assert.equal(aggregateEmails([]).total_emails, 0);
});
