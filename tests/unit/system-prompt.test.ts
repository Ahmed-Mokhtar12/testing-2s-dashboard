import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SystemPromptBuilder } from '../../supabase/functions/chat-with-data/system-prompt-builder.ts';
// `import type` — see the note in system-prompt-builder.ts: a value import of
// an interface survives Node's type stripping and throws at load time.
import type { ConversationData } from '../../supabase/functions/chat-with-data/conversation-context-analyzer.ts';

const emptyConversation: ConversationData = {
  recentDataPoints: new Map(),
  conversationFlow: '',
  userPreferences: {
    detailLevel: 'moderate',
    communicationStyle: 'professional',
    focusAreas: []
  },
  conversationContext: ''
};

test('prompt names every query tool and disclaims sending', () => {
  const p = SystemPromptBuilder.buildConsultantPrompt(emptyConversation);
  for (const tool of ['query_training_records', 'query_whatsapp_chats', 'query_reviews', 'query_sera_emails', 'query_competitor_rates', 'search_web']) {
    assert.ok(p.includes(tool), `missing ${tool}`);
  }
  assert.ok(p.includes('You cannot send emails, SMS, or WhatsApp messages.'));
  assert.ok(!p.includes('Send emails, SMS, WhatsApp via action functions'));
});

test('prompt explains the legacy no_training_records_found flag', () => {
  const p = SystemPromptBuilder.buildConsultantPrompt(emptyConversation);
  assert.ok(p.includes('no_training_records_found'), 'prompt should explain how to handle no_training_records_found payloads');
});
