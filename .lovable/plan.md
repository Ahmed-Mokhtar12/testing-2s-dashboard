

## تبسيط Sera prompt + ربطها بجداول Two Seasons فقط

### الجداول المعتمدة (11)
**بيانات Dashboard:** `reviews`, `Chat History`, `email_threads`, `Two Seasons Competitor Hotel room Rates`, `info_email_audit_log`, `social_engagement_logs`, `welcome_message_success_log`  
**معرفة مساندة:** `N8N_2S`, `Sop`, `Conducted Training`, `LongTermMemory`  
**مستثنى:** `khaldia_reviews`, جميع `website_*`, `burst_*`, `n8n_chat_histories`, `conducted_training` (lowercase)

---

### 1) إعادة كتابة `system-prompt-builder.ts`
استبدال الـ prompt الحالي (110 سطر) بنسخة مبسّطة (~50 سطر):

```
You are Sera, Senior Hotel Management Consultant for Two Seasons Hotel, Dubai.
Professional, data-driven, concise. Respond in the user's language (English default).

⏰ Timezone: Dubai (GMT+4) for all dates/times.

📊 YOUR DATA SOURCES (Two Seasons only — never reference other properties):

Dashboard data:
- reviews — Guest reviews & ratings (TripAdvisor, Booking, Google, etc.)
- Chat History — WhatsApp guest conversations
- email_threads — Email conversations with guests
- Two Seasons Competitor Hotel room Rates — Daily competitor pricing (AED)
- info_email_audit_log — info@ inbox classification & routing log
- social_engagement_logs — Social media DMs & replies (IG, FB, TikTok)
- welcome_message_success_log — Arrival welcome messages sent to guests

Knowledge base:
- N8N_2S — Uploaded documents (SOPs, PDFs, embeddings)
- Sop — Standard Operating Procedures by department
- Conducted Training — Past staff training summaries
- LongTermMemory — Persistent conversation memory

🔒 STRICT BOUNDARIES:
- ONLY use the tables listed above. Never query or reference other database tables.
- For anything outside these tables → use web search or admit you don't have it.
- Never fabricate data. If a metric isn't in these tables, say so clearly.

🔧 RETRIEVAL PRIORITY:
1. Tables above (primary source)
2. 2seasonshotels.com (search_web with site: filter) for current hotel info
3. General web search for industry trends, news, external context
4. General knowledge as last resort with disclaimer

💬 STYLE:
- Lead with concrete numbers from the data
- Short, scannable answers (bullets when listing, prose when explaining)
- Reference previous conversation context naturally
- Ask for clarification only when truly needed
- Suggest follow-up actions/questions when valuable

🎯 CAPABILITIES:
- Analyze reviews, conversations, competitor rates, welcome messages
- Send emails, SMS, WhatsApp via action functions
- Search hotel website and the web
- Remember conversation context

{conversationContext}
{memoryContext}
```

- إزالة "Marcus Chen" → **Sera** في كل مكان.
- إزالة الجمل العربية الثابتة (الردّ يتبع لغة المستخدم تلقائياً).
- إزالة الأرقام الثابتة (1,719 / 4.24).
- إزالة التناقض حول "no booking data" — الجداول الآن واضحة.

### 2) تحديث `human-consultant-personality.ts`
تغيير التعليقات من "Marcus" → "Sera". لا تغيير منطقي.

### 3) تحديث `base-context-builder.ts`
تبسيط المحتوى ليتماشى مع الـ prompt الجديد، وإزالة التكرار حول "website-first" (الأولوية الآن: tables → website → web).

### 4) تحديث `context-builder.ts`
تغيير "Marcus Chen" → **Sera** وتقليم الـ retrieval guidelines ليطابق البنية الجديدة.

### 5) قائمة الجداول البيضاء (Whitelist)
إضافة ثابت في `data-service.ts` و`enhanced-data-service.ts`:

```ts
export const ALLOWED_TABLES = [
  'reviews', 'Chat History', 'email_threads',
  'Two Seasons Competitor Hotel room Rates',
  'info_email_audit_log', 'social_engagement_logs',
  'welcome_message_success_log',
  'N8N_2S', 'Sop', 'Conducted Training', 'LongTermMemory',
] as const;
```
- مراجعة استدعاءات `supabase.from(...)` في الـ edge function والتأكد أنها كلها داخل القائمة.
- إزالة أي استعلام لجداول `khaldia_reviews` / `website_*` / `burst_*` إن وُجدت.

### 6) تحديث الـ memory
- تحديث `mem://ai/persona-and-intelligence-standards` ليعكس قائمة الجداول الـ11 وحدود Sera الجديدة.
- إضافة `mem://ai/sera-allowed-tables` كمرجع سريع للقائمة البيضاء.

---

### الملفات المُعدَّلة
1. `supabase/functions/chat-with-data/system-prompt-builder.ts` (إعادة كتابة كاملة)
2. `supabase/functions/chat-with-data/human-consultant-personality.ts` (تنظيف)
3. `supabase/functions/chat-with-data/base-context-builder.ts` (تبسيط)
4. `supabase/functions/chat-with-data/context-builder.ts` (تحديث الاسم + التبسيط)
5. `supabase/functions/chat-with-data/data-service.ts` (whitelist)
6. `supabase/functions/chat-with-data/enhanced-data-service.ts` (whitelist)
7. `mem://ai/persona-and-intelligence-standards` (تحديث)
8. `mem://ai/sera-allowed-tables` (إضافة)

### بدون تغييرات
- لا تعديلات على قاعدة البيانات أو RLS.
- لا تغييرات على الـ UI.
- لا تغييرات على routing أو n8n.

### اختبار سريع
1. افتح الشات → اسأل "How many reviews do we have?" → يجب أن يرد برقم حقيقي من جدول `reviews`.
2. اسأل "What's our competitor pricing today?" → يستخدم `Two Seasons Competitor Hotel room Rates`.
3. اسأل "Show me khaldia reviews" → يجب أن يرفض ويوضح أنه يخدم Two Seasons فقط.
4. اسأل "Latest WhatsApp conversations?" → يقرأ من `Chat History`.
5. اسأل "What's the weather in Dubai?" → يستخدم web search.

