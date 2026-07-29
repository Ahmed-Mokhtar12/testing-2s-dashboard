import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SearchDecisionEngine } from '../../supabase/functions/chat-with-data/search-decision-engine.ts';
import { ContextSectionBuilder } from '../../supabase/functions/chat-with-data/context-section-builder.ts';

// hasRichDatabaseContext is private on SearchDecisionEngine; exercise it via
// the public analyzeSearchRequirement() API and assert on the returned field.

test('rich context: a domain section showing rows marks hasRichDatabaseContext true', () => {
  const context = [
    '### Reviews (0 rows in range; showing 0)',
    'No rows in the selected range.',
    '',
    '### WhatsApp (216 rows in range; showing 40)',
    '2026-07-01T10:00:00Z | +9715... Guest | guest: hi | reply: hello',
  ].join('\n');

  const result = SearchDecisionEngine.analyzeSearchRequirement(context, 'how is availability today?');
  assert.equal(result.hasRichDatabaseContext, true);
});

test('empty domains only: hasRichDatabaseContext is false', () => {
  const context = [
    '### Reviews (0 rows in range; showing 0)',
    'No rows in the selected range.',
  ].join('\n');

  const result = SearchDecisionEngine.analyzeSearchRequirement(context, 'what is the current room price?');
  assert.equal(result.hasRichDatabaseContext, false);
});

test('empty context string: hasRichDatabaseContext is false', () => {
  const result = SearchDecisionEngine.analyzeSearchRequirement('', 'what is the current room price?');
  assert.equal(result.hasRichDatabaseContext, false);
});

test('role section no longer overclaims full access or vector search', () => {
  const roleSection = ContextSectionBuilder.buildRoleAndAccessSection();
  assert.ok(!roleSection.includes('FULL ACCESS'), 'role section should not claim FULL ACCESS');
  assert.ok(!roleSection.includes('Vector search'), 'role section should not advertise Vector search');
});
