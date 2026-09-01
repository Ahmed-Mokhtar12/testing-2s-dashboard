import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedAttachmentUrl, buildConversationContext, CONTEXT_HEADER,
} from '../../supabase/functions/whatsapp-web-chat/guards.ts';

// Security boundary: before 2026-09-01 whatsapp-web-chat forwarded any attachment.url to
// n8n and persisted it into "Chat History".Media, where every operator's browser
// auto-loads it. Only this project's own signed storage URLs may pass.
const BASE = 'https://yczcebfaqerlwfalrbjn.supabase.co';

test('accepts only this project\'s signed whatsapp-attachments URLs', () => {
  assert.equal(isAllowedAttachmentUrl(`${BASE}/storage/v1/object/sign/whatsapp-attachments/a/b.pdf?token=x`, BASE), true);
  assert.equal(isAllowedAttachmentUrl('https://evil.example/invoice.pdf', BASE), false);
  assert.equal(isAllowedAttachmentUrl(`${BASE}/storage/v1/object/public/whatsapp-attachments/b.pdf`, BASE), false);
  assert.equal(isAllowedAttachmentUrl(`${BASE}.evil.example/storage/v1/object/sign/whatsapp-attachments/x`, BASE), false);
  assert.equal(isAllowedAttachmentUrl(undefined, BASE), false);
  assert.equal(isAllowedAttachmentUrl(`${BASE}/storage/v1/object/sign/whatsapp-attachments/x`, ''), false);
});

test('context is rendered oldest -> newest from a newest-first page', () => {
  const ctx = buildConversationContext([
    { created_at: '2026-09-01T10:02:00Z', 'Sender Message': 'second', 'Ai Reply': 'r2' },
    { created_at: '2026-09-01T10:01:00Z', 'Sender Message': 'first', human_reply: 'h1' },
  ]);
  assert.equal(ctx, `${CONTEXT_HEADER}\n- Customer: first\n- Human Agent: h1\n- Customer: second\n- AI: r2`);
});

test('human reply wins over AI reply on the same row; empty history is null', () => {
  const ctx = buildConversationContext([{ human_reply: 'h', 'Ai Reply': 'a' }]);
  assert.equal(ctx, `${CONTEXT_HEADER}\n- Human Agent: h`);
  assert.equal(buildConversationContext([]), null);
});
