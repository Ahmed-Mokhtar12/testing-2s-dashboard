# Sera Data Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sera (the `chat-with-data` edge function) able to securely retrieve and reason over all 8 dashboard data domains instead of 1, with per-domain query tools, honest fallbacks, and working session persistence.

**Architecture:** `chat-with-data` is a Deno Supabase edge function called only by the authenticated dashboard Sera panel. Fixes proceed in dependency order: security hardening is already committed (deploy it first), then wire fetched data into the model prompt, then point the always-on context fetches at the real tables, then add one forced-function-call query tool per domain (modeled on the working `query_training_records`), then correctness cleanup (session persistence, fabrication engine, persona, dead code).

**Tech Stack:** Deno edge functions (esm.sh supabase-js 2.50.2), OpenAI-compatible gateway (`openai/gpt-5.2` via Lovable gateway), React/Vite frontend, Postgres with RLS. Unit tests: pure `.ts` modules run with `npx tsx --test` (Deno is not installed on this server).

## Global Constraints

- **Live project:** Supabase project `yczcebfaqerlwfalrbjn`; deployed function version at plan time: v283 + commit `1cb258f` (auth layers, not yet deployed).
- **Deploy path (from memory, verified 2026-07-29; amended per user decision):** CLI Docker bundling fails on this server; deploy with `--use-api` via the helper script `deploy.sh` in the scratchpad (`/tmp/claude-0/-home-digitlab-testing-2s-dashboard-htdocs-testing-2s-dashboard-digitlab-ai/02841fdc-9083-467b-8a7a-f4e3fe58135b/scratchpad/deploy.sh`), which refreshes a scratch workdir from the repo and deploys. **The USER runs the deploy in their own shell** (the access token never enters the chat): `SUPABASE_ACCESS_TOKEN=<token> bash <scratchpad>/deploy.sh`. Claude then independently confirms the new version + `verify_jwt: true` via the management API (no token needed) and runs the gate curls. Do **NOT** pass `--no-verify-jwt` anywhere.
- **Deploy batching (user decision):** deploy checkpoints are Task 1 (solo), Tasks 2+3, Tasks 4+5, Tasks 6+7, Task 8 (solo), Tasks 9+10. Task 11 needs no deploy (see task). Each task keeps its own commit, unit tests, and post-deploy ground-truth check; the deploy gate runs after every deploy.
- **Deploy gate (every task that changes the function):** after deploy, both curls below MUST return 401. `ANON_KEY` is `VITE_SUPABASE_PUBLISHABLE_KEY` from the repo `.env`.
  ```bash
  URL=https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/chat-with-data
  # no auth header at all -> 401 from the gateway
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL" -H 'Content-Type: application/json' -d '{"message":"hi","messageId":"gate-test"}'
  # anon key only (valid project JWT, no user) -> 401 {"error":"Not authenticated."} from getCallerEmail gate
  curl -s -w '\n%{http_code}\n' -X POST "$URL" -H "Authorization: Bearer $ANON_KEY" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d '{"message":"hi","messageId":"gate-test"}'
  ```
- **One task per commit**, committed on `main` (user preference), message style `feat(sera): ...` / `fix(sera): ...`, footer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Verify before implementing:** each task starts with a verification step re-checking the finding against live code/DB. If verification fails, STOP the task and report.
- **Ask the user before any change that could break a live surface** (frontend Sera panel changes in Task 8; RLS migrations in Task 8).
- **Function stdout is NOT visible via MCP `get_logs`** — verify behavior by comparing responses with SQL ground truth, not by log reading.
- **RLS caveat (accepted design):** after the auth change, `training_sessions`/`training_participants` reads return rows only for the 3 admin emails (`ahmed.mokhtar@`, `amir.monir@`, `xarmaigne.narciso@2seasonshotels.com`). Other staff get an honest "no records" answer. Widening that policy is a separate user decision, not part of this plan.
- **Out of scope:** data freshness (newest review 2026-05-18; `welcome_message_success_log` empty last 3 days) is an ingestion problem. Note in answers, don't fix.
- **Live table/column ground truth** (verified against `information_schema` 2026-07-29; quote names with spaces in `.from()` exactly as shown):
  - `Two Seasons and Reviews` — `id, "Date"(date), "Hotel Name", Source, Language, Score(numeric), URL, Author, Title, Text, "Response Text"` — **no `created_at`**; date filters use plain `YYYY-MM-DD` on `"Date"`.
  - `Chat History` — `id, created_at(timestamptz), "Sender Number", "Sender Message", "Ai Reply", is_archived, Media, Name, is_human_controlled, human_reply, released_to_ai_at, replied_by_user_id, replied_by_name`.
  - `2Seasons_Sera_Email_Log` — `id, email_type, thread_key, category, sender_number, sender_name, guest_name, guest_email, nature_of_request, email_subject, email_to, email_cc, arrival, departure, outlook_message_id, internet_message_id, conversation_id, sent_at(timestamptz), created_at, updated_at`.
  - `info_email_audit_log` — `id, processed_at, subject, sender, action, department, confidence, reason, override, error, created_at(timestamptz)`.
  - `Two Seasons Competitor Hotel room Rates` — key cols: `report_date(date), hotel_name, checkin_date, converted_price_aed(numeric), status, dry_run(bool), is_lowest_for_day, lowest_price_for_day_aed`.
  - `social_engagement_logs` — `id, created_at(timestamptz), platform, channel, event_type, sender_name, guest_message_text, reply_text, escalation_flag, status, notes`.
  - `welcome_message_success_log` — `id, sent_at(timestamptz), sent_date(date), mobile_number, guest_id, full_name, reservation_id, room_number, arrival_date, departure_date, status`.
  - `2s-dashboard_AI_Chat` — `id(uuid), session_id, user_message, ai_response, created_at(timestamptz), is_archived, user_id(uuid)`.
  - RPCs that exist live: `get_recent_document_context`, `mark_recent_document_context`, `is_conversation_human_controlled`.
  - Confirmed NOT to exist: `Hotel Reviews`, `Info Summary`, `website_chats`, `reviews`, `email_threads`, `Conducted Training`, `uploaded_documents`, `Sop`.
- **RLS read access for authenticated staff** (verified in `pg_policies`): SELECT allowed via `is_hotel_staff(auth.uid())` on all seven domain tables above plus `Chat History`, `LongTermMemory`, `2s-dashboard_AI_Chat`. No INSERT policies for authenticated on `LongTermMemory` / `2s-dashboard_AI_Chat` (Task 8 adds them).

---

### Task 1: Deploy the committed auth hardening and verify the 401 gate

**Files:**
- No code changes. Deploy commit `1cb258f` (already on `main`): config.toml `verify_jwt = true`, `getCallerEmail` 401 gate, anon-key + caller-JWT clients.

**Interfaces:**
- Consumes: `getCallerEmail(req)` from `supabase/functions/_shared/auth.ts` (returns `string | null`).
- Produces: a deployed function where every later task's deploy gate is meaningful. No exported symbols.

- [ ] **Step 1: Verify preconditions**

```bash
git log --oneline -3   # expect 1cb258f as most recent sera commit
grep -A1 'functions.chat-with-data' supabase/config.toml   # expect verify_jwt = true
```

- [ ] **Step 2: Ensure `deploy.sh` exists in the scratchpad** (Claude writes it; it refreshes the scratch workdir from the repo — minimal config.toml with `verify_jwt = true`, copies `chat-with-data` + `_shared`, strips `*-old.ts` and `*.test.ts` — then runs `npx supabase functions deploy chat-with-data --project-ref yczcebfaqerlwfalrbjn --use-api`).

- [ ] **Step 3: USER deploys from their own shell** (token never enters chat):

```bash
SUPABASE_ACCESS_TOKEN=<token> bash /tmp/claude-0/-home-digitlab-testing-2s-dashboard-htdocs-testing-2s-dashboard-digitlab-ai/02841fdc-9083-467b-8a7a-f4e3fe58135b/scratchpad/deploy.sh
```
User reports exit 0; Claude independently confirms via the management API that the deployed version is > 283 and `verify_jwt: true`.

- [ ] **Step 4: Run the deploy gate** (both curls from Global Constraints). Expected: `401` and `{"error":"Not authenticated."}` + `401`.

- [ ] **Step 5: Signed-in smoke test** — ask the user to send one message in the dashboard Sera panel and confirm a normal reply (their JWT passes the gate).

- [ ] **Step 6: No commit needed** (code already committed). Record the deployed version number in the task report.

---

### Task 2: Make fetched data reach the model (B1 + B2)

**Files:**
- Create: `supabase/functions/chat-with-data/message-composer.ts`
- Modify: `supabase/functions/chat-with-data/openai-client.ts` (createMessages, ~line 120)
- Modify: `supabase/functions/chat-with-data/system-prompt-builder.ts:5` (remove dead `dataContext` param)
- Modify: `supabase/functions/chat-with-data/index.ts:151` (stop passing context into buildConsultantPrompt)
- Test: `tests/unit/message-composer.test.ts`

**Interfaces:**
- Consumes: existing `SystemPromptBuilder.buildConsultantPrompt(conversationData)` and `OpenAIClient.createMessages(context, userMessage, consultantPrompt?)`.
- Produces: `composeSystemContent(consultantPrompt: string | undefined, context: string | undefined): string` exported from `message-composer.ts`. Later tasks rely on: persona goes first, data context follows under the exact heading `## RETRIEVED DATA (live database context — treat as ground truth)`.

- [ ] **Step 1: Verify the finding** — confirm `system-prompt-builder.ts` uses `dataContext` zero times outside its signature, and `openai-client.ts` line ~122 reads `consultantPrompt || context`:

```bash
grep -c 'dataContext' supabase/functions/chat-with-data/system-prompt-builder.ts   # expect 1
grep -n 'consultantPrompt || context' supabase/functions/chat-with-data/openai-client.ts
```

