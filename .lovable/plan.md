

# Switch to Chat History Table for WhatsApp Conversations

## Overview
Modify the WhatsApp interface to use the `Chat History` table instead of `website_chats`, displaying conversations based on the `Sender Number` column.

## Data Structure Mapping

| Current (website_chats) | New (Chat History) |
|------------------------|-------------------|
| `session_id` | `Sender Number` |
| `user_message` | `Sender Message` |
| `ai_response` | `Ai Reply` |
| `created_at` | `created_at` |
| `is_archived` | `is_archived` |

## What Stays the Same
- WhatsApp icon in header
- All WhatsApp UI design (colors, bubbles, layout)
- Edge Function for sending messages to n8n
- n8n workflow integration

## Files to Modify

### 1. useWhatsAppChat.ts
**Changes:**
- Replace `sessionId` with `senderNumber` (phone number identifier)
- Change data source from `website_chats` to `Chat History`
- Update column names:
  - `user_message` to `Sender Message`
  - `ai_response` to `Ai Reply`
  - `session_id` to `Sender Number`
- Update localStorage key from `whatsapp_session_id` to `whatsapp_sender_number`

**Load History Query:**
```typescript
const { data, error } = await supabase
  .from('Chat History')
  .select('*')
  .eq('Sender Number', senderNumber)
  .eq('is_archived', false)
  .order('created_at', { ascending: true });
```

**Message Mapping:**
```typescript
// User message
content: chat['Sender Message']

// AI response  
content: chat['Ai Reply']
```

### 2. Edge Function (whatsapp-web-chat/index.ts)
**Changes:**
- Accept `senderNumber` instead of `sessionId`
- Save to `Chat History` table instead of `website_chats`
- Use correct column names with spaces

**New Insert:**
```typescript
await supabase
  .from('Chat History')
  .insert({
    'Sender Number': senderNumber,
    'Sender Message': message,
    'Ai Reply': aiResponse,
    created_at: new Date().toISOString(),
  });
```

**n8n Payload Update:**
```typescript
const n8nPayload = {
  message,
  senderNumber,  // Changed from sessionId
  timestamp: new Date().toISOString(),
  source: 'web',
};
```

## User Experience
1. User opens `/whatsapp` page
2. System checks localStorage for saved phone number
3. If exists: loads conversation history from `Chat History` table
4. If not: generates a new web-based identifier (e.g., `web-971505913426`)
5. User sends message, AI responds
6. Conversation saved to `Chat History` table
7. Full history visible on page reload

## Technical Notes
- The `Chat History` table uses column names with spaces (e.g., `Sender Number`)
- TypeScript access requires bracket notation: `chat['Sender Message']`
- The existing RLS policies allow reading by `Sender Number` match

## Summary of Changes

| File | Change |
|------|--------|
| `src/hooks/useWhatsAppChat.ts` | Switch to `Chat History` table, update column names |
| `supabase/functions/whatsapp-web-chat/index.ts` | Save to `Chat History` instead of `website_chats` |

