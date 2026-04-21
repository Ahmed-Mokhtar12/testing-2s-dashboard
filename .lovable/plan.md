

## خطة: زر Back + إزالة زر Release to AI المكرر

### المشكلة
في صفحة `/whatsapp` عند تفعيل Human takeover:
- يظهر زرّان لـ "Release to AI" (واحد في الهيدر وواحد في البانر البرتقالي) — تكرار غير ضروري.
- لا يوجد زر للرجوع إلى الداشبورد.

### التغييرات

#### 1) إضافة زر "Back" في هيدر المحادثة
- الملف: `src/components/whatsapp/WhatsAppChatPanel.tsx`
- إضافة زر `Back` في أقصى يسار الهيدر (قبل الأفاتار) بأيقونة `ArrowLeft` ونص `Back`.
- عند الضغط: التنقل إلى `/` باستخدام `useNavigate` من `react-router-dom`.
- تصميم بسيط ومتناسق مع باقي الهيدر (لون رمادي محايد، hover خفيف).

#### 2) إزالة زر Release to AI المكرر
- الملف: `src/components/whatsapp/WhatsAppChatPanel.tsx`
- **الإبقاء على**: الزر داخل البانر البرتقالي (أوضح وأقرب للسياق).
- **الإزالة**: زر "Take Over / Release to AI" من الهيدر.
- في وضع AI العادي: يبقى زر "Take Over" في الهيدر (لأن البانر لا يظهر إلا في وضع Human).
- في وضع Human: يختفي زر الهيدر، ويبقى فقط الزر داخل البانر البرتقالي.

### التخطيط الناتج للهيدر

```text
وضع AI:
[← Back] [Avatar] [Name / AI Responding]            [Take Over] [🔍] [⋮]

وضع Human:
[← Back] [Avatar] [Name / Human Active]                          [🔍] [⋮]
┌──────────────────────────────────────────────────────────────────────┐
│ 👤 Human Agent Mode: AI paused.                  [🤖 Release to AI] │
└──────────────────────────────────────────────────────────────────────┘
```

### الملفات المتأثرة
| الملف | التغيير |
|-------|---------|
| `src/components/whatsapp/WhatsAppChatPanel.tsx` | إضافة زر Back + إزالة Release to AI من الهيدر في وضع Human |

### النتيجة
- زر Back واضح يرجع للداشبورد.
- زر Release to AI واحد فقط (داخل البانر البرتقالي).
- زر Take Over يبقى في الهيدر فقط في وضع AI.