- [ ] **Step 2: Write the failing test** — `tests/unit/message-composer.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails** — `npx tsx --test tests/unit/message-composer.test.ts` — expected: FAIL (module not found).

- [ ] **Step 4: Implement `message-composer.ts`** (pure, no Deno APIs so Node tests can import it):

```ts
// Composes the system message. The persona prompt defines behavior; the data
// context carries retrieved rows. Both must reach the model — a bug that
// dropped the context (consultantPrompt || context) hid all data from Sera.
export function composeSystemContent(consultantPrompt?: string, context?: string): string {
  const persona = consultantPrompt?.trim();
  const data = context?.trim();
  if (persona && data) {
    return `${persona}\n\n## RETRIEVED DATA (live database context — treat as ground truth)\n${data}`;
  }
  return persona || data || '';
}
```

- [ ] **Step 5: Wire it into `openai-client.ts`** — add `import { composeSystemContent } from './message-composer.ts';` and change `createMessages`:

```ts
createMessages(context: string, userMessage: string, consultantPrompt?: string): OpenAIMessage[] {
  return [
    { role: 'system', content: composeSystemContent(consultantPrompt, context) },
    { role: 'user', content: userMessage }
  ];
}
```

- [ ] **Step 6: Remove the dead param** — `system-prompt-builder.ts:5` signature becomes `static buildConsultantPrompt(conversationData: ConversationData): string {`, and `index.ts` call becomes `SystemPromptBuilder.buildConsultantPrompt(conversationData)`.

- [ ] **Step 7: Run tests** — `npx tsx --test tests/unit/message-composer.test.ts` — expected: 3 pass. Also `grep -rn 'buildConsultantPrompt' supabase/functions/` to confirm no call site still passes two args.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/chat-with-data/ tests/unit/message-composer.test.ts
git commit -m "fix(sera): pass retrieved data context to the model (was always discarded)"
```

- [ ] **Step 9: Deploy + run deploy gate + smoke test.** After deploy, ask Sera (via the user or a user-JWT curl) "How many WhatsApp messages are in your current context?" — she should now reference actual recent Chat History rows (the only live table currently fetched).

---

### Task 3: Point the always-on context fetches at real tables with question-driven dates (C1)

**Files:**
- Create: `supabase/functions/chat-with-data/context-data-fetcher.ts`
- Modify: `supabase/functions/chat-with-data/index.ts:88-100` (replace the Promise.allSettled block), `index.ts:59` (`website_chats` → `2s-dashboard_AI_Chat` read)
- Modify: `supabase/functions/chat-with-data/enhanced-context-builder.ts` (map real column names)
- Test: `tests/unit/context-data-fetcher.test.ts`

**Interfaces:**
- Consumes: `SmartQueryAnalysis` from `types.ts` (`{ type, startDate?, endDate?, description }`, dates as `YYYY-MM-DD`); `buildDateRange(from?, to?)` from `training-aggregator.ts` (returns `{ fromISO?, toExclusiveISO?, error? }` with `+04:00` Dubai bounds).
- Produces: `resolveDateBounds(qa: { startDate?: string; endDate?: string })` → `{ fromISO?: string; toExclusiveISO?: string; fromDateKey?: string; toDateKey?: string }` and `fetchDashboardSnapshot(supabase, qa)` → `Promise<DashboardSnapshot>` where `DashboardSnapshot = { reviews, whatsapp, seraEmails, infoEmails, competitorRates, social, welcome, memory, errors: string[] }` (each domain: `{ rows: any[], count: number | null }`). Task 10's prompt text names these seven domains.

- [ ] **Step 1: Verify the finding** — `to_regclass` check that the four bad names are still absent and the seven real tables exist (SQL in Global Constraints ground truth; run via MCP `execute_sql`). Confirm `index.ts:88-93` still queries the bad names.

- [ ] **Step 2: Write the failing test** — `tests/unit/context-data-fetcher.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDateBounds } from '../../supabase/functions/chat-with-data/context-data-fetcher.ts';

test('maps YYYY-MM-DD bounds to Dubai ISO range and date keys', () => {
  const b = resolveDateBounds({ startDate: '2026-07-26', endDate: '2026-07-28' });
  assert.equal(b.fromISO, '2026-07-26T00:00:00+04:00');
  assert.equal(b.toExclusiveISO, '2026-07-29T00:00:00+04:00'); // exclusive upper bound
  assert.equal(b.fromDateKey, '2026-07-26');
  assert.equal(b.toDateKey, '2026-07-28');
});

test('returns empty bounds when analysis has no dates', () => {
  const b = resolveDateBounds({});
  assert.equal(b.fromISO, undefined);
  assert.equal(b.toDateKey, undefined);
});

test('clamps invalid endDate like 2026-02-31 to a real date key', () => {
  const b = resolveDateBounds({ startDate: '2026-02-01', endDate: '2026-02-31' });
  assert.equal(b.toDateKey, '2026-02-28'); // query-analyzer emits -31 blindly; clamp, don't error
});
```

Note: the two ISO assertions assume `buildDateRange`'s literal output format. Read `training-aggregator.ts:24-53` first; if it emits a different literal (e.g. with milliseconds), update the expected strings — the invariant under test is Dubai-midnight bounds with an exclusive upper bound, not the exact string shape.

- [ ] **Step 3: Run to verify failure** — `npx tsx --test tests/unit/context-data-fetcher.test.ts` — FAIL (module not found).

- [ ] **Step 4: Implement `context-data-fetcher.ts`:**

```ts
import { buildDateRange } from './training-aggregator.ts';

const CAPS = { reviews: 60, whatsapp: 200, seraEmails: 40, infoEmails: 40, competitorRates: 120, social: 40, welcome: 40, memory: 20 };

export function resolveDateBounds(qa: { startDate?: string; endDate?: string }) {
  if (!qa?.startDate && !qa?.endDate) return {};
  const clamp = (s?: string) => {
    if (!s) return undefined;
    const [y, m, d] = s.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // query-analyzer emits day 31 for every month
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
  };
  const fromDateKey = clamp(qa.startDate);
  const toDateKey = clamp(qa.endDate);
  const range = buildDateRange(fromDateKey, toDateKey);
  if (range.error) return {};
  return { fromISO: range.fromISO, toExclusiveISO: range.toExclusiveISO, fromDateKey, toDateKey };
}

function tsQuery(supabase: any, table: string, cols: string, tsCol: string, b: ReturnType<typeof resolveDateBounds>, cap: number) {
  let q = supabase.from(table).select(cols, { count: 'exact' }).order(tsCol, { ascending: false }).limit(cap);
  if (b.fromISO) q = q.gte(tsCol, b.fromISO);
  if (b.toExclusiveISO) q = q.lt(tsCol, b.toExclusiveISO);
  return q;
}

function dateQuery(supabase: any, table: string, cols: string, dateCol: string, b: ReturnType<typeof resolveDateBounds>, cap: number) {
  let q = supabase.from(table).select(cols, { count: 'exact' }).order(dateCol, { ascending: false }).limit(cap);
  if (b.fromDateKey) q = q.gte(dateCol, b.fromDateKey);
  if (b.toDateKey) q = q.lte(dateCol, b.toDateKey);
  return q;
}

export async function fetchDashboardSnapshot(supabase: any, qa: { startDate?: string; endDate?: string }) {
  const b = resolveDateBounds(qa);
  const [reviews, whatsapp, seraEmails, infoEmails, competitorRates, social, welcome, memory] = await Promise.allSettled([
    dateQuery(supabase, 'Two Seasons and Reviews', 'id,"Date","Hotel Name",Source,Language,Score,Author,Title,Text', 'Date', b, CAPS.reviews),
    tsQuery(supabase, 'Chat History', 'id,created_at,"Sender Number",Name,"Sender Message","Ai Reply",human_reply,is_human_controlled', 'created_at', b, CAPS.whatsapp),
    tsQuery(supabase, '2Seasons_Sera_Email_Log', 'id,sent_at,email_type,category,nature_of_request,guest_name,email_subject', 'sent_at', b, CAPS.seraEmails),
    tsQuery(supabase, 'info_email_audit_log', 'id,created_at,subject,sender,action,department,confidence,override', 'created_at', b, CAPS.infoEmails),
    dateQuery(supabase, 'Two Seasons Competitor Hotel room Rates', 'id,report_date,hotel_name,checkin_date,converted_price_aed,status,is_lowest_for_day', 'report_date', b, CAPS.competitorRates).eq('dry_run', false).in('status', ['success', 'price_found']),
    tsQuery(supabase, 'social_engagement_logs', 'id,created_at,platform,channel,event_type,sender_name,guest_message_text,escalation_flag,status', 'created_at', b, CAPS.social),
    tsQuery(supabase, 'welcome_message_success_log', 'id,sent_at,sent_date,full_name,room_number,arrival_date,status', 'sent_at', b, CAPS.welcome),
    tsQuery(supabase, 'LongTermMemory', 'id,created_at,message,sender,recipient', 'created_at', b, CAPS.memory),
  ]);
  const unwrap = (r: PromiseSettledResult<any>, label: string, errors: string[]) => {
    if (r.status === 'rejected') { errors.push(`${label}: ${r.reason}`); return { rows: [], count: null }; }
    if (r.value.error) { errors.push(`${label}: ${r.value.error.message}`); return { rows: [], count: null }; }
    return { rows: r.value.data ?? [], count: r.value.count ?? null };
  };
  const errors: string[] = [];
  return {
    reviews: unwrap(reviews, 'reviews', errors),
    whatsapp: unwrap(whatsapp, 'whatsapp', errors),
    seraEmails: unwrap(seraEmails, 'seraEmails', errors),
    infoEmails: unwrap(infoEmails, 'infoEmails', errors),
    competitorRates: unwrap(competitorRates, 'competitorRates', errors),
    social: unwrap(social, 'social', errors),
    welcome: unwrap(welcome, 'welcome', errors),
    memory: unwrap(memory, 'memory', errors),
    errors,
  };
}
```

Note: `.eq/.in` chained after `dateQuery(...)` works because PostgREST builders are chainable after `limit/order`.

- [ ] **Step 5: Run the unit test** — expected: 3 pass.

- [ ] **Step 6: Rewire `index.ts`** — replace the `Promise.allSettled([...])` block and the `allData` assembly with:

```ts
const snapshot = await fetchDashboardSnapshot(supabase, queryAnalysis);
console.log('📊 Snapshot counts:', Object.fromEntries(Object.entries(snapshot).filter(([k]) => k !== 'errors').map(([k, v]: any) => [k, v.count])));
if (snapshot.errors.length) console.warn('⚠️ Snapshot errors:', snapshot.errors);
```

Also: change the history read at `index.ts:59` from `.from('website_chats')` to `.from('2s-dashboard_AI_Chat')` (same columns: `session_id, user_message, ai_response, created_at, is_archived`). Keep the `get_recent_document_context` RPC call (exists live); delete the `uploaded_documents` fetch (table does not exist). **Import cleanup (folded in from old Task 11 per user decision):** after the rewire, remove every `index.ts` import whose symbols are no longer referenced — check each with `grep -c '<Symbol>' index.ts` == 1 (only the import line). Expected removals: `queryReviewsByDateRange`, `getAnalyticsData` (from `data-service.ts` — their call sites are the block this task replaces), and any of `HonestResponseGenerator` / `CustomerBehaviorAnalytics` that grep proves unused.

- [ ] **Step 7: Rewrite `enhanced-context-builder.ts` mapping** — `buildContextWithDocuments(snapshot, message)` now renders one section per domain using the real column names, each section headed `### <Domain> (<count ?? 'unknown'> rows in range; showing <rows.length>)`, and rows rendered compactly:
  - reviews: `${r['Date']} | ${r.Source} | score ${r.Score} | ${r.Author ?? ''} | ${(r.Text ?? r.Title ?? '').slice(0, 200)}`
  - whatsapp: `${r.created_at} | ${r['Sender Number']} ${r.Name ?? ''} | guest: ${(r['Sender Message'] ?? '').slice(0, 150)} | reply: ${((r.human_reply ?? r['Ai Reply']) ?? '').slice(0, 150)}`
  - seraEmails: `${r.sent_at} | ${r.email_type} | ${r.category ?? ''} | ${r.guest_name ?? ''} | ${(r.email_subject ?? '').slice(0, 120)}`
  - infoEmails: `${r.created_at} | ${r.action} | ${r.department ?? ''} | conf ${r.confidence ?? ''} | ${(r.subject ?? '').slice(0, 120)}`
  - competitorRates: `${r.report_date} | ${r.hotel_name} | checkin ${r.checkin_date} | AED ${r.converted_price_aed}${r.is_lowest_for_day ? ' (lowest)' : ''}`
  - social: `${r.created_at} | ${r.platform}/${r.channel} | ${r.event_type} | ${(r.guest_message_text ?? '').slice(0, 120)}${r.escalation_flag ? ' [ESCALATED]' : ''}`
  - welcome: `${r.sent_date} | ${r.full_name ?? ''} | room ${r.room_number ?? ''} | ${r.status}`
  - memory: `${r.created_at} | ${(r.message ?? '').slice(0, 200)}`
  Cap each section's rendered rows: reviews 25, whatsapp 40, others 15. When `rows.length === 0`, render `No rows in the selected range.` If `snapshot.errors` is non-empty, append a `### Data access errors` section listing them verbatim (Sera must say data was unavailable, not invent it).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/chat-with-data/ tests/unit/context-data-fetcher.test.ts
git commit -m "feat(sera): fetch real dashboard tables with question-driven date ranges"
```

- [ ] **Step 9: Deploy + deploy gate + ground-truth check.** With the user signed in, ask Sera: "How many reviews do we have in total?" then verify against `select count(*) from "Two Seasons and Reviews"` (expect ≈7,888 — she sees the exact `count` in the section heading). Ask "any WhatsApp messages in the past 3 days?" and cross-check counts with SQL.

---

### Task 4: `query_whatsapp_chats` domain tool (D1)

**Files:**
- Create: `supabase/functions/chat-with-data/whatsapp-aggregator.ts`
- Create: `supabase/functions/chat-with-data/access-probe.ts` (shared empty-vs-denied classifier, used by ALL domain tools)
- Create: `supabase/functions/chat-with-data/whatsapp-query-service.ts`
- Modify: `supabase/functions/chat-with-data/training-query-service.ts` (retrofit empty path onto the probe)
- Modify: `supabase/functions/chat-with-data/function-call-handler.ts` (register tool)
- Modify: `supabase/functions/chat-with-data/search-decision-engine.ts` (force tool on keywords)
- Modify: `supabase/functions/chat-with-data/index.ts` (honesty-engine exemption list)
- Test: `tests/unit/whatsapp-aggregator.test.ts`

**Interfaces:**
- Consumes: `buildDateRange` from `training-aggregator.ts`; `createClient` pattern with `this.authHeader` exactly as `TrainingQueryService` (constructor `(authHeader?: string)`).
- Produces: `WHATSAPP_TOOL_NAME = 'query_whatsapp_chats'`; `WhatsAppQueryService` class with `getAvailableFunctions()` and `executeFunction(name, args)` returning a JSON string; `aggregateWhatsApp(rows: WhatsAppRow[]): WhatsAppSummary` where `WhatsAppRow = { created_at: string; sender: string; name: string | null; humanControlled: boolean }` and `WhatsAppSummary = { total_messages: number; unique_guests: number; human_handled_messages: number; ai_handled_messages: number; by_day: Array<{ date: string; messages: number; guests: number }> }` (dates are Dubai `YYYY-MM-DD`). `QUERY_TOOL_NAMES: string[]` exported from `function-call-handler.ts` (starts as `['query_training_records', 'query_whatsapp_chats']`; later tasks append). From `access-probe.ts`: `type EmptyKind = 'no_records_found' | 'records_not_visible' | 'no_visible_records_unverified'`; `classifyEmptyResult(table: string, applyFilters: (q: any) => any): Promise<EmptyKind>`; `emptyResultPayload(kind: EmptyKind, extra?: Record<string, unknown>): string` — Tasks 5–7 and the training retrofit call these on every empty result.

**Language convention (user decision):** tool payloads are MODEL-facing, never user-facing. Status fields are machine-readable snake_case; `instruction_to_model` strings are English instructions the model renders in the conversation's language (persona mandates language matching, and query-tool answers skip the replacement engine). Never put user-facing copy in a tool payload.

- [ ] **Step 1: Verify** — no tool named like `whatsapp` exists (`grep -rn 'query_whatsapp' supabase/functions/` → empty) and `Chat History` live columns match Global Constraints (MCP `execute_sql` on `information_schema.columns`).

- [ ] **Step 2: Write the failing test** — `tests/unit/whatsapp-aggregator.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateWhatsApp, dubaiDateKey } from '../../supabase/functions/chat-with-data/whatsapp-aggregator.ts';

