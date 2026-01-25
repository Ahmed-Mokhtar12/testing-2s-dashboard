
# WhatsApp Web Landing Page with n8n Workflow Integration

## Overview
Create a WhatsApp-style chat page (`/whatsapp`) that connects directly to the n8n workflow webhook. All messages sent from this page will be visible in the n8n workflow execution logs, allowing you to see the complete conversation (user messages + AI responses) directly in n8n.

## How It Works

```text
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Web Page Chat     │     │   Edge Function     │     │   n8n Workflow      │
│   /whatsapp         │────▶│  whatsapp-web-chat  │────▶│   Webhook Trigger   │
│                     │◀────│                     │◀────│   + AI Agent        │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
                                                                   │
                                                                   ▼
                                                        ┌─────────────────────┐
                                                        │  You can see the    │
                                                        │  full conversation  │
                                                        │  in n8n execution   │
                                                        │  logs               │
                                                        └─────────────────────┘
```

## Files to Create

### 1. WhatsApp Landing Page
**File:** `src/pages/WhatsAppLanding.tsx`

A full-page WhatsApp Web-style interface with:
- Green header with hotel logo and "Two Seasons Hotel Dubai" title
- Chat area with WhatsApp-style message bubbles
- Message input with send button
- WhatsApp's signature design (green checkmarks, timestamps, etc.)

### 2. WhatsApp Components

**File:** `src/components/whatsapp/WhatsAppHeader.tsx`
- Hotel avatar and name
- Online status indicator
- Back button to return to main chat

**File:** `src/components/whatsapp/WhatsAppMessage.tsx`
- Message bubbles styled like WhatsApp
- Sent messages: green background, right-aligned
- Received messages: white background, left-aligned
- Timestamps and checkmarks

**File:** `src/components/whatsapp/WhatsAppInput.tsx`
- Input field with emoji button
- Attachment button
- Send button
- Mic button (styling only)

**File:** `src/components/whatsapp/WhatsAppChat.tsx`
- Container for messages and input
- Welcome message from the hotel

### 3. Chat Hook
**File:** `src/hooks/useWhatsAppChat.ts`

Manages chat state:
- Messages array (user + AI)
- Sending messages to Edge Function
- Receiving responses
- Loading state

### 4. Edge Function
**File:** `supabase/functions/whatsapp-web-chat/index.ts`

Bridge between web page and n8n:
- Receives message from web page
- Sends POST request to n8n webhook
- Returns AI response to web page
- Saves conversation to `website_chats` table

## Files to Modify

### 1. App Router
**File:** `src/App.tsx`

Add new route:
```tsx
<Route path="/whatsapp" element={<WhatsAppLanding />} />
```

### 2. WhatsApp Icon Link
**File:** `src/components/ChatHeader.tsx`

Change from:
```tsx
<a href="https://wa.me/" target="_blank" ...>
```

To internal navigation:
```tsx
<Link to="/whatsapp" ...>
```

### 3. Supabase Config
**File:** `supabase/config.toml`

Add Edge Function configuration:
```toml
[functions.whatsapp-web-chat]
verify_jwt = false
```

## Webhook Configuration

The Edge Function will send requests to the n8n webhook you provided:

**Webhook URL:** `https://n8n.srv1095066.hstgr.cloud/webhook/d3728736-d495-40b2-9a05-a0ddc7480c69/webhook`

This needs to be stored as a Supabase secret: `N8N_WHATSAPP_WEBHOOK_URL`

## Technical Details

### Message Flow
1. User types message in WhatsApp-style input
2. Frontend sends message to Edge Function
3. Edge Function POSTs to n8n webhook with payload:
   ```json
   {
     "message": "User's message text",
     "sessionId": "unique-session-id",
     "timestamp": "2026-01-25T12:00:00Z",
     "source": "web"
   }
   ```
4. n8n processes via AI Agent (you see this in n8n execution)
5. n8n returns AI response
6. Edge Function returns response to frontend
7. Frontend displays AI response in WhatsApp-style bubble

### What You'll See in n8n
When a user sends a message from the web page:
- The webhook trigger shows the incoming message
- The AI Agent node shows the processing
- The response node shows what's being sent back
- Full conversation history is visible in execution data

### Design Colors (WhatsApp Theme)
- Header: `#128C7E` (WhatsApp dark green)
- Sent messages: `#DCF8C6` (WhatsApp green bubble)
- Chat background: `#E5DDD5` (WhatsApp pattern)
- Input area: `#F0F0F0`

## Secret Required

**N8N_WHATSAPP_WEBHOOK_URL:** `https://n8n.srv1095066.hstgr.cloud/webhook/d3728736-d495-40b2-9a05-a0ddc7480c69/webhook`

This secret needs to be added to Supabase before the Edge Function will work.

## Summary

| File | Type | Purpose |
|------|------|---------|
| `src/pages/WhatsAppLanding.tsx` | New | Main WhatsApp-style page |
| `src/components/whatsapp/WhatsAppHeader.tsx` | New | Header component |
| `src/components/whatsapp/WhatsAppMessage.tsx` | New | Message bubble component |
| `src/components/whatsapp/WhatsAppInput.tsx` | New | Input area component |
| `src/components/whatsapp/WhatsAppChat.tsx` | New | Chat container component |
| `src/hooks/useWhatsAppChat.ts` | New | Chat state management |
| `supabase/functions/whatsapp-web-chat/index.ts` | New | Edge Function for n8n |
| `src/App.tsx` | Modify | Add /whatsapp route |
| `src/components/ChatHeader.tsx` | Modify | Update icon link |
| `supabase/config.toml` | Modify | Add function config |

