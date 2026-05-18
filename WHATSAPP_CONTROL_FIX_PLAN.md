# WhatsApp Human/AI Control — Fix Plan

## Problem Statement

When a human agent takes over a WhatsApp conversation from the dashboard and then releases it back to the AI, the AI never resumes responding. Additionally, the AI continues to respond even while the human agent is supposed to be in control.

---

## Root Cause

**n8n always responds to every incoming WhatsApp message automatically without ever checking the `is_human_controlled` state in the database.**

This causes a chain reaction:

1. Human clicks **"Take Over"** → DB rows updated to `is_human_controlled = true`
2. Guest sends a WhatsApp message → n8n receives it, immediately responds, and inserts a new row into `Chat History` with `is_human_controlled = false` (the column default)
3. That new n8n-inserted row is now the **latest row** in the table
4. The `is_conversation_human_controlled` RPC reads `is_human_controlled` from the **latest row** → gets `false` → reports AI mode
5. The dashboard's `loadHistory` reads `latestRecord.is_human_controlled` → sets `isHumanControlled = false` in React state
6. When the human tries to click **"Release to AI"**, `isHumanControlled` in state is already `false`, so `!false = true` → the toggle calls `action: 'takeover'` **instead of** `release`
7. The cycle repeats — the human can never cleanly release

---

## Desired Behaviour

1. When a human agent clicks **"Take Over"**, the AI stops responding completely
2. The human agent replies to the guest from the dashboard
3. When the human clicks **"Release to AI"**, the AI resumes responding to all future messages
4. If the human does not release within **30 minutes** of the last human message, the conversation is automatically released to the AI
5. After release, the AI understands the full conversation history including the human-handled portion

---

## Phase 1 — Fix the Database Layer (RPC)

> **Goal:** Make the control-status function immune to n8n inserting rows with the default `is_human_controlled = false`.

### Why

The current `is_conversation_human_controlled` RPC simply reads the latest row's flag. Any row n8n inserts (with the default `false`) will overwrite the takeover state. The fix is to compare **timestamps**: the most recent takeover event vs the most recent release event.

### Tasks

- [ ] Create a new migration file in `supabase/migrations/` (use current timestamp prefix)
- [ ] Replace the body of `is_conversation_human_controlled` with CTE-based timestamp comparison:

```sql
CREATE OR REPLACE FUNCTION public.is_conversation_human_controlled(p_sender_number text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN last_takeover.ts IS NULL THEN false
    WHEN last_release.ts IS NULL THEN true
    WHEN last_takeover.ts > last_release.ts THEN true
    ELSE false
  END
  FROM
    (SELECT MAX(created_at) AS ts
     FROM public."Chat History"
     WHERE "Sender Number" = p_sender_number
       AND is_human_controlled = true) AS last_takeover,
    (SELECT MAX(released_to_ai_at) AS ts
     FROM public."Chat History"
     WHERE "Sender Number" = p_sender_number
       AND released_to_ai_at IS NOT NULL) AS last_release;
$$;

GRANT EXECUTE ON FUNCTION public.is_conversation_human_controlled(text)
  TO anon, authenticated, service_role;
```

### How to verify Phase 1

- Deploy the migration to Supabase
- In the Supabase SQL editor, manually insert a row with `is_human_controlled = true` for a test sender number, then call `SELECT public.is_conversation_human_controlled('TEST_NUMBER')` → should return `true`
- Insert another row with `released_to_ai_at = NOW()` for the same number → call the function again → should return `false`

---

## Phase 2 — Fix the Edge Functions

> **Goal:** (a) Insert a timestamped takeover marker so Phase 1's RPC has a reliable anchor. (b) Fix auto-release timeout and schedule it to actually run.

### Phase 2a — Insert takeover marker row on takeover

**File:** `supabase/functions/whatsapp-send-message/index.ts`

Currently, the takeover action only runs a bulk `UPDATE` on old rows. Because those old rows have historical timestamps, the Phase 1 RPC's `MAX(created_at WHERE is_human_controlled = true)` would point to an old time — possibly before the last release — and still return `false`.

The fix is to also insert a fresh marker row with `is_human_controlled = true` and `created_at = NOW()` at the moment of takeover.

- [ ] Open `supabase/functions/whatsapp-send-message/index.ts`
- [ ] Find the `if (action === 'takeover' || action === 'release')` block (around line 116)
- [ ] After the `UPDATE` succeeds (after the `if (updateError) { throw updateError }` check), add:

```typescript
// Insert a takeover marker so the timestamp-based RPC has a reliable anchor
if (action === 'takeover') {
  const { error: markerErr } = await supabase.from('Chat History').insert({
    'Sender Number': recipientNumber.trim(),
    is_human_controlled: true,
    created_at: new Date().toISOString(),
  });
  if (markerErr) {
    console.error('Error inserting takeover marker:', markerErr);
  }
}
```

- [ ] Place this new block **before** the existing `if (action === 'release') { ... }` marker block
- [ ] Do **not** change the release marker block — it already inserts `released_to_ai_at` correctly

### Phase 2b — Fix auto-release timeout

**File:** `supabase/functions/whatsapp-auto-release/index.ts`

- [ ] Find line 8: `const IDLE_MINUTES = 60;`
- [ ] Change it to: `const IDLE_MINUTES = 30;`

### Phase 2c — Schedule auto-release via pg_cron

The auto-release function currently **runs never** — pg_cron and pg_net extensions were enabled in an earlier migration but no cron job was ever created.