const row = (iso: string, sender: string, human = false) => ({ created_at: iso, sender, name: null, humanControlled: human });

test('counts totals, unique guests, and human vs ai handling', () => {
  const s = aggregateWhatsApp([
    row('2026-07-26T10:00:00+04:00', '9715550001'),
    row('2026-07-26T11:00:00+04:00', '9715550001', true),
    row('2026-07-27T09:00:00+04:00', '9715550002'),
  ]);
  assert.equal(s.total_messages, 3);
  assert.equal(s.unique_guests, 2);
  assert.equal(s.human_handled_messages, 1);
  assert.equal(s.ai_handled_messages, 2);
  assert.deepEqual(s.by_day.map(d => d.messages), [2, 1]);
});

test('dubaiDateKey converts UTC timestamps into Dubai calendar days', () => {
  assert.equal(dubaiDateKey('2026-07-26T22:30:00Z'), '2026-07-27'); // 02:30 Dubai next day
});

test('empty input yields zeroed summary', () => {
  const s = aggregateWhatsApp([]);
  assert.equal(s.total_messages, 0);
  assert.deepEqual(s.by_day, []);
});
```

- [ ] **Step 3: Run to verify failure** — `npx tsx --test tests/unit/whatsapp-aggregator.test.ts` — FAIL.

- [ ] **Step 4: Implement `whatsapp-aggregator.ts`** (pure, no Deno APIs):

```ts
export interface WhatsAppRow { created_at: string; sender: string; name: string | null; humanControlled: boolean; }
export interface WhatsAppSummary {
  total_messages: number; unique_guests: number;
  human_handled_messages: number; ai_handled_messages: number;
  by_day: Array<{ date: string; messages: number; guests: number }>;
}

const dubaiFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' });
export function dubaiDateKey(iso: string): string { return dubaiFmt.format(new Date(iso)); }

