

## خطة: إصلاح اختفاء السايدبار وعدم وضوح زر إرجاع التحكم للـ AI

### المشكلة المُلاحظة
عند الضغط على زر "Take Over" داخل صفحة `/whatsapp`:
1. **قائمة المحادثات اليسرى تختفي** أو تبدو كأنها اختفت (ربما بسبب re-render أو layout shift).
2. **زر "Release to AI" غير ظاهر بوضوح** — موجود نظرياً في الهيدر لكنه مزدحم بجانب أيقونات Search و MoreVertical، ويسهل تفويته.
3. لا يوجد زر بديل واضح داخل البانر البرتقالي العلوي للعودة لوضع AI.

### السبب الجذري
- الـ sidebar لا تختفي فعلياً من الـ DOM، لكن الزر `Take Over` بنفس مكان `Release to AI` بدون أي تمييز بصري قوي، ومع الأيقونات المجاورة يضيع.
- البانر البرتقالي (Human Agent Mode) معلوماتي ف

<lov-plan>

## خطة: إصلاح اختفاء السايدبار وعدم وضوح زر إرجاع التحكم للـ AI

### المشكلة المُلاحظة
عند الضغط على زر "Take Over" داخل صفحة `/whatsapp`:
1. **قائمة المحادثات اليسرى تختفي** — ربما بسبب re-render كامل للمكون عند تغيير حالة `isHumanControlled`.
2. **زر "Release to AI" غير ظاهر بوضوح** — موجود في الهيدر لكنه صغير ومزدحم بجانب أيقونات Search و MoreVertical.
3. لا يوجد زر بديل داخل البانر البرتقالي العلوي للعودة لوضع AI.

### التغييرات المطلوبة

#### 1. إصلاح اختفاء السايدبار (`src/components/whatsapp/WhatsAppChat.tsx`)
- التحقق من أن حالة `isHumanControlled` لا تتسبب في unmount/remount للـ sidebar.
- نقل `isHumanControlled` و `isTogglingControl` و `toggleHumanControl` ليكونوا متاحين على مستوى `WhatsAppChat` دون التأثير على عرض الـ sidebar.
- التأكد من أن الـ sidebar تبقى ظاهرة بشكل ثابت بغض النظر عن وضع التحكم.

#### 2. تحسين زر "Release to AI" في هيدر المحادثة (`src/components/whatsapp/WhatsAppChatPanel.tsx`)
- تكبير الزر وجعله أبرز بصرياً عندما يكون الوضع Human:
  - لون خلفية برتقالي solid بدلاً من شفاف خفيف.
  - نص أكبر وأيقونة أوضح.
  - إضافة animation خفيف (pulse) لجذب الانتباه.

#### 3. إضافة زر "Release to AI" داخل البانر البرتقالي (`src/components/whatsapp/WhatsAppChatPanel.tsx`)
- تعديل بانر "Human Agent Mode" الموجود حالياً ليحتوي على زر فعّال:

```text
┌──────────────────────────────────────────────────────┐
│ 👤 Human Agent Mode: AI paused.    [🤖 Release to AI] │
│    Messages sent directly to customer.               │
└──────────────────────────────────────────────────────┘
```

- الزر داخل البانر بلون أخضر (#128C7E) مع أيقونة Bot، يستدعي نفس `onToggleHumanControl`.

### الملفات المتأثرة
| الملف | التغيير |
|-------|---------|
| `src/components/whatsapp/WhatsAppChatPanel.tsx` | تكبير زر Release to AI + إضافة زر في البانر البرتقالي |
| `src/components/whatsapp/WhatsAppChat.tsx` | التأكد من استقرار الـ sidebar عند تغيير وضع التحكم |

### النتيجة المتوقعة
- السايدبار اليسرى (قائمة المحادثات) تبقى ظاهرة دائماً.
- زران واضحان للعودة لوضع AI: واحد في الهيدر وواحد في البانر البرتقالي.
- تجربة مستخدم سلسة عند التبديل بين Human و AI mode.