- [ ] Create a second new migration file in `supabase/migrations/`
- [ ] Add the following pg_cron job (fires every 5 minutes):

```sql
SELECT cron.schedule(
  'whatsapp-auto-release',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/whatsapp-auto-release',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
               ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
```

> **Note:** If `current_setting('app.settings.service_role_key')` is not configured in your Supabase project, schedule this job manually via **Supabase Dashboard → Database → Cron Jobs** using the actual service role key. Do not hard-code the key in a migration file.

### How to verify Phase 2

- Deploy both updated edge functions to Supabase
- From the dashboard, click **"Take Over"** on any conversation
- Check Supabase DB: a new row should exist for that sender with `is_human_controlled = true` and `created_at ≈ NOW()`
- Call `SELECT public.is_conversation_human_controlled('THAT_SENDER_NUMBER')` → should return `true`
- Click **"Release to AI"** → call the function again → should return `false`
- Check the Supabase Dashboard → Database → Cron Jobs → confirm `whatsapp-auto-release` is listed and active

---

## Phase 3 — Fix the Frontend

> **Goal:** The dashboard must read `isHumanControlled` from the authoritative RPC, not from the latest row's flag (which n8n corrupts with its default-`false` rows).

**File:** `src/hooks/useWhatsAppChat.ts`

### Task 3a — Fix `loadHistory`

- [ ] Find the section inside `loadHistory` that sets `isHumanControlled` from the latest record (around lines 128–129):

```typescript
// CURRENT (broken) — reads is_human_controlled from n8n's latest row
const latestRecord = data[data.length - 1];
setIsHumanControlled(latestRecord.is_human_controlled ?? false);
```

- [ ] Replace those two lines with an RPC call:

```typescript
// FIXED — reads authoritative state regardless of n8n row inserts
const { data: controlData } = await supabase.rpc(
  'is_conversation_human_controlled',
  { p_sender_number: sanitizedSenderNumber }
);
setIsHumanControlled(Boolean(controlData));
```

### Task 3b — Fix the realtime subscription handler

- [ ] Find the realtime INSERT handler block (around line 294) that updates `isHumanControlled` from the realtime payload:

```typescript
// CURRENT (broken) — trusts the payload's is_human_controlled flag
if (typeof chat['is_human_controlled'] === 'boolean') {
  setIsHumanControlled(chat['is_human_controlled'] as boolean);
}
```

- [ ] Replace that block with an RPC re-check so n8n's insertions can't directly flip the control state:

```typescript
// FIXED — re-query authoritative state on every DB insert
supabase
  .rpc('is_conversation_human_controlled', { p_sender_number: sanitizedSenderNumber })
  .then(({ data: controlData }) => {
    setIsHumanControlled(Boolean(controlData));
  });
```

### How to verify Phase 3

- Open the dashboard and load a conversation
- In Supabase SQL editor, manually insert a row for that sender with `is_human_controlled = false` (simulating an n8n insert)
- The dashboard's "Take Over" / "Human Agent Active" state should **not** change — it should stay as it was before the manual insert

---

## Phase 4 — Fix n8n (Manual Action Required)

> **Goal:** Stop n8n from responding to WhatsApp messages when the conversation is in human-agent mode.

> ⚠️ This is a **manual change inside your n8n workflow**. It cannot be done from this codebase.

This is the most critical phase. Without it, n8n will keep inserting AI-reply rows and the entire control system breaks regardless of the other fixes.

### Tasks

- [ ] Open the n8n workflow that handles **incoming WhatsApp messages** (the one triggered by the WhatsApp Cloud API webhook)
- [ ] At the very **start** of the workflow, before any AI processing node, add an **HTTP Request** node:
  - Method: `GET`
  - URL: `https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/whatsapp-control-status?senderNumber={{ $json.entry[0].changes[0].value.messages[0].from }}`
  - No Authorization header needed (`verify_jwt = false` is already set on this function)
- [ ] Add an **IF** node immediately after:
  - Condition: `{{ $json.isHumanControlled }}` equals `true`
  - **True branch (human mode):**
    - Insert the guest message into `Chat History` via Supabase (so the human agent sees it in the dashboard):
      - `Sender Number` = the guest's phone number
      - `Sender Message` = the message text
      - `is_human_controlled` = `true`
    - **Stop here** — do NOT call the AI or send any response back to WhatsApp
  - **False branch (AI mode):**
    - Continue to the existing AI processing nodes as normal

### How to verify Phase 4

- With the n8n workflow updated and deployed, take over a conversation from the dashboard
- Have someone send a WhatsApp message to the hotel number
- Confirm: **no AI reply is sent**, but the message appears in the dashboard chat panel
- Release the conversation from the dashboard
- Have the same person send another WhatsApp message
- Confirm: **n8n responds with AI** and the reply is visible in the dashboard

---

## End-to-End Verification (all phases complete)

1. Open the dashboard → load a conversation
2. Click **"Take Over"** → orange "Human Agent Active" banner appears
3. Guest sends a WhatsApp message → **AI does NOT respond** (Phase 4)
4. Reply as human from the dashboard → message appears with orange human label
5. Click **"Release to AI"** → banner disappears
6. Guest sends another WhatsApp message → **AI responds** (Phases 1–4 working together)
7. Take over again, send one human message, then wait 30 minutes without further activity → dashboard should switch back to AI mode automatically (Phase 2b + 2c)
8. Call `https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/whatsapp-control-status?senderNumber=XXXX` at each step to confirm the reported state matches what you see in the UI