export function aggregateWhatsApp(rows: WhatsAppRow[]): WhatsAppSummary {
  const guests = new Set<string>();
  const byDay = new Map<string, { messages: number; guests: Set<string> }>();
  let human = 0;
  for (const r of rows) {
    guests.add(r.sender);
    if (r.humanControlled) human++;
    const day = dubaiDateKey(r.created_at);
    const bucket = byDay.get(day) ?? { messages: 0, guests: new Set<string>() };
    bucket.messages++; bucket.guests.add(r.sender);
    byDay.set(day, bucket);
  }
  return {
    total_messages: rows.length,
    unique_guests: guests.size,
    human_handled_messages: human,
    ai_handled_messages: rows.length - human,
    by_day: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, messages: v.messages, guests: v.guests.size })),
  };
}
```

- [ ] **Step 5: Run tests** — expected: 3 pass.

- [ ] **Step 5b: Implement `access-probe.ts`** — the shared empty-vs-denied classifier. RLS filters silently (a denied SELECT returns 200 + empty array, identical to a truly empty table), so on the empty path ONLY we run a head-only service-role existence count — never row data. Decided failure semantics: if the probe itself errors, return `no_visible_records_unverified` and assert nothing about existence.

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

export type EmptyKind = 'no_records_found' | 'records_not_visible' | 'no_visible_records_unverified';

// Called ONLY after a user-scoped query returned zero rows. applyFilters MUST
// re-apply the exact filters of the user-scoped query. Service role is used
// solely for a HEAD count (existence), never row contents.
export async function classifyEmptyResult(table: string, applyFilters: (q: any) => any): Promise<EmptyKind> {
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { count, error } = await applyFilters(admin.from(table).select('*', { count: 'exact', head: true }));
    if (error) return 'no_visible_records_unverified';
    return (count ?? 0) > 0 ? 'records_not_visible' : 'no_records_found';
  } catch {
    return 'no_visible_records_unverified';
  }
}

// Generic wording by design (user decision): naming WHO can see the data
// would re-encode the RLS policy in copy and drift when the policy changes.
export function emptyResultPayload(kind: EmptyKind, extra: Record<string, unknown> = {}): string {
  const notes: Record<EmptyKind, string> = {
    no_records_found: 'No records exist for this query. Tell the user plainly that none were logged for the period.',
    records_not_visible: "Records exist for this query but are not visible to this user's account. Tell the user this data is not visible to their account and an authorized colleague can check it. Do NOT say or imply the records do not exist.",
    no_visible_records_unverified: 'No records are visible to this account and existence could not be verified. Tell the user no records are visible to their account. Do NOT assert that none exist.',
  };
  return JSON.stringify({ status: kind, instruction_to_model: notes[kind], ...extra });
}
```

