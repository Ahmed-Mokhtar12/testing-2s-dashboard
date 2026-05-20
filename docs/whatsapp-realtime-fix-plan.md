# Plan: Real-Time Message Updates for WhatsApp Human Takeover

## Context

The WhatsApp chat interface never shows incoming guest messages in real-time — a page refresh is always required, in both AI mode and human takeover mode. The codebase already has a Supabase Realtime (WebSocket) subscription set up in `useWhatsAppChat.ts`, but it silently delivers no events. The fix uses two layers: (1) ensure the Supabase database is correctly configured for Realtime, and (2) add a polling fallback in the frontend that guarantees messages appear even if the WebSocket subscription still has issues.

---

## Implementation Checklist

Work through each item in order. Mark each one `[x]` when done.

### Layer 1 — Supabase Database Configuration

- [x] **1.1** Open the Supabase SQL Editor for this project
- [x] **1.2** Run the SQL below to set `REPLICA IDENTITY FULL` on `Chat History` and add it to the `supabase_realtime` publication (idempotent — safe to re-run):

```sql
-- Ensure Postgres sends full row data with every change event
ALTER TABLE public."Chat History" REPLICA IDENTITY FULL;

-- Ensure the table is in the Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Chat History'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Chat History";
  END IF;
END $$;
```

- [x] **1.3** Confirm the SQL ran without errors in the Supabase SQL Editor

---

### Layer 2 — Polling Fallback in `src/hooks/useWhatsAppChat.ts`

- [x] **2.1** Add a `lastMessageTsRef` ref near the top of the hook, alongside the other state/ref declarations:

```typescript
const lastMessageTsRef = useRef<string>(new Date(0).toISOString());
```

- [x] **2.2** Add a sync effect to keep `lastMessageTsRef` updated whenever the messages array changes. Place this alongside the other `useEffect` calls:

```typescript
useEffect(() => {
  if (messages.length > 0) {
    lastMessageTsRef.current = messages[messages.length - 1].timestamp.toISOString();
  }
}, [messages]);
```

- [x] **2.3** Add the 8-second polling effect alongside the existing Realtime subscription effect. It reuses the same row-processing and deduplication logic already in the file:

```typescript
useEffect(() => {
  if (!sanitizedSenderNumber) return;

  const poll = async () => {
    const { data, error } = await supabase
      .from('Chat History')
      .select('*')
      .eq('Sender Number', sanitizedSenderNumber)
      .eq('is_archived', false)
      .gt('created_at', lastMessageTsRef.current)
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) return;

    const newMessages: WhatsAppMessage[] = [];
    for (const row of data) {
      // User (guest) message
      if (row['Sender Message']) {
        let attachment: UploadedAttachment | undefined;
        if (row['Media']) {
          try {
            const parsed = typeof row['Media'] === 'string'
              ? JSON.parse(row['Media'])
              : row['Media'];
            if (parsed && typeof parsed === 'object' && parsed.url) {
              attachment = parsed as UploadedAttachment;
            }
          } catch {
            // plain URL string — handled via mediaUrl below
          }
        }
        newMessages.push({
          id: `user-${row.id}`,
          content: row['Sender Message'],
          isUser: true,
          timestamp: new Date(row.created_at),
          mediaUrl: typeof row['Media'] === 'string' && !row['Media'].startsWith('{')
            ? row['Media']
            : undefined,
          attachment,
        });
      }

      // AI reply
      if (row['Ai Reply']) {
        newMessages.push({
          id: `ai-${row.id}`,
          content: row['Ai Reply'],
          isUser: false,
          isHumanReply: false,
          timestamp: new Date(row.created_at),
        });
      }

      // Human agent reply
      if (row['human_reply']) {
        newMessages.push({
          id: `human-${row.id}`,
          content: row['human_reply'],
          isUser: false,
          isHumanReply: true,
          timestamp: new Date(row.created_at),
          repliedByName: row['replied_by_name'] ?? undefined,
        });
      }
    }

    if (newMessages.length === 0) return;

    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const fresh = newMessages.filter((m) => !existingIds.has(m.id));
      return fresh.length > 0 ? [...prev, ...fresh] : prev;
    });
  };

  const interval = setInterval(poll, 8000);
  return () => clearInterval(interval);
}, [sanitizedSenderNumber]); // `messages` intentionally excluded — lastMessageTsRef avoids the stale closure
```

- [x] **2.4** Verify TypeScript compiles without errors (`npm run build` or `tsc --noEmit`)

---

### Verification

- [x] **3.1** Open the WhatsApp chat panel in the browser and select an active conversation
- [x] **3.2** From a real phone, send a WhatsApp message to the hotel number
- [x] **3.3** Confirm the message appears in the dashboard **without refreshing the page** (within 8 seconds at most)
- [x] **3.4** Click "Take Over", send a reply from the dashboard, then have the guest reply back — confirm the guest reply appears without any page refresh
- [x] **3.5** Open browser DevTools → Network → WS tab — confirm a Supabase Realtime WebSocket connection is open and active

---

## Files Changed

| File | What changed |
|---|---|
| Supabase SQL Editor (not a file) | Enabled `REPLICA IDENTITY FULL` and added `Chat History` to `supabase_realtime` publication |
| `src/hooks/useWhatsAppChat.ts` | Added `lastMessageTsRef`, a messages-sync effect, and an 8-second polling effect |

---

## Background: Root Cause Analysis

Three likely reasons the existing WebSocket subscription was not delivering events:

1. **Migration not applied to remote DB** — The migration that enables Realtime (`supabase/migrations/20260420124713_6c2fc53a-8672-4467-b6cd-8b06c1a26141.sql`) may exist locally but not have been pushed to the Supabase project. Without `REPLICA IDENTITY FULL` and the `supabase_realtime` publication, Postgres emits no change events.

2. **Filter syntax with a space in the column name** — The existing subscription filter `'Sender Number=eq.${sanitizedSenderNumber}'` contains a space in the column name. Supabase Realtime's PostgREST-style filter parser may silently misinterpret this, causing the filter to match nothing (hence no events delivered).

3. **RLS blocking realtime events** — Supabase Realtime with RLS enabled only delivers events the subscribed user can SELECT. The polling fallback bypasses this entirely by using the normal Supabase client query path.
