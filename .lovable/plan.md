
## Refactor `execute-n8n-action` to Use `N8N_WHATSAPP_WEBHOOK_URL`

### Problem
The `execute-n8n-action` Edge Function currently tries to build the webhook URL from two separate environment variables:
- `N8N_BASE_URL` — **missing from secrets**
- `N8N_WEBHOOK_ID` — **missing from secrets**

This means the constructed URL is always `undefined/webhook/undefined`, so **every email, SMS, and WhatsApp action fails**.

### Solution
Replace the two missing variables with the single `N8N_WHATSAPP_WEBHOOK_URL` secret that **already exists** in the project. This is a minimal, clean refactor with no new secrets needed.

---

### Changes Required

#### File: `supabase/functions/execute-n8n-action/index.ts`

**Change 1 — Replace the broken URL construction (lines 18–23):**

Remove:
```ts
const N8N_BASE_URL = Deno.env.get('N8N_BASE_URL');
const N8N_WEBHOOK_ID = Deno.env.get('N8N_WEBHOOK_ID');

if (!N8N_BASE_URL || !N8N_WEBHOOK_ID) {
  console.error('🚨 Missing N8N configuration: N8N_BASE_URL or N8N_WEBHOOK_ID not set');
}
```

Replace with:
```ts
const N8N_WEBHOOK_URL = Deno.env.get('N8N_WHATSAPP_WEBHOOK_URL');

if (!N8N_WEBHOOK_URL) {
  console.error('🚨 Missing N8N configuration: N8N_WHATSAPP_WEBHOOK_URL not set');
}
```

**Change 2 — Fix the webhook URL inside `executeActionViaN8N` (line 42):**

Remove:
```ts
const webhookUrl = `${N8N_BASE_URL}/webhook/${N8N_WEBHOOK_ID}`;
```

Replace with:
```ts
const webhookUrl = N8N_WEBHOOK_URL!;
```

---

### Why This Works
- `N8N_WHATSAPP_WEBHOOK_URL` already holds the complete webhook URL (`https://n8n.srv1095066.hstgr.cloud/webhook/...`) used for sending messages to n8n
- No new secrets need to be added
- All existing functionality (HMAC signing, retry logic, validation, CORS) remains untouched
- The Edge Function will be automatically redeployed after the code change

### Note on Action Types
The current setup uses a single webhook URL for all action types (email, SMS, WhatsApp). The `actionType` field in the payload sent to n8n (`email`, `sms`, or `whatsapp`) allows the n8n workflow to route the action to the correct node internally. Make sure your n8n workflow has routing logic based on this `actionType` field.
