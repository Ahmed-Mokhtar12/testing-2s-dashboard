

## خطة محدّثة: Release ذكي للـ AI + Auto-Release بعد 60 دقيقة

### الهدف
1. عند Release اليدوي: الـ AI يقرأ سياق محادثة Human كـ context-only، ولا يردّ على الرسائل القديمة، ويردّ فقط على رسائل جديدة بعد لحظة Release.
2. **Auto-Release**: لو نسي الموظف الضغط على Release، يتم تحرير المحادثة تلقائياً للـ AI بعد **60 دقيقة من آخر نشاط** (آخر رسالة عميل أو آخر `human_reply`).

---

### الجزء 1 — Release اليدوي مع سياق read-only (كما اتُّفق سابقاً)

#### تغييرات DB
إضافة عمود إلى `Chat History`:
- `released_to_ai_at timestamptz nullable` — يُكتب في صف marker عند كل Release.

#### `whatsapp-send-message` — توسيع `action: 'release'`
1. تحديث `is_human_controlled = false` لكل صفوف هذا الرقم (السلوك الحالي).
2. إدراج صف marker جديد:
   - `Sender Number` = الرقم
   - `released_to_ai_at = now()`
   - باقي الحقول النصية null (لن يظهر في الـ UI).

#### `whatsapp-web-chat` — منطق الردّ الذكي
عند وصول رسالة عميل جديدة:
1. اقرأ آخر `is_human_controlled` للرقم.
2. لو `true` → لا ترسل لـ n8n.
3. لو `false`:
   - اقرأ آخر `released_to_ai_at` لهذا الرقم.
   - ابنِ `conversationContext` من سجل المحادثة قبل ذلك التوقيت.
   - مرّر للـ payload:
     ```json
     {
       "message": "...",
       "senderNumber": "...",
       "conversationContext": "[Read-only history. Do NOT reply to these — already handled by human agent. Use only as context for the new message.]\n- Customer: ...\n- Human Agent: ...",
       "source": "web"
     }
     ```

---

### الجزء 2 — Auto-Release بعد 60 دقيقة خمول

#### المبدأ
كل دقيقة، job مجدوَل يفحص كل المحادثات النشطة في وضع Human ويحرّر تلقائياً تلك التي لم يحدث فيها أي نشاط منذ 60 دقيقة.

#### Edge Function جديدة: `whatsapp-auto-release`
- تُستدعى دورياً عبر `pg_cron`.
- المنطق:
  ```
  لكل Sender Number لديه is_human_controlled = true:
    اقرأ MAX(created_at) من صفوفه التي تحوي (Sender Message OR human_reply OR Ai Reply)
    لو (now() - last_activity) > 60 دقيقة:
      - تحديث is_human_controlled = false
      - إدراج صف marker بـ released_to_ai_at = now()
      - (اختياري) log سطر يوضّح أن الإفراج كان تلقائياً
  ```

#### جدولة عبر `pg_cron`
تفعيل `pg_cron` و `pg_net`، ثم جدولة استدعاء كل دقيقة:
```sql
select cron.schedule(
  'whatsapp-auto-release-every-minute',
  '* * * * *',
  $$ select net.http_post(
       url:='https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/whatsapp-auto-release',
       headers:='{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
       body:='{}'::jsonb
     ); $$
);
```

#### تأثير على الواجهة (دون أي تغيير كود)
الـ `useWhatsAppChat` مشترك أصلاً في Realtime على `Chat History` لهذا الرقم. عندما يُحدِّث الـ cron الـ `is_human_controlled` إلى `false`، الواجهة ستلتقط التغيير تلقائياً عبر الـ INSERT الخاص بصف الـ marker، ويتحول الزر من "Release to AI" إلى "Take Over" بدون تدخل المستخدم.

> تنبيه بسيط (اختياري): إن أردت توست يخبر الموظف "تم التحرير تلقائياً بعد 60 دقيقة"، يمكن إضافته في `useWhatsAppChat` بمقارنة الحالة السابقة. يُذكر ذلك فقط — لن يُنفّذ ما لم تطلبه.

---

### ما لن يتغيّر (حماية للنظام الحالي)
- بنية الـ UI (Sidebar/Header/Panel) — صفر تغيير.
- منطق Take Over اليدوي — صفر تغيير.
- منطق إرسال Human عبر WhatsApp Cloud API — صفر تغيير.
- منطق Realtime — صفر تغيير.
- منطق إرسال AI الحالي — يُضاف فقط حقل `conversationContext` في الـ payload (n8n سيتجاهله إن لم يستخدمه).

---

### الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| **DB migration** | إضافة `released_to_ai_at timestamptz` إلى `Chat History` + تفعيل `pg_cron` و `pg_net` + جدولة الـ cron job |
| `supabase/functions/whatsapp-send-message/index.ts` | في فرع `action: 'release'` → إدراج صف marker بـ `released_to_ai_at = now()` |
| `supabase/functions/whatsapp-web-chat/index.ts` | بناء `conversationContext` (سجل ما قبل آخر `released_to_ai_at`) وتمريره لـ n8n |
| **جديدة** `supabase/functions/whatsapp-auto-release/index.ts` | فحص كل المحادثات وتحرير تلقائي بعد 60 دقيقة خمول |

---

### النتيجة
- Release اليدوي: AI يفهم ما حدث ولا يكرّر ردّ Human، ويردّ فقط على رسائل جديدة.
- Auto-Release: لو نسي الموظف، النظام يحرّر تلقائياً بعد 60 دقيقة من آخر نشاط، فلا تبقى محادثة عالقة في وضع Human بلا تدخّل.
- صفر مخاطر على الواجهة أو منطق الإرسال الحالي.

