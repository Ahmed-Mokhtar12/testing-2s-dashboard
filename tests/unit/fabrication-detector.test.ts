import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFabricatedMetrics } from '../../supabase/functions/chat-with-data/data-fabrication-detector.ts';

test('flags unavailable metrics stated with numbers', () => {
  assert.deepEqual(detectFabricatedMetrics('Occupancy was 85% last month'), ['occupancy']);
  assert.deepEqual(detectFabricatedMetrics('ADR reached AED 450'), ['adr']);
  assert.deepEqual(detectFabricatedMetrics('RevPAR: 320'), ['revpar']);
});

test('does NOT flag ordinary business wording with numbers', () => {
  assert.deepEqual(detectFabricatedMetrics('We received 51 WhatsApp messages about bookings'), []);
  assert.deepEqual(detectFabricatedMetrics('Booking.com reviews: 12 this month'), []);
  assert.deepEqual(detectFabricatedMetrics('bookings rose and 3 guests asked about rates'), []);
});
