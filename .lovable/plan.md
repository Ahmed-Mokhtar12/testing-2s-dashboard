
## خطة الإصلاح: اعتماد توقيت دبي الحقيقي في الفلاتر والرسوم والوقت المعروض

### المشكلة الحالية
اللوحة لا تعتمد "يوم دبي" فعليًا بشكل موحّد. يوجد 3 أسباب ظاهرة في الكود:
1. `DateRangeContext` يحسب `today / yesterday / last7 / last30` حسب توقيت جهاز المتصفح، وليس `Asia/Dubai`.
2. بعض الاستعلامات على أعمدة `date` تستخدم `toISOString().slice(0, 10)`، وهذا يسبب انزلاق يوم عند التحويل إلى UTC.
3. بعض الرسوم اليومية تبني التاريخ من `new Date('YYYY-MM-DD')`، وهذا قد يحرّك اليوم عند العرض أو التجميع.

## ما سيتم بناؤه

### 1) توحيد أدوات توقيت دبي
في `src/utils/timezone.ts` سيتم توسيع utilities الحالية لتصبح المصدر الوحيد للمنطق الزمني:
- دالة ترجع "الآن" في دبي.
- دوال لحساب بداية ونهاية اليوم في دبي.
- دالة ترجع مفتاح تاريخ دبي بصيغة `yyyy-MM-dd`.
- دالة تحوّل يوم دبي إلى `fromISO / toISO` صحيحة لاستخدامها مع أعمدة `timestamp with time zone`.
- دالة آمنة للتعامل مع أعمدة `date` بدون انزلاق timezone.

النتيجة: كل جزء في التطبيق سيستخدم نفس مرجع الوقت بدل الاعتماد على توقيت الجهاز.

### 2) إصلاح `DateRangeContext`
في `src/contexts/DateRangeContext.tsx` سيتم تغيير المنطق بحيث:
- `yesterday`, `last7`, `last30` تُحسب نسبةً إلى "تاريخ دبي الحالي" وليس تاريخ المتصفح.
- يتم توفير قيمتين مختلفتين للاستعلام:
  - `fromDateKey / toDateKey` لأعمدة `date` مثل `reviews.Date`, `welcome_message_success_log.sent_date`, `report_date`
  - `fromISO / toISO` لأعمدة `timestamptz` مثل `created_at`
- يبقى الـ label المعروض صحيحًا حسب دبي.

هذا هو الجزء الأساسي الذي سيجعل يوم 19 يظهر فعلاً عندما تكون الآن 20 في دبي.

### 3) إصلاح الاستعلامات على أعمدة `date`
سيتم تعديل الهوكس التالية لتستخدم `fromDateKey / toDateKey` بدل `toISOString().slice(0, 10)`:
- `src/hooks/insights/useReviewsInsights.ts`
- `src/hooks/insights/useWelcomeInsights.ts`
- `src/hooks/insights/useCompetitorsInsights.ts`

النتيجة:
- جدول المراجعات سيقرأ 19 أبريل بشكل صحيح عندما يكون preset = Yesterday في يوم 20 أبريل بدبي.
- نفس الإصلاح ينطبق على welcome logs و competitor rates لأن لديهم نفس نمط الأعمدة من نوع `date`.

### 4) تثبيت أعمدة `timestamp` على حدود يوم دبي
الهوكس التي تستعلم بـ `created_at` أو `sent_at` ستستمر باستخدام ISO، لكن سيتم توليد هذه الـ ISO من حدود يوم دبي الفعلية:
- `src/hooks/insights/useWhatsAppInsights.ts`
- `src/hooks/insights/useEmailInsights.ts`
- `src/hooks/insights/useSocialInsights.ts`
- `src/hooks/insights/useInfoEmailInsights.ts`

النتيجة:
- "Yesterday" و "Last 7 days" و "Last 30 days" ستطابق يوم دبي حتى لو المستخدم يفتح اللوحة من بلد/توقيت مختلف.

### 5) إصلاح الرسوم اليومية لمنع تحريك اليوم
في `src/hooks/insights/utils.ts` سيتم إضافة مسار آمن للبيانات ذات التاريخ-only:
- إما helper جديد مثل `dailySeriesByDateKey`
- أو تعديل `dailySeries` ليدعم accessor يرجع مفتاح تاريخ مباشر بدل `Date`

ثم سيتم تطبيقه على:
- `useReviewsInsights`
- `useWelcomeInsights`
- `useCompetitorsInsights`

النتيجة:
- مراجعات 2026-04-19 ستظهر في يوم 19 داخل الرسم، وليس 18 أو 20 بسبب parsing المتصفح.

### 6) مواءمة أي عرض وقت ظاهر مع دبي
أي وقت معروض للمستخدم سيستمر باستخدام `src/utils/timezone.ts` كمصدر واحد.
هذا يشمل الحفاظ على عرض chat timestamps بتوقيت دبي، والتأكد أن أي label أو subtitle زمني في الداشبورد يعتمد نفس المرجع.

### 7) مواءمة منطق الـ Edge Function مع نفس التوقيت
في `supabase/functions/chat-with-data/timezone-utils.ts` سيتم استبدال المنطق اليدوي الذي يضيف `+4 ساعات` بمنطق timezone فعلي باستخدام `Asia/Dubai` بشكل صريح.
هذا يمنع اختلافًا بين:
- وقت الداشبورد في الواجهة
- وقت/سياق Sera في الـ Edge Functions

## التحقق بعد التنفيذ
سيتم التحقق من هذه الحالات:
1. في `/dashboard/reviews` عند اختيار `Yesterday` يوم 20 أبريل، تظهر مراجعات 19 أبريل.
2. `Last 7 days` و `Last 30 days` تشمل الأيام الصحيحة حسب دبي.
3. الـ Custom range يعرض نفس الأيام التي يختارها المستخدم بدون انزلاق.
4. الرسم اليومي للمراجعات يضع بيانات 19 في خانة 19.
5. أوقات الـ chat تبقى معروضة كتوقيت دبي.
6. بقية الأقسام التي تعتمد `created_at` لا تتأثر سلبًا وتظل متوافقة مع يوم دبي.

## تفاصيل تقنية
- المشكلة ليست في البيانات نفسها؛ الصورة تؤكد أن الصفوف موجودة في `public.reviews`.
- السبب الرئيسي هو الخلط بين:
  - `date` columns
  - `timestamp with time zone` columns
  - وتوليد الفترات الزمنية من توقيت جهاز المستخدم
- لن أحتاج لتعديل جداول Supabase أو إنشاء migration لهذه الخطوة؛ الإصلاح هنا في منطق التطبيق وطريقة تكوين الاستعلامات.