- [ ] **Step 5c: Retrofit the training tool** — in `training-query-service.ts`, replace the bare `no_training_records_found` return with the probe: `const kind = await classifyEmptyResult('training_sessions', (q) => { if (range.fromISO) q = q.gte('training_date', range.fromISO); if (range.toExclusiveISO) q = q.lt('training_date', range.toExclusiveISO); if (filters.department) q = q.ilike('department', `%${filters.department}%`); return q; }); return emptyResultPayload(kind, { date_from: filters.date_from ?? null, date_to: filters.date_to ?? null, ...(departmentsAvailable.length ? { departments_available: departmentsAvailable } : {}) });` — keep the existing department scan, but include `departments_available` only when non-empty (a non-admin's user-scoped scan legitimately sees none).

- [ ] **Step 6: Implement `whatsapp-query-service.ts`** — mirror `TrainingQueryService` exactly:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { buildDateRange } from './training-aggregator.ts';
import { aggregateWhatsApp } from './whatsapp-aggregator.ts';
import { classifyEmptyResult, emptyResultPayload } from './access-probe.ts';

export const WHATSAPP_TOOL_NAME = 'query_whatsapp_chats';
const ROW_CAP = 4000;
const UNAVAILABLE = JSON.stringify({ error: 'WhatsApp chat data is temporarily unavailable. Tell the user you could not access the chat records right now.' });

export class WhatsAppQueryService {
  private authHeader: string;
  constructor(authHeader?: string) { this.authHeader = authHeader ?? ''; }

  getAvailableFunctions() {
    return [{
      name: WHATSAPP_TOOL_NAME,
      description: "Query guest WhatsApp conversations (the dashboard's Chat History table). Returns EXACT computed statistics: total messages, unique guests, human vs AI handled, per-day breakdown, and optional message samples. ALWAYS use this tool for ANY question about WhatsApp messages, guest chats, conversations, or senders. Never estimate chat numbers yourself.",
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'Start date (inclusive), YYYY-MM-DD, Dubai time. Omit for no lower bound.' },
          date_to: { type: 'string', description: 'End date (inclusive), YYYY-MM-DD, Dubai time. Omit for no upper bound.' },
          phone_number: { type: 'string', description: 'Filter to one guest phone number (digits, partial match allowed).' },
          detail: { type: 'string', enum: ['summary', 'messages'], description: 'summary (default): totals only. messages: also include up to 30 recent message excerpts.' },
        },
        required: [],
      },
    }];
  }

  async executeFunction(functionName: string, args: any): Promise<string> {
    if (functionName !== WHATSAPP_TOOL_NAME) return JSON.stringify({ error: `Unknown function: ${functionName}` });
    try {
      const range = buildDateRange(args?.date_from, args?.date_to);
      if (range.error) return JSON.stringify({ error: range.error });
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: this.authHeader } } },
      );
      let q = supabase.from('Chat History')
        .select('created_at,"Sender Number",Name,"Sender Message","Ai Reply",human_reply,is_human_controlled')
        .order('created_at', { ascending: false }).limit(ROW_CAP);
      if (range.fromISO) q = q.gte('created_at', range.fromISO);
      if (range.toExclusiveISO) q = q.lt('created_at', range.toExclusiveISO);
      if (args?.phone_number) q = q.ilike('Sender Number', `%${String(args.phone_number).replace(/\D/g, '')}%`);
      const { data, error } = await q;
      if (error) { console.error('❌ query_whatsapp_chats failed:', error); return UNAVAILABLE; }
      if (!data?.length) {
        const kind = await classifyEmptyResult('Chat History', (probe: any) => {
          if (range.fromISO) probe = probe.gte('created_at', range.fromISO);
          if (range.toExclusiveISO) probe = probe.lt('created_at', range.toExclusiveISO);
          if (args?.phone_number) probe = probe.ilike('Sender Number', `%${String(args.phone_number).replace(/\D/g, '')}%`);
          return probe;
        });
        return emptyResultPayload(kind, { date_from: args?.date_from ?? null, date_to: args?.date_to ?? null });
      }
      const summary = aggregateWhatsApp(data.map((r: any) => ({
        created_at: r.created_at, sender: r['Sender Number'] ?? 'unknown', name: r.Name ?? null, humanControlled: !!r.is_human_controlled,
      })));
      const result: any = { status: 'ok', filters: { date_from: args?.date_from ?? null, date_to: args?.date_to ?? null, phone_number: args?.phone_number ?? null }, ...summary };
      if (data.length === ROW_CAP) result.truncation_note = `Row cap of ${ROW_CAP} reached; totals cover only the ${ROW_CAP} most recent messages in range.`;
      if (args?.detail === 'messages') {
        result.messages = data.slice(0, 30).map((r: any) => ({
          at: r.created_at, from: r['Sender Number'], name: r.Name,
          guest: (r['Sender Message'] ?? '').slice(0, 200), reply: ((r.human_reply ?? r['Ai Reply']) ?? '').slice(0, 200),
        }));
      }
      return JSON.stringify(result);
    } catch (e) { console.error('❌ query_whatsapp_chats crashed:', e); return UNAVAILABLE; }
  }
}
```

- [ ] **Step 7: Register the tool** — in `function-call-handler.ts`: import `{ WhatsAppQueryService, WHATSAPP_TOOL_NAME }`; add field `private whatsappQueryService: WhatsAppQueryService;` initialized with `authHeader` in the constructor; include `...this.whatsappQueryService.getAvailableFunctions()` in `getAvailableTools()`; route `functionName === WHATSAPP_TOOL_NAME` to it in `executeToolCalls` (same place `TRAINING_TOOL_NAME` is routed); export `export const QUERY_TOOL_NAMES = [TRAINING_TOOL_NAME, WHATSAPP_TOOL_NAME];`.

- [ ] **Step 8: Force the tool on keywords** — in `search-decision-engine.ts`, alongside the training block, add:

```ts
const whatsappKeywords = ['whatsapp', 'chat history', 'guest chat', 'guest message', 'conversations', 'واتساب', 'محادثات'];
const isWhatsAppQuery = !isTrainingQuery && whatsappKeywords.some(k => message.toLowerCase().includes(k));
```

Carry `isWhatsAppQuery` through `SearchDecisionResult` (add the field to the interface), keep `requiresWebsiteSearch = false` for it, and in `determineToolChoice` return `{ type: 'function', function: { name: 'query_whatsapp_chats' } }` when `isWhatsAppQuery` (after the training branch).

- [ ] **Step 9: Generalize the honesty-engine exemption** — in `index.ts`, replace the training-only check with:

```ts
import { QUERY_TOOL_NAMES } from './function-call-handler.ts';
const usedQueryTool = aiChoice.executedTools?.some((t: string) => QUERY_TOOL_NAMES.includes(t));
if (usedQueryTool) { ... skip ... } else { ... enforceDataHonesty ... }
```

- [ ] **Step 10: Run all unit tests** — `npx tsx --test tests/unit/*.test.ts` — expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/chat-with-data/ tests/unit/whatsapp-aggregator.test.ts
git commit -m "feat(sera): add query_whatsapp_chats tool (forced on chat keywords, Dubai ranges, honest empty path)"
```

- [ ] **Step 12: Deploy (batched with Task 5) + deploy gate + ground truth.** Signed-in question: "Over the past three days, how many WhatsApp messages and how many unique guests?" Cross-check with `select count(*), count(distinct "Sender Number") from "Chat History" where created_at >= <Dubai 3-days-ago>` — numbers must match exactly. **Language check:** ask the same question in Arabic (e.g. "كم عدد رسائل الواتساب في آخر ٣ أيام؟") — the answer must come back in Arabic with the same numbers, proving `instruction_to_model` strings don't leak English into user-facing replies.

---

### Task 5: `query_reviews` domain tool (D1, second domain)

**Files:**
- Create: `supabase/functions/chat-with-data/reviews-aggregator.ts`, `supabase/functions/chat-with-data/reviews-query-service.ts`
- Modify: `function-call-handler.ts`, `search-decision-engine.ts` (same registration points as Task 4)
- Test: `tests/unit/reviews-aggregator.test.ts`

**Interfaces:**
- Consumes: the shipped Task 4 code IN THE REPO — read `supabase/functions/chat-with-data/whatsapp-query-service.ts` (reference implementation to mirror: class shape, UNAVAILABLE sentinel, try/catch, user-scoped `createClient`) and the registration points in `function-call-handler.ts` (`QUERY_TOOL_NAMES`, constructor `(authHeader?)`, routing in `executeToolCalls`).
- Produces: `REVIEWS_TOOL_NAME = 'query_reviews'`; `ReviewsQueryService` (same shape as `WhatsAppQueryService`); `aggregateReviews(rows: ReviewRow[]): ReviewsSummary` where `ReviewRow = { date: string; source: string | null; score: number | null; hotel: string | null }` and `ReviewsSummary = { total_reviews: number; average_score: number | null; by_source: Array<{ source: string; reviews: number; average_score: number | null }>; by_month: Array<{ month: string; reviews: number; average_score: number | null }> }`. Averages rounded to 2 decimals; null when no scored rows.

- [ ] **Step 1: Verify** — `Two Seasons and Reviews` columns match ground truth; note `"Date"` is a `date` column (no timezone conversion — use plain `YYYY-MM-DD` `gte`/`lte`, NOT `buildDateRange` ISO bounds).

- [ ] **Step 2: Write the failing test** — `tests/unit/reviews-aggregator.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReviews } from '../../supabase/functions/chat-with-data/reviews-aggregator.ts';

const row = (date: string, source: string, score: number | null) => ({ date, source, score, hotel: 'Two Seasons' });

test('averages and groups by source and month', () => {
  const s = aggregateReviews([row('2026-05-01', 'Google', 8), row('2026-05-10', 'Google', 6), row('2026-04-02', 'Booking.com', 10)]);
  assert.equal(s.total_reviews, 3);
  assert.equal(s.average_score, 8);
  assert.deepEqual(s.by_source.find(x => x.source === 'Google'), { source: 'Google', reviews: 2, average_score: 7 });
  assert.deepEqual(s.by_month.map(m => m.month), ['2026-04', '2026-05']);
});

test('null scores are excluded from averages but counted in totals', () => {
  const s = aggregateReviews([row('2026-05-01', 'Google', null), row('2026-05-02', 'Google', 9)]);
  assert.equal(s.total_reviews, 2);
  assert.equal(s.average_score, 9);
});

test('empty input', () => {
  const s = aggregateReviews([]);
  assert.equal(s.total_reviews, 0);
  assert.equal(s.average_score, null);
});
```

- [ ] **Step 3: Run to verify failure**, then **Step 4: Implement `reviews-aggregator.ts`:**

```ts
export interface ReviewRow { date: string; source: string | null; score: number | null; hotel: string | null; }
export interface ReviewsSummary {
  total_reviews: number; average_score: number | null;
  by_source: Array<{ source: string; reviews: number; average_score: number | null }>;
  by_month: Array<{ month: string; reviews: number; average_score: number | null }>;
}

const avg = (xs: number[]) => xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;

export function aggregateReviews(rows: ReviewRow[]): ReviewsSummary {
  const scores = rows.map(r => r.score).filter((s): s is number => typeof s === 'number');
  const group = (key: (r: ReviewRow) => string) => {
    const m = new Map<string, ReviewRow[]>();
    for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  };
  return {
    total_reviews: rows.length,
    average_score: avg(scores),
    by_source: group(r => r.source ?? 'unknown').map(([source, rs]) => ({ source, reviews: rs.length, average_score: avg(rs.map(r => r.score).filter((s): s is number => typeof s === 'number')) })),
    by_month: group(r => (r.date ?? '').slice(0, 7)).map(([month, rs]) => ({ month, reviews: rs.length, average_score: avg(rs.map(r => r.score).filter((s): s is number => typeof s === 'number')) })),
  };
}
```

- [ ] **Step 5: Run tests** — pass. **Step 6: Implement `reviews-query-service.ts`** — same class shape as Task 4 Step 6 with these differences: tool name `query_reviews`; description "Query guest reviews (the dashboard's reviews table). Returns EXACT counts and averages: total reviews, average score, per-source and per-month breakdowns, optional review excerpts. ALWAYS use this tool for ANY question about reviews, ratings, scores, or guest feedback. Never estimate review numbers yourself."; parameters `date_from`, `date_to` (YYYY-MM-DD, applied as plain `gte/lte` on `"Date"` — no ISO conversion), `source` (ilike partial), `min_score`/`max_score` (numbers, `gte/lte` on `Score`), `detail` enum `['summary','reviews']` (reviews → up to 20 excerpts `{ date, source, score, author, title, text: text.slice(0,200) }`); ROW_CAP 5000; query:

```ts
let q = supabase.from('Two Seasons and Reviews')
  .select('"Date",Source,Score,Author,Title,Text,"Hotel Name"')
  .order('Date', { ascending: false }).limit(ROW_CAP);
if (args?.date_from) q = q.gte('Date', args.date_from);
if (args?.date_to) q = q.lte('Date', args.date_to);
if (args?.source) q = q.ilike('Source', `%${args.source}%`);
if (typeof args?.min_score === 'number') q = q.gte('Score', args.min_score);
if (typeof args?.max_score === 'number') q = q.lte('Score', args.max_score);
```

Empty result → probe (`classifyEmptyResult('Two Seasons and Reviews', probe => /* re-apply the same Date/Source/Score filters */)`) then `emptyResultPayload(kind, extra)`, where `extra` MUST include `{ ingestion_note: 'Newest review in the database is dated 2026-05-18 — review ingestion has been stale since then; mention this if the user asked about recent reviews.' }` only when `kind === 'no_records_found'` (the stale-data disclosure is REQUIRED — out-of-scope to fix, in-scope to disclose; irrelevant when the emptiness is a visibility issue). Map rows: `{ date: r['Date'], source: r.Source, score: r.Score === null ? null : Number(r.Score), hotel: r['Hotel Name'] }`.

- [ ] **Step 7: Register** — add to `function-call-handler.ts` (field + constructor + `getAvailableTools` + routing) and append `REVIEWS_TOOL_NAME` to `QUERY_TOOL_NAMES`. **Step 8: Force on keywords** — `const reviewsKeywords = ['review', 'reviews', 'rating', 'ratings', 'guest feedback', 'تقييم', 'تقييمات', 'مراجعات'];` — same pattern, checked after training and whatsapp.

- [ ] **Step 9: Run all unit tests; commit**

```bash
git add supabase/functions/chat-with-data/ tests/unit/reviews-aggregator.test.ts
git commit -m "feat(sera): add query_reviews tool"
```

- [ ] **Step 10: Deploy + deploy gate + ground truth** — "How many reviews do we have in total, and what's the average score?" vs `select count(*), round(avg("Score"),2) from "Two Seasons and Reviews"`.

---

### Task 6: `query_sera_emails` domain tool (D1, third domain)

**Files:**
- Create: `supabase/functions/chat-with-data/emails-aggregator.ts`, `supabase/functions/chat-with-data/emails-query-service.ts`
- Modify: `function-call-handler.ts`, `search-decision-engine.ts`
- Test: `tests/unit/emails-aggregator.test.ts`

**Interfaces:**
- Consumes: the shipped Task 4 code IN THE REPO — read `supabase/functions/chat-with-data/whatsapp-query-service.ts` (reference implementation to mirror) and the registration points in `function-call-handler.ts`; `buildDateRange` (timestamptz column → Dubai ISO bounds); `dubaiDateKey` from `whatsapp-aggregator.ts`.
- Produces: `EMAILS_TOOL_NAME = 'query_sera_emails'`; `EmailsQueryService`; `aggregateEmails(rows: EmailRow[]): EmailsSummary` where `EmailRow = { sent_at: string; email_type: string | null; category: string | null; guest_email: string | null }` and `EmailsSummary = { total_emails: number; new_emails: number; reply_emails: number; unique_guests: number; by_category: Array<{ category: string; emails: number }>; by_day: Array<{ date: string; emails: number }> }`.

- [ ] **Step 1: Verify** — `2Seasons_Sera_Email_Log` columns match ground truth; confirm `email_type` values with `select distinct email_type from public."2Seasons_Sera_Email_Log"` (dashboard splits on `'new' | 'reply'`; treat any other value as neither, counted only in total).

- [ ] **Step 2: Failing test** — `tests/unit/emails-aggregator.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateEmails } from '../../supabase/functions/chat-with-data/emails-aggregator.ts';

const row = (sent_at: string, email_type: string, category: string | null, guest_email: string | null) => ({ sent_at, email_type, category, guest_email });

test('splits new vs reply and counts unique guests', () => {
  const s = aggregateEmails([
    row('2026-07-26T10:00:00+04:00', 'new', 'booking', 'a@x.com'),
    row('2026-07-26T11:00:00+04:00', 'reply', 'booking', 'a@x.com'),
    row('2026-07-27T09:00:00+04:00', 'new', null, 'b@x.com'),
  ]);
  assert.equal(s.total_emails, 3);
  assert.equal(s.new_emails, 2);
  assert.equal(s.reply_emails, 1);
  assert.equal(s.unique_guests, 2);
  assert.deepEqual(s.by_category, [{ category: 'booking', emails: 2 }, { category: 'uncategorized', emails: 1 }]);
});

test('empty input', () => {
  assert.equal(aggregateEmails([]).total_emails, 0);
});
```

- [ ] **Step 3: Run to verify failure**, then **Step 4: Implement `emails-aggregator.ts`:**

```ts
import { dubaiDateKey } from './whatsapp-aggregator.ts';

