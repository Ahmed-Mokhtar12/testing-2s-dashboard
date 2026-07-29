import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeSystemContent } from '../../supabase/functions/chat-with-data/message-composer.ts';

test('joins persona and data context, persona first', () => {
  const out = composeSystemContent('PERSONA', 'DATA');
  assert.ok(out.startsWith('PERSONA'));
  assert.ok(out.includes('## RETRIEVED DATA (live database context — treat as ground truth)'));
  assert.ok(out.indexOf('PERSONA') < out.indexOf('DATA'));
});

test('falls back to context alone when no persona', () => {
  assert.equal(composeSystemContent(undefined, 'DATA'), 'DATA');
});

test('falls back to persona alone when context empty', () => {
  assert.equal(composeSystemContent('PERSONA', ''), 'PERSONA');
  assert.equal(composeSystemContent('PERSONA', undefined), 'PERSONA');
});
