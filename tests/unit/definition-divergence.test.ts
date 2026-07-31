import { test } from 'node:test';
import assert from 'node:assert/strict';

// The dashboard and Sera answer some of the same questions from the same
// tables, through completely separate code. Written down twice, those
// definitions drift — silently, because each one looks right on its own page.
// This file runs the REAL code from both surfaces over identical rows.
//
// Rule: a pair either agrees, or it is registered with a reason. A registered
// pair MUST still disagree on its fixture, so the registry cannot rot into a
// list of things that were fixed years ago and never removed.
//
// Adding a metric both surfaces report? Put the dashboard side in
// src/hooks/insights/definitions.ts and register the pair below.

import {
  reviewAverageScore, emailUniqueGuests,
  whatsappHumanControlledCount, whatsappHumanReplyCount,
} from '../../src/hooks/insights/definitions.ts';
import { aggregateReviews } from '../../supabase/functions/chat-with-data/reviews-aggregator.ts';
import { aggregateEmails } from '../../supabase/functions/chat-with-data/emails-aggregator.ts';
import { aggregateWhatsApp } from '../../supabase/functions/chat-with-data/whatsapp-aggregator.ts';

// ---------------------------------------------------------------------------
// Shared fixtures. One canonical row set per table, mapped into each surface's
// row shape — the two sides select the same columns under different names, and
// that mapping is the only thing allowed to differ.
// ---------------------------------------------------------------------------

const REVIEW_ROWS = [
  { date: '2026-07-01', source: 'google-maps', score: 5,    hotel: 'TS' },
  { date: '2026-07-02', source: 'booking',     score: 4,    hotel: 'TS' },
  { date: '2026-07-03', source: 'booking',     score: 0,    hotel: 'TS' },  // a real zero
  { date: '2026-07-04', source: 'tripadvisor', score: null, hotel: 'TS' },  // unscored
  { date: '2026-07-05', source: 'google-maps', score: 3.5,  hotel: 'TS' },
];
const reviewRowsDashboard = REVIEW_ROWS.map((r) => ({ Score: r.score }));

const EMAIL_ROWS = [
  { sent_at: '2026-07-01T08:00:00Z', email_type: 'new',   category: 'booking', guest_email: 'Guest@Example.com' },
  { sent_at: '2026-07-01T09:00:00Z', email_type: 'reply', category: 'booking', guest_email: 'guest@example.com' },
  { sent_at: '2026-07-02T09:00:00Z', email_type: 'new',   category: null,      guest_email: '  spaced@example.com  ' },
  { sent_at: '2026-07-02T10:00:00Z', email_type: 'new',   category: null,      guest_email: '   ' },
  { sent_at: '2026-07-03T10:00:00Z', email_type: 'new',   category: null,      guest_email: null },
];

const WHATSAPP_ROWS = [
  // An AI exchange whose sender was later taken over: the flag now claims it.
  { created_at: '2026-07-01T08:00:00Z', sender: 'a', name: null, is_human_controlled: true,  human_reply: null,          ai_reply: 'ai answered' },
  { created_at: '2026-07-01T09:00:00Z', sender: 'a', name: null, is_human_controlled: true,  human_reply: null,          ai_reply: 'ai answered' },
  // A genuine human reply, flagged.
  { created_at: '2026-07-01T10:00:00Z', sender: 'a', name: null, is_human_controlled: true,  human_reply: 'agent here', ai_reply: null },
  // A human reply the flag never got set on (61 such rows existed live).
  { created_at: '2026-07-02T10:00:00Z', sender: 'b', name: null, is_human_controlled: false, human_reply: 'agent here', ai_reply: null },
];
const whatsappRowsSera = WHATSAPP_ROWS.map((r) => ({
  created_at: r.created_at, sender: r.sender, name: r.name,
  humanControlled: r.is_human_controlled,
  handledBy: null,
  hasReply: !!(r.human_reply ?? r.ai_reply),
}));

// ---------------------------------------------------------------------------

interface Pair {
  metric: string;
  dashboard: () => unknown;
  sera: () => unknown;
  /** Present = this divergence is understood and accepted, with the reason. */
  accepted?: string;
}