export interface EmailRow { sent_at: string; email_type: string | null; category: string | null; guest_email: string | null; }
export interface EmailsSummary {
  total_emails: number; new_emails: number; reply_emails: number; unique_guests: number;
  by_category: Array<{ category: string; emails: number }>;
  by_day: Array<{ date: string; emails: number }>;
}

export function aggregateEmails(rows: EmailRow[]): EmailsSummary {
  const guests = new Set<string>();
  const byCat = new Map<string, number>();
  const byDay = new Map<string, number>();
  let newE = 0, reply = 0;
  for (const r of rows) {
    if (r.guest_email) guests.add(r.guest_email.toLowerCase());
    if (r.email_type === 'new') newE++;
    else if (r.email_type === 'reply') reply++;
    const cat = r.category?.trim() || 'uncategorized';
    byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
    const day = dubaiDateKey(r.sent_at);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const sorted = <V>(m: Map<string, V>) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  return {
    total_emails: rows.length, new_emails: newE, reply_emails: reply, unique_guests: guests.size,
    by_category: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([category, emails]) => ({ category, emails })),
    by_day: sorted(byDay).map(([date, emails]) => ({ date, emails })),
  };
}
```

- [ ] **Step 5: Run tests** — pass. **Step 6: Implement `emails-query-service.ts`** — same class shape as Task 4 Step 6: tool name `query_sera_emails`; description "Query Sera's guest email activity log (emails Sera sent/handled for guests). Returns EXACT counts: total emails, new vs reply, unique guests, per-category and per-day breakdowns, optional excerpts. ALWAYS use this tool for ANY question about guest emails Sera handled. Never estimate email numbers yourself."; params `date_from`/`date_to` (Dubai, via `buildDateRange` on `sent_at`), `email_type` (enum `['new','reply']`, `.eq`), `category` (ilike), `detail` `['summary','emails']` (emails → 20 excerpts `{ sent_at, email_type, category, guest_name, subject: email_subject?.slice(0,120) }`); ROW_CAP 4000; select `sent_at,email_type,category,nature_of_request,guest_name,guest_email,email_subject` from `2Seasons_Sera_Email_Log`; empty → probe (`classifyEmptyResult('2Seasons_Sera_Email_Log', probe => /* re-apply sent_at range + email_type + category filters */)`) then `emptyResultPayload(kind, { date_from, date_to })`.

- [ ] **Step 7: Register + keywords** — append to `QUERY_TOOL_NAMES`; keywords `['email', 'emails', 'inbox', 'بريد', 'ايميل', 'إيميل']`, checked after training/whatsapp/reviews (note: "email" must NOT trigger when the message says "info email" — check `!lower.includes('info email')` and let the snapshot context answer info-email questions; info-email gets no dedicated tool in this plan).

- [ ] **Step 8: Run all tests; commit** — `feat(sera): add query_sera_emails tool`.

- [ ] **Step 9: Deploy + deploy gate + ground truth** — "How many guest emails did Sera handle in the past 7 days, new vs replies?" vs SQL on `2Seasons_Sera_Email_Log`.

---

### Task 7: `query_competitor_rates` domain tool (D1, fourth domain)

**Files:**
- Create: `supabase/functions/chat-with-data/rates-aggregator.ts`, `supabase/functions/chat-with-data/rates-query-service.ts`
- Modify: `function-call-handler.ts`, `search-decision-engine.ts`
- Test: `tests/unit/rates-aggregator.test.ts`

**Interfaces:**
- Consumes: the shipped Task 4 code IN THE REPO — read `supabase/functions/chat-with-data/whatsapp-query-service.ts` (reference implementation to mirror) and the registration points in `function-call-handler.ts`.
- Produces: `RATES_TOOL_NAME = 'query_competitor_rates'`; `RatesQueryService`; `aggregateRates(rows: RateRow[]): RatesSummary` where `RateRow = { report_date: string; hotel: string; price_aed: number | null }` and `RatesSummary = { days_covered: number; hotels: Array<{ hotel: string; quotes: number; min_aed: number | null; avg_aed: number | null }>; cheapest_by_day: Array<{ date: string; hotel: string; price_aed: number }> }`.

- [ ] **Step 1: Verify** — table/columns per ground truth; confirm status values via `select distinct status from public."Two Seasons Competitor Hotel room Rates" limit 20` (dashboard filters `status in ('success','price_found')`, `dry_run = false` — mirror exactly).

- [ ] **Step 2: Failing test** — `tests/unit/rates-aggregator.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRates } from '../../supabase/functions/chat-with-data/rates-aggregator.ts';

const row = (report_date: string, hotel: string, price_aed: number | null) => ({ report_date, hotel, price_aed });

test('per-hotel min/avg and cheapest hotel per day', () => {
  const s = aggregateRates([row('2026-07-28', 'Two Seasons', 400), row('2026-07-28', 'Hilton', 350), row('2026-07-29', 'Hilton', 500)]);
  assert.equal(s.days_covered, 2);
  assert.deepEqual(s.hotels.find(h => h.hotel === 'Hilton'), { hotel: 'Hilton', quotes: 2, min_aed: 350, avg_aed: 425 });
  assert.deepEqual(s.cheapest_by_day[0], { date: '2026-07-28', hotel: 'Hilton', price_aed: 350 });
});

test('null prices excluded from stats but hotels still listed', () => {
  const s = aggregateRates([row('2026-07-28', 'Hilton', null)]);
  assert.deepEqual(s.hotels[0], { hotel: 'Hilton', quotes: 1, min_aed: null, avg_aed: null });
  assert.deepEqual(s.cheapest_by_day, []);
});
```

- [ ] **Step 3: Run to verify failure**, then **Step 4: Implement `rates-aggregator.ts`:**

```ts
export interface RateRow { report_date: string; hotel: string; price_aed: number | null; }
export interface RatesSummary {
  days_covered: number;
  hotels: Array<{ hotel: string; quotes: number; min_aed: number | null; avg_aed: number | null }>;
  cheapest_by_day: Array<{ date: string; hotel: string; price_aed: number }>;
}

export function aggregateRates(rows: RateRow[]): RatesSummary {
  const byHotel = new Map<string, number[]>(); const quotes = new Map<string, number>();
  const byDay = new Map<string, { hotel: string; price_aed: number }>();
  for (const r of rows) {
    quotes.set(r.hotel, (quotes.get(r.hotel) ?? 0) + 1);
    if (typeof r.price_aed === 'number') {
      byHotel.set(r.hotel, [...(byHotel.get(r.hotel) ?? []), r.price_aed]);
      const best = byDay.get(r.report_date);
      if (!best || r.price_aed < best.price_aed) byDay.set(r.report_date, { hotel: r.hotel, price_aed: r.price_aed });
    } else if (!byHotel.has(r.hotel)) byHotel.set(r.hotel, []);
  }
  return {
    days_covered: new Set(rows.map(r => r.report_date)).size,
    hotels: [...byHotel.entries()].map(([hotel, ps]) => ({
      hotel, quotes: quotes.get(hotel) ?? 0,
      min_aed: ps.length ? Math.min(...ps) : null,
      avg_aed: ps.length ? Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 100) / 100 : null,
    })).sort((a, b) => a.hotel.localeCompare(b.hotel)),
    cheapest_by_day: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
  };
}
```

- [ ] **Step 5: Run tests** — pass. **Step 6: Implement `rates-query-service.ts`** — same class shape: tool name `query_competitor_rates`; description "Query competitor hotel room rates collected by the dashboard. Returns EXACT numbers: per-hotel min/average AED, cheapest hotel per day, days covered. ALWAYS use this tool for ANY question about competitor prices, room rates, or price positioning. Never estimate rates yourself."; params `date_from`/`date_to` (plain `YYYY-MM-DD` on `report_date`), `hotel_name` (ilike), `detail` `['summary','quotes']` (quotes → 30 rows `{ report_date, hotel_name, checkin_date, converted_price_aed }`); ROW_CAP 5000; base query `.eq('dry_run', false).in('status', ['success','price_found'])`; select `report_date,hotel_name,checkin_date,converted_price_aed,status,is_lowest_for_day`; map `price_aed: r.converted_price_aed === null ? null : Number(r.converted_price_aed)`; empty → probe (`classifyEmptyResult('Two Seasons Competitor Hotel room Rates', probe => /* re-apply report_date range + hotel_name + dry_run/status filters */)`) then `emptyResultPayload(kind, { date_from, date_to })`.

- [ ] **Step 7: Register + keywords** — append to `QUERY_TOOL_NAMES`; keywords `['competitor', 'competitors', 'room rate', 'room rates', 'price comparison', 'pricing', 'rates', 'منافس', 'أسعار الغرف']` — require word-boundary match for `rates` (`/\brates?\b/` on the lowercased message) so "ratings" never triggers it; checked after the reviews branch so review questions win ties.

- [ ] **Step 8: Run all tests; commit** — `feat(sera): add query_competitor_rates tool`.

- [ ] **Step 9: Deploy + deploy gate + ground truth** — "Which competitor was cheapest yesterday and at what rate?" vs SQL `select hotel_name, min(converted_price_aed) ... where report_date = <yesterday> and dry_run=false and status in ('success','price_found') group by hotel_name order by 2`.

---

### Task 8: Session persistence (E1) — frontend sessionId + `2s-dashboard_AI_Chat` writes + RLS

**⚠️ Touches a live surface (dashboard frontend + RLS migration). Confirm with the user before starting this task.**

**Files:**
- Modify: `src/utils/messageSender.ts:26-38` (accept + send `sessionId`)
- Modify: `src/hooks/useMessageSending.ts:48` (pass the active local session id)
- Modify: `supabase/functions/_shared/auth.ts` (add `getCallerUser`)
- Modify: `supabase/functions/chat-with-data/index.ts` (use `getCallerUser`, pass `userId` to session save)
- Modify: `supabase/functions/chat-with-data/conversation-session-manager.ts` (write to `2s-dashboard_AI_Chat` with `user_id`; keep LongTermMemory write)
- Create: `supabase/migrations/<timestamp>_sera_chat_insert_policies.sql`
- Test: manual ground-truth (SQL row appears after a panel message); unit tests unchanged

**Interfaces:**
- Consumes: `useSeraLocalSessions` active session id (string) — read `src/hooks/useChat.ts` / `useSessionManagement.ts` to find the exact variable holding it (verification step below).
- Produces: `getCallerUser(req): Promise<{ id: string; email: string } | null>` in `_shared/auth.ts` (keeps `getCallerEmail` untouched for sp-* functions); `sendMessageToAI(message, messageId, sessionId?)`; `saveConversationWithContext(supabase, userMessage, aiResponse, sessionId, context, userId)` writing to `2s-dashboard_AI_Chat`.

- [ ] **Step 1: Verify** — `messageSender.ts` still omits sessionId; `2s-dashboard_AI_Chat` has columns `session_id, user_message, ai_response, user_id, is_archived`; no INSERT policy for authenticated exists on `2s-dashboard_AI_Chat` or `LongTermMemory` (`pg_policies` query). Trace where the Sera panel keeps its active session id (`useChat.ts` → `useSeraLocalSessions.ts`) and record the exact accessor in the task report.

- [ ] **Step 2: Migration** — create `supabase/migrations/<timestamp>_sera_chat_insert_policies.sql`:

```sql
-- Staff can persist their own Sera chat turns (dashboard AI panel).
create policy "Staff can insert own sera chats"
  on public."2s-dashboard_AI_Chat" for insert to authenticated
  with check (public.is_hotel_staff(auth.uid()) and user_id = auth.uid());

