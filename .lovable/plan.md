

## خطة: إظهار اسم الموظف بدلاً من "HUMAN AGENT"

الهدف: استبدال label "HUMAN AGENT" في فقاعة الرد البرتقالية باسم الموظف الأول الذي أرسل الرسالة فعلياً (مثل "Ahmed"), مع إبقاء البادج البرتقالي للتمييز البصري.

---

### 1. قاعدة البيانات (Migration)

إضافة عمودين جديدين على جدول `Chat History`:

| العمود | النوع | الغرض |
|---|---|---|
| `replied_by_user_id` | `uuid` (nullable) | FK مرجعي لـ `auth.users(id)` — للتدقيق |
| `replied_by_name` | `text` (nullable) | الاسم الأول المعروض (cached للسرعة، لا حاجة لـ join) |

السبب لتخزين الاسم بدلاً من الـ join: جدول `auth.users` لا يدعم RLS join مباشرةً من الواجهة، وتخزين snapshot يحفظ الاسم حتى لو غُيّر لاحقاً.

---

### 2. Edge Function: `whatsapp-send-message`

- قراءة الـ JWT للمستخدم الذي أرسل الطلب باستخدام `supabase.auth.getUser()`.
- استخراج اسمه من `user.user_metadata.first_name` أو `user.user_metadata.full_name` أو fallback من جزء الـ email قبل `@` (مثلاً `ahmed.mokhtar` → `Ahmed`).
- إضافة `replied_by_user_id` و `replied_by_name` إلى الـ row المُدرج عند إرسال human_reply.
- التأكد من تمرير `Authorization` header من client (موجود تلقائياً عبر `supabase.functions.invoke`).

---

### 3. AuthContext / تحديث user metadata

عند أول تسجيل دخول، إذا لم يكن `user_metadata.first_name` موجوداً:
- استخراجه من الـ email (الجزء قبل النقطة الأولى → capitalize).
- استدعاء `supabase.auth.updateUser({ data: { first_name: 'Ahmed' } })` مرة واحدة.

هذا يضمن أن المستخدم الحالي (`ahmed.mokhtar@2seasonshotels.com`) سيُسجَّل تلقائياً كـ "Ahmed".

---

### 4. Frontend — عرض الاسم

**`src/hooks/useWhatsAppChat.ts`**
- إضافة `repliedByName?: string` إلى interface `WhatsAppMessage`.
- في كل من `loadHistory` و realtime handler: قراءة `chat['replied_by_name']` وتمريرها للرسائل التي لها `human_reply`.
- في `sendMessage` (وضع human): تمرير اسم المستخدم الحالي للـ outgoing bubble فوراً (optimistic).

**`src/components/whatsapp/WhatsAppChatPanel.tsx`**
- تمرير `repliedByName` إلى `<WhatsAppMessage />`.

**`src/components/whatsapp/WhatsAppMessage.tsx`**
- إضافة prop `repliedByName?: string`.
- تعديل label الـ human reply:
  - الحالي: `<UserCheck/> HUMAN AGENT`
  - الجديد: `<UserCheck/> {repliedByName || 'Agent'}` (مثلاً: `Ahmed`)
- إبقاء الأيقونة البرتقالية واللون كما هما لتمييز رسائل الموظفين عن AI.

---

### 5. عرض النتيجة المتوقعة

```text
┌─────────────────────┐
│ 👤 Ahmed            │   ← بدلاً من HUMAN AGENT
│ hi                  │
│ 12:02               │
└─────────────────────┘
```

البيانات القديمة (الرسائل السابقة بدون `replied_by_name`) ستعرض fallback "Agent" تلقائياً.

---

### تفاصيل تقنية موجزة

- **Migration ملفات:** `supabase/migrations/<timestamp>_add_replied_by_to_chat_history.sql`
- **RLS:** لا تغييرات — الـ policy الحالي على `Chat History` للمستخدمين المُصادَق عليهم يكفي.
- **الخصوصية:** الاسم يظهر فقط في dashboard الداخلي. WhatsApp Cloud API لا يستقبل ولا يعرض هذا الحقل للضيف — رسالة الواتساب تبقى بدون توقيع.
- **بدون تغيير على:** AI mode, n8n webhook, attachment flow, takeover/release logic.

