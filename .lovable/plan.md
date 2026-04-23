

## إصلاح منطق "الاستلام البشري" — منع AI من الرد أثناء التحكم البشري

### المشكلة الحالية
عندما تضغط "Take Over" وترد على العميل:
1. ✅ رسالتك تصل للعميل بنجاح.
2. ❌ عندما يرد العميل، الرسالة تصل إلى webhook الخاص بـ n8n (مباشرة من Meta WhatsApp Cloud)، و **n8n ليس لديه أي فكرة أن المحادثة تحت تحكم بشري** — فيرد الـ AI تلقائياً.
3. ❌ لا يوجد آلية تمنع n8n من الرد أثناء وضع التحكم البشري.

السبب الجذري: حالة `is_human_controlled` مخزّنة في Supabase فقط، ولا تُفحَص في تدفّق n8n الذي يستقبل رسائل WhatsApp الواردة.

### الحل: حارس قاعدة بيانات + فحص في n8n

سأبني طبقتين دفاع:

#### الطبقة 1 — دالة Postgres للاستعلام السريع
إنشاء دالة `is_conversation_human_controlled(sender_number text)` ترجع `boolean`:
- تبحث عن آخر صف لهذا الرقم.
- ترجع `true` إذا كان `is_human_controlled = true` ولم يُسجَّل `released_to_ai_at` بعد ذلك.

#### الطبقة 2 — Edge Function جديدة: `whatsapp-control-status`
نقطة وصول `GET ?senderNumber=...` ترجع:
```json
{ "isHumanControlled": true|false, "lastReleaseAt": "..." }
```
هذه الدالة تُستدعى من **n8n** كأول خطوة في تدفّق الرد على العميل. إذا كانت `true` → n8n **يتجاوز عقدة AI نهائياً** ولا يرسل أي شيء للعميل. الرسالة تُحفظ فقط في `Chat History` كـ `Sender Message`.

#### الطبقة 3 — تحديث `whatsapp-web-chat` (الواجهة)
عندما تكون المحادثة `is_human_controlled = true` والمستخدم يكتب من الواجهة في وضع AI خطأً، نمنع الإرسال ونعرض تحذير. (دفاع إضافي للحالات الحدّية.)

### تدفّق العمل الجديد

```text
[العميل يرسل رسالة على WhatsApp]
            ↓
   [Meta Cloud → n8n webhook]
            ↓
   [n8n يستدعي whatsapp-control-status]
            ↓
   ┌────────┴────────┐
   ↓                 ↓
isHuman=true    isHuman=false
   ↓                 ↓
[احفظ فقط    [مرّر إلى AI agent
كـ Sender     → احفظ Ai Reply
Message،      → أرسل للعميل]
لا ترد]
```

### عند الضغط على "Release" (تحرير للـ AI)
- يُحدَّث `is_human_controlled = false` لكل صفوف الرقم (موجود حالياً ✅).
- يُدرَج صف marker بـ `released_to_ai_at = now()` (موجود حالياً ✅).
- **إضافة جديدة**: لن يرد الـ AI تلقائياً على رسالة سابقة. سيرد فقط عندما يرسل العميل رسالة **جديدة** بعد التحرير. هذا يتحقق طبيعياً لأن n8n يرد على رسائل واردة جديدة فقط.
- السياق التاريخي يُمرَّر عبر `conversationContext` (موجود حالياً في `whatsapp-web-chat` ✅) ليكون الـ AI واعياً بما حدث أثناء تحكم البشري — لكن **بدون الرد على تلك الرسائل**.

### الملفات

**جديد**:
1. **Migration SQL** — دالة `public.is_conversation_human_controlled(text) returns boolean` (SECURITY DEFINER).
2. `supabase/functions/whatsapp-control-status/index.ts` — Edge Function عامة (verify_jwt=false) ترجع حالة التحكم لرقم معيّن. بدون مفاتيح، فقط استعلام للقراءة.

**معدّل**:
3. `src/hooks/useWhatsAppChat.ts` — منع إرسال رسالة عبر مسار AI (`whatsapp-web-chat`) إذا كانت `isHumanControlled = true` (دفاع إضافي).

### ما يجب على المستخدم فعله في n8n (سأشرحه بوضوح)
بعد نشر التغييرات، أُرفق دليلاً قصيراً يوضّح:
- إضافة عقدة **HTTP Request** في بداية تدفّق n8n WhatsApp.
- URL: `https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/whatsapp-control-status?senderNumber={{ $json.from }}`.
- إضافة عقدة **IF** بعدها: إذا `isHumanControlled === true` → اذهب لمسار "حفظ فقط" (يحفظ الرسالة في Chat History بدون رد).
- إذا `false` → التدفّق الحالي للـ AI كما هو.

### خارج النطاق
- لن أُعدّل تدفّق n8n نفسه (لا أملك صلاحية تعديل سير عمل العميل) — سأعطي تعليمات واضحة.
- لن أُغيّر شكل أو سلوك زر Take Over / Release في الواجهة — يعملان بشكل صحيح.
- لن أضيف إشعارات للوكيل البشري عند رسالة جديدة (يمكن طلبه لاحقاً).