-- Staff can read their own chats (existing policy covers staff-wide read; keep as-is).

-- Sera writes conversation memory as the calling user.
create policy "Staff can insert LongTermMemory"
  on public."LongTermMemory" for insert to authenticated
  with check (public.is_hotel_staff(auth.uid()));
```

Apply via MCP `apply_migration` with the same SQL. Verify with a `pg_policies` select.

- [ ] **Step 3: `_shared/auth.ts`** — add alongside `getCallerEmail` (do not modify it):

```ts
export async function getCallerUser(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email.toLowerCase() };
}
```

In `index.ts`, replace the `getCallerEmail(req)` gate with `const caller = await getCallerUser(req); if (!caller) { ...401... }`.

- [ ] **Step 4: Frontend** — `messageSender.ts`:

```ts
export const sendMessageToAI = async (message: string, messageId: string, sessionId?: string) => {
  const { data, error } = await supabase.functions.invoke('chat-with-data', {
    body: { message, messageId, sessionId },
  });
  if (error) throw error;
  return data;
};
```

`useMessageSending.ts:48` becomes `await sendMessageToAI(userMessageContent, userMessage.id, activeSessionId)` where `activeSessionId` is the accessor found in Step 1 (thread it into the hook's arguments if not already in scope — follow the existing prop-drilling pattern used for session switching).

- [ ] **Step 5: Backend write** — `conversation-session-manager.ts`: `saveToWebsiteChats` renamed to `saveToDashboardChat`, targets `2s-dashboard_AI_Chat`, inserts `{ session_id: sessionId, user_message: userMessage, ai_response: aiResponse, user_id: userId, created_at: new Date().toISOString() }`; `saveConversationWithContext` gains a `userId: string` parameter and calls it whenever `sessionId` is truthy. `index.ts` call site passes `caller.id`. History read (`index.ts`, `2s-dashboard_AI_Chat`) adds `.eq('user_id', caller.id)` so users only resume their own sessions.

- [ ] **Step 6: Build check** — `npm run build` (frontend must compile; the Vite build is the only automated frontend check in this repo).

- [ ] **Step 7: Commit**

```bash
git add src/utils/messageSender.ts src/hooks/useMessageSending.ts supabase/functions/_shared/auth.ts supabase/functions/chat-with-data/ supabase/migrations/
git commit -m "feat(sera): persist chat sessions to 2s-dashboard_AI_Chat under caller identity"
```

- [ ] **Step 8: Deploy function + deploy gate. Frontend deploys via the site's normal build pipeline** — ask the user how they publish `dist/` (out of band) or leave built assets to their usual flow. Ground truth: after the user sends a panel message, `select session_id, user_id, created_at from public."2s-dashboard_AI_Chat" order by created_at desc limit 3` shows the new row (first DB-persisted chat since 2026-04-23).

---

### Task 9: Fabrication engine correctness (E2)

**Files:**
- Modify: `supabase/functions/chat-with-data/data-fabrication-detector.ts` (scope regexes)
- Modify: `supabase/functions/chat-with-data/response-completeness-engine.ts` (language-aware fallback, no wholesale Arabic replacement for English users)
- Modify: `supabase/functions/chat-with-data/conversation-context-validator.ts:79-84` (stop flagging English responses as language errors)
- Test: `tests/unit/fabrication-detector.test.ts`

**Interfaces:**
- Consumes: `LanguageDetector` (existing `language-detector.ts`) — verify its export name/signature in Step 1 and use it to pick the fallback language.
- Produces: `detectFabricatedMetrics(text: string): string[]` (list of matched metric names, empty = clean) exported from `data-fabrication-detector.ts`; honest-fallback text in English and Arabic variants selected by detected user language.

- [ ] **Step 1: Verify** — current regex list includes `/booking.*\d+/i` (`grep -n 'booking' data-fabrication-detector.ts`); `response-completeness-engine.ts:131-158` hardcodes Arabic; `conversation-context-validator.ts:79-84` pushes "Respond in Arabic". Read `language-detector.ts` exports.

- [ ] **Step 2: Failing test** — `tests/unit/fabrication-detector.test.ts`:

```ts
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
```

- [ ] **Step 3: Run to verify failure** (function not exported yet), then **Step 4: Implement** in `data-fabrication-detector.ts` — replace the broad regex list with metric-adjacent patterns and export:

```ts
const METRIC_PATTERNS: Array<[string, RegExp]> = [
  ['occupancy', /\boccupancy\b[^.\n]{0,30}?\d+(\.\d+)?\s*%/i],
  ['adr', /\badr\b[^.\n]{0,30}?(aed\s*)?\d/i],
  ['revpar', /\brevpar\b[^.\n]{0,30}?(aed\s*)?\d/i],
  ['revenue', /\brevenue\b[^.\n]{0,30}?(aed|\$|usd)\s*\d/i],
];
export function detectFabricatedMetrics(text: string): string[] {
  return METRIC_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
}
```

Keep the class's existing public method as a thin wrapper over `detectFabricatedMetrics` so `DataUtilizationScorer` keeps compiling (verify its call site in Step 1 and adapt the wrapper's return shape to it). Delete the `/booking.*\d+/i` pattern entirely.

- [ ] **Step 5:** `response-completeness-engine.ts` — where the wholesale replacement fires, select fallback text by detected language of the USER MESSAGE (not hardcoded Arabic): English default "I don't have verified data for {metrics} in my connected tables, so I won't quote numbers for it. I can answer from reviews, WhatsApp chats, guest emails, competitor rates, social engagement, welcome messages, and training records."; Arabic equivalent for Arabic messages (keep the existing Arabic copy, trimmed to match the English meaning). Replacement fires ONLY when `detectFabricatedMetrics(answer).length > 0` AND no query tool ran (`executedTools` check stays in `index.ts`). Scope note: tool payloads (`instruction_to_model` strings from Task 4's convention) are already language-safe — the model renders them in the conversation language — so this task touches ONLY the wholesale-replacement path, which bypasses the model and therefore needs explicit language selection.

- [ ] **Step 6:** `conversation-context-validator.ts:79-84` — delete the branch that flags English responses ("I apologize", "I am unable") and pushes "Respond in Arabic"; language choice belongs to the persona prompt ("match the user's language").

- [ ] **Step 7: Run all unit tests; commit** — `fix(sera): scope fabrication detection to real metrics and honor user language in fallbacks`.

- [ ] **Step 8: Deploy + deploy gate + behavior check** — English question "How many bookings-related WhatsApp messages yesterday?" must return a normal English answer (previously at risk of Arabic replacement).

---

### Task 10: Persona/capability alignment (E3)

**Files:**
- Modify: `supabase/functions/chat-with-data/system-prompt-builder.ts`
- Test: `tests/unit/system-prompt.test.ts`

**Interfaces:**
- Consumes: tool names from Tasks 4–7 (`query_whatsapp_chats`, `query_reviews`, `query_sera_emails`, `query_competitor_rates`, plus existing `query_training_records`, `search_web`).
- Produces: prompt copy later tasks/tests can assert on: the exact line `You cannot send emails, SMS, or WhatsApp messages.` and a `## YOUR DATA TOOLS` section listing the six tool names.

- [ ] **Step 1: Verify** — `grep -n 'Send emails' system-prompt-builder.ts` (line ~92 claims send capabilities); confirm `getActionFunctions()` still returns `[]`.

- [ ] **Step 2: Failing test** — `tests/unit/system-prompt.test.ts` (SystemPromptBuilder is a static class; import must not touch Deno APIs — verify in Step 1, and if it imports `timezone-utils.ts` that file is pure Intl, safe for Node):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SystemPromptBuilder } from '../../supabase/functions/chat-with-data/system-prompt-builder.ts';

const emptyConversation = { recentDataPoints: new Map(), userPreferences: { focusAreas: [], communicationStyle: 'balanced' }, conversationFlow: [] } as any;

