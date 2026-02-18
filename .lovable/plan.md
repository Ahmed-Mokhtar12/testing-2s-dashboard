
# Human Takeover Feature - تدخل الموظف البشري في المحادثة

## ما المشكلة الحالية؟
حالياً عندما تكتب رسالة في واجهة الويب، ترسل للـ n8n ثم يرد عليها الـ AI. لا يوجد طريقة لإرسال رسالة مباشرة للعميل على واتساب الحقيقي من الواجهة.

## كيف سيعمل النظام الجديد؟

الوضع الطبيعي - AI يرد تلقائياً:
```
العميل يرسل رسالة على واتساب
         ↓
   n8n يعالج الرسالة
         ↓
   AI يرد على العميل
         ↓
تُحفظ المحادثة في Supabase
```

بعد تدخل الموظف البشري:
```
الموظف يضغط زر "Takeover"
         ↓
AI يتوقف تلقائياً (is_human_controlled = true)
         ↓
الموظف يكتب رسالة في الواجهة
         ↓
Edge Function جديدة ترسل الرسالة لـ WhatsApp Cloud API مباشرة
         ↓
الرسالة تصل للعميل على هاتفه الحقيقي فوراً
         ↓
تُحفظ في Supabase كـ "Human Reply"
```

---

## التغييرات المطلوبة

### 1. تعديل قاعدة البيانات - إضافة عمود `is_human_controlled`
إضافة عمود boolean في جدول `Chat History` لكل محادثة (بحسب `Sender Number`):
- `false` = AI يتحكم (الوضع الافتراضي)
- `true` = موظف بشري يتحكم، الـ AI يتوقف

وعمود آخر `human_reply` لحفظ الرسائل التي أرسلها الموظف.

### 2. Edge Function جديدة: `whatsapp-send-message`
ترسل رسالة مباشرة لـ WhatsApp Cloud API:
```
POST https://graph.facebook.com/v22.0/806192452586846/messages
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
Body: { to: senderNumber, type: "text", text: { body: "..." } }
```
وتحفظ الرسالة في Supabase كـ `human_reply`.

### 3. تعديل n8n Workflow (يدوي من جانبك)
في n8n، تحتاج إضافة node يتحقق قبل رد الـ AI:
- إذا `is_human_controlled = true` لهذا الرقم → لا يرد الـ AI
- إذا `is_human_controlled = false` → يرد الـ AI كالمعتاد

### 4. تعديل واجهة WhatsApp

**زر Takeover في الهيدر:**
- زر "Take Over" بلون أخضر في أعلى نافذة المحادثة
- عند الضغط: يتحول لـ "Release to AI" باللون الأزرق
- مؤشر واضح يظهر أن المحادثة في وضع Human Control

**تمييز نوع الرسائل في الواجهة:**
- رسائل AI: تظهر باللون الأبيض (كما هي)
- رسائل الموظف البشري: تظهر بظل أخضر خفيف مع أيقونة صغيرة 👤

**إيقاف مؤشر الكتابة (Typing Indicator):**
- عند تفعيل Human Mode، لا يظهر مؤشر الكتابة الخاص بالـ AI

### 5. تعديل `useWhatsAppChat.ts`
- إضافة state: `isHumanControlled`
- إضافة function: `takeOver()` - تفعل Human Mode وتحديث Supabase
- إضافة function: `releaseToAI()` - تعطل Human Mode
- تعديل `sendMessage()`: في Human Mode يستدعي `whatsapp-send-message` مباشرة، في AI Mode يستدعي `whatsapp-web-chat` كالمعتاد

### 6. سر جديد مطلوب: `WHATSAPP_ACCESS_TOKEN`
تحتاج إضافة الـ Access Token من n8n credentials "2S WhatsApp account" كـ Secret في Supabase.

---

## الملفات المتأثرة

| الملف | نوع التغيير |
|-------|-------------|
| `supabase/migrations/` | إضافة عمود `is_human_controlled` و`human_reply` لجدول Chat History |
| `supabase/functions/whatsapp-send-message/index.ts` | Edge Function جديدة |
| `src/hooks/useWhatsAppChat.ts` | إضافة Human Takeover logic |
| `src/components/whatsapp/WhatsAppChatPanel.tsx` | زر Takeover + تمييز أنواع الرسائل |
| `src/components/whatsapp/WhatsAppMessage.tsx` | مؤشر بصري للرسائل البشرية |

---

## ملاحظة مهمة قبل التنفيذ
تحتاج إضافة `WHATSAPP_ACCESS_TOKEN` كـ Secret في Supabase. هذا الـ Token موجود في n8n:
- اذهب لـ n8n → Credentials → "2S WhatsApp account" → انسخ الـ Access Token

بعد موافقتك على الخطة، سأطلب منك الـ Token قبل إنشاء الـ Edge Function.