const PAIRS: Pair[] = [
  {
    metric: 'reviews.average_score',
    dashboard: () => reviewAverageScore(reviewRowsDashboard),
    sera: () => aggregateReviews(REVIEW_ROWS).average_score,
  },
  {
    metric: 'reviews.total',
    dashboard: () => reviewRowsDashboard.length,
    sera: () => aggregateReviews(REVIEW_ROWS).total_reviews,
  },
  {
    metric: 'emails.unique_guests',
    dashboard: () => emailUniqueGuests(EMAIL_ROWS),
    sera: () => aggregateEmails(EMAIL_ROWS).unique_guests,
  },
  {
    metric: 'emails.new_vs_reply',
    dashboard: () => ({
      new: EMAIL_ROWS.filter((r) => r.email_type === 'new').length,
      reply: EMAIL_ROWS.filter((r) => r.email_type === 'reply').length,
    }),
    sera: () => {
      const s = aggregateEmails(EMAIL_ROWS);
      return { new: s.new_emails, reply: s.reply_emails };
    },
  },
  {
    metric: 'whatsapp.total_messages',
    dashboard: () => WHATSAPP_ROWS.length,
    sera: () => aggregateWhatsApp(whatsappRowsSera).total_messages,
  },
  {
    metric: 'whatsapp.unique_guests',
    dashboard: () => new Set(WHATSAPP_ROWS.map((r) => String(r.sender))).size,
    sera: () => aggregateWhatsApp(whatsappRowsSera).unique_guests,
  },
  {
    metric: 'whatsapp.human_handled',
    // The WhatsApp page shows BOTH of these, on one screen: the
    // "Human-controlled" KPI card and the "Human reply" slice of the reply-mix
    // pie. They are different numbers for the same guest question.
    dashboard: () => whatsappHumanControlledCount(WHATSAPP_ROWS),
    sera: () => whatsappHumanReplyCount(WHATSAPP_ROWS),
    accepted:
      'is_human_controlled is a mutable per-SENDER flag rewritten on takeover, ' +
      'so it counts AI exchanges as human (67 such rows live); human_reply counts ' +
      'actual reply text. Both are displayed on /dashboard/whatsapp today. ' +
      'Neither is the answer: handled_by (migration 20260731201138) supersedes ' +
      'both, and this entry retires when the page moves to it. WhatsApp.tsx is ' +
      'under a do-not-touch instruction, so that move is a separate decision.',
  },
];

for (const pair of PAIRS) {
  if (!pair.accepted) {
    test(`definitions agree: ${pair.metric}`, () => {
      assert.deepEqual(
        pair.dashboard(), pair.sera(),
        `${pair.metric} is computed differently by the dashboard and by Sera. ` +
        `Same question, two answers — fix one side, or register the divergence ` +
        `with a reason in tests/unit/definition-divergence.test.ts.`,
      );
    });
  } else {
    test(`registered divergence still diverges: ${pair.metric}`, () => {
      // If these ever agree, the divergence was resolved and the registry entry
      // is stale — delete it and move the pair to the agreeing set above.
      assert.notDeepEqual(
        pair.dashboard(), pair.sera(),
        `${pair.metric} is registered as an accepted divergence but the two ` +
        `definitions now agree. Remove the 'accepted' reason so this pair is ` +
        `pinned as agreeing from here on.`,
      );
      assert.ok(pair.accepted.length > 40, `${pair.metric}: give a real reason, not a placeholder`);
    });
  }
}

test('the zero-score case the two review definitions used to disagree about', () => {
  // Documents what this file caught: the dashboard filtered `score > 0` (where
  // safeNum maps null to 0, so one comparison served as both the null guard and
  // an arbitrary zero filter) while Sera kept zeros. Mean of 5, 4, 0, 3.5 is
  // 3.13; dropping the zero gives 4.17. Live data has no 0 scores yet, so the
  // divergence was latent — which is exactly why it needs a definition test
  // rather than a spot-check against production numbers.
  assert.equal(reviewAverageScore(reviewRowsDashboard), 3.13);
  assert.equal(aggregateReviews(REVIEW_ROWS).average_score, 3.13);
  const droppingZeros = [5, 4, 3.5];
  assert.equal(
    Math.round((droppingZeros.reduce((a, b) => a + b, 0) / droppingZeros.length) * 100) / 100,
    4.17,
    'sanity: the old dashboard definition really did produce a different number',
  );
});

test('the mixed-case guest the two email definitions used to disagree about', () => {
  // Guest@Example.com and guest@example.com are one guest; '   ' is nobody.
  assert.equal(emailUniqueGuests(EMAIL_ROWS), 2);
  assert.equal(aggregateEmails(EMAIL_ROWS).unique_guests, 2);
  const caseSensitive = new Set(EMAIL_ROWS.map((r) => r.guest_email).filter(Boolean)).size;
  assert.equal(caseSensitive, 4, 'sanity: the old dashboard definition counted 4');
});