test('prompt names every query tool and disclaims sending', () => {
  const p = SystemPromptBuilder.buildConsultantPrompt(emptyConversation);
  for (const tool of ['query_training_records', 'query_whatsapp_chats', 'query_reviews', 'query_sera_emails', 'query_competitor_rates', 'search_web']) {
    assert.ok(p.includes(tool), `missing ${tool}`);
  }
  assert.ok(p.includes('You cannot send emails, SMS, or WhatsApp messages.'));
  assert.ok(!p.includes('Send emails, SMS, WhatsApp via action functions'));
});
```

(If `emptyConversation`'s shape doesn't satisfy `ConversationData`, copy the real interface fields from `types.ts` in Step 1 — the test must construct a minimal valid object, not `as any`-cast an invalid one.)

- [ ] **Step 3: Run to verify failure**, then **Step 4: Edit the prompt** — remove the send-capabilities claim; replace the stale 11-table "evidence base" list with the seven snapshot domains (Task 3 names) + `## YOUR DATA TOOLS` section:

```
## YOUR DATA TOOLS
- query_whatsapp_chats — guest WhatsApp conversations (Chat History)
- query_reviews — guest reviews and scores
- query_sera_emails — guest emails Sera handled
- query_competitor_rates — competitor room rates (AED)
- query_training_records — staff training sessions and participants
- search_web — the hotel's public website only
For ANY numeric question about these domains, call the matching tool. Never estimate.
You cannot send emails, SMS, or WhatsApp messages. If asked, say so and offer the data or draft text instead.
```

- [ ] **Step 5: Run all unit tests; commit** — `fix(sera): align persona prompt with real tools and capabilities`.

- [ ] **Step 6: Deploy + deploy gate + behavior check** — "Can you send an SMS to a guest?" → Sera must decline and offer a draft, not promise to send (compare with the April log where she promised).

---

### Task 11: Dead code removal (E4) — REPO-ONLY, NO DEPLOY

**Scope decision (user-approved):** `index.ts` import cleanup moved into Task 3. This task deletes only files that nothing imports — such files never enter the deployed bundle (`--use-api` bundles the entrypoint's import graph), so this commit changes zero deployed bytes and requires no deploy and no deploy gate. Git history preserves everything; a mistaken deletion is one `git revert` away. No marker file (user decision — deletion itself removes the confusion source).

**Files:**
- Delete (each only after proof): `enhanced-data-service.ts`, `enhanced-data-service-old.ts`, `enhanced-context-builder-old.ts`, `data-service.ts`, `context-builder.ts`, `smart-context-builder.ts`, `context-length-manager.ts`, `honest-response-generator.ts`, `customer-behavior-analytics.ts`, `query-specific-data-service.ts`, `data-section-builders.ts`

**Interfaces:**
- Consumes: nothing. Produces: nothing (deletion only).

- [ ] **Step 1: Prove unreachability, one file at a time** — for each candidate `F`:

```bash
grep -rn "from './<F-basename>" supabase/functions/chat-with-data/ | grep -v -- '-old'
```

A file is deletable when its only importers are (a) `index.ts` importing symbols it never calls (confirm with `grep -c '<Symbol>' index.ts` == 1, the import line), or (b) other files already on the delete list. Build the closure: `data-service.ts` is imported by `index.ts` (symbols `queryReviewsByDateRange`, `getAnalyticsData` — verify each occurs exactly once); `honest-response-generator.ts` and `customer-behavior-analytics.ts` likewise; `query-specific-data-service.ts` is imported only by `enhanced-data-service.ts`; `context-length-manager.ts` only by `smart-context-builder.ts`. Record the proof output in the task report. **If any candidate has a live importer, keep it and note why.**

- [ ] **Step 2: Confirm `index.ts` no longer imports any candidate** (Task 3 already removed the dead imports — verify with `grep -n "data-service\|honest-response-generator\|customer-behavior-analytics" supabase/functions/chat-with-data/index.ts`, expect no import hits), delete the proven files, and confirm the entrypoint still parses:

```bash
node -e "const s=require('fs').readFileSync('supabase/functions/chat-with-data/index.ts','utf8'); for (const m of s.matchAll(/from '\.\/(.+?)'/g)) { require('fs').accessSync('supabase/functions/chat-with-data/'+m[1]); } console.log('all local imports resolve')"
```

- [ ] **Step 3: Run all unit tests** — `npx tsx --test tests/unit/*.test.ts` — all pass (none may import deleted files).

- [ ] **Step 4: Commit** — `chore(sera): delete dead data services proven unreachable`.

- [ ] **Step 5: No deploy.** Verify the claim that nothing shipped changes: the deleted files must not appear in the deploy scratch refresh (they're copied by `deploy.sh` only if present in the repo — after deletion they simply vanish from the next scratch copy, and they were never in the bundle). Record in the task report: list of deleted files + the grep proof for each.

---

## Self-Review Notes

- **Spec coverage:** A1 → Task 1 (implementation pre-committed, deploy+gate here). B1/B2 → Task 2. C1 → Task 3. D1 (4 domains, ordered WhatsApp → reviews → emails → rates) → Tasks 4–7. E1 → Task 8. E2 → Task 9. E3 → Task 10. E4 → Task 11. Out-of-scope freshness → disclosed in Task 5's empty-result note and Global Constraints.
- **Info-email, social, welcome domains** intentionally get snapshot context (Task 3) but no dedicated tool — the spec's D order names only four domains. Extending later is mechanical (copy the Task 4 pattern).
- **Type consistency check:** `QUERY_TOOL_NAMES` grows in Tasks 4→7; `composeSystemContent` heading string reused verbatim in Task 2 test; `dubaiDateKey` shared from `whatsapp-aggregator.ts` into `emails-aggregator.ts`; `getCallerUser` replaces `getCallerEmail` only inside `chat-with-data` (sp-* untouched).
- **Every deploy step requires the user's access token** — batch deploys where the user prefers (e.g., deploy after Tasks 2–3 together) but the deploy gate must run after every deploy regardless.

## Amendments (2026-07-29, agreed with user after plan review)

1. **Access probe (all domain tools + training retrofit):** RLS-empty and truly-empty results are indistinguishable from the user-scoped query (denied SELECT = 200 + empty array). On the empty path only, a head-only service-role existence count classifies the result into `no_records_found` / `records_not_visible` / `no_visible_records_unverified` (probe failure → assert nothing about existence). Wording stays generic — never name who can see the data (policy is the single source of truth). Implemented in Task 4 (`access-probe.ts`), used by Tasks 4–7 and retrofitted into `query_training_records`.
2. **Language:** tool payloads are model-facing (`instruction_to_model`, English) — the model renders replies in the conversation language, so no reordering of Task 9 was needed; Task 4's ground truth includes an Arabic-question check. Task 9 remains scoped to the wholesale-replacement path, which bypasses the model.
3. **Deploy workflow:** the USER runs `deploy.sh` in their own shell with `SUPABASE_ACCESS_TOKEN` (token never enters chat); Claude verifies the deployed version via the management API and runs the gate curls (no token required for either). Deploy checkpoints: T1, T2+3, T4+5, T6+7, T8, T9+10.
4. **Old Task 11 split:** `index.ts` dead-import removal folded into Task 3; file deletion is a repo-only commit with grep proofs, no deploy, no marker file.

5. **Task 12 added (2026-07-29 battery finding, user-approved):** PostgREST `api.max_rows = 1000` silently clamps every tool fetch; ROW_CAPs of 4000/5000 (and training's PARTICIPANT_CAP 2000 / DEPARTMENT_SCAN_CAP 10000) are unreachable, so truncation notes never fire and `rows.length` masquerades as the total (live proof: Sera answered "1000 reviews / 4.47" vs ground truth 7,888 / 4.46 — the latest-1000 average is exactly 4.47). Fix: pure `paged-fetch.ts` helper (`fetchAllWithCap` — `.range()` pages of 1000, `count: 'exact'` on the first page, fail-closed on page errors, unique `id` order tiebreaker), wired into all four domain services + training participants + department scan; totals come from the exact count; truncation notes fire when count > fetched. Tests stub the SERVER contract (pages clamped to 1000 regardless of requested span) — the old stubs modeled the code's assumption instead, which is why they passed. Full task text with exact code: `.superpowers/sdd/2026-07-29-sera-data-access/task-12-brief.md`. Same gates as Tasks 4–7: unit tests + deploy + ground-truth re-check (B2 rerun mandatory).

6. **Task 13 added (2026-07-30, user-approved):** the frontend twin of Task 12 — five insights hooks (`use{Reviews,Competitors,Welcome,Social,Email}Insights.ts`) use `.limit(10000)` + client-side rows.length KPIs and are clamped to 1000 rows (Reviews and Competitors dashboards wrong today). Fix: convert all five to the existing `fetchAllRows` helper with unique-`id` order tiebreakers, plus a source-lint regression test (`tests/unit/no-overclamp-limit.test.ts`) failing on any literal `.limit(N>1000)` in src/ or supabase/functions/. Verification: guard test red→green, full suite, scoped eslint, `npm run build`. Publish = rebuild `dist/` in place after review (also ships pending Task 8 frontend + trainer helper text). Full task text: `.superpowers/sdd/2026-07-29-sera-data-access/task-13-brief.md`.

7. **Task 14 added (2026-07-30, user-approved):** close the cross-surface divergence (dashboard true 4.46 vs Sera capped 4.57 presented as "overall"). Raise reviews ROW_CAP 5000→10000 (exact averages at current 7,888 rows; 8 bounded paged requests) and rewrite all five services' truncation notes as imperative "You MUST tell the user…" instructions so the caveat survives model rendering when any table outgrows its cap. Full task text: `.superpowers/sdd/2026-07-29-sera-data-access/task-14-brief.md`. Post-deploy check: user asks Sera the overall-reviews question from their own account (test account retired) — expect 7,888 / 4.46 with no caveat needed.
