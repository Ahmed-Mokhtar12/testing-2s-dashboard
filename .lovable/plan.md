
# خطة شاملة: تمكين سيرا من قراءة وفهم جميع جداول Supabase بدقة تامة

## تشخيص المشكلة الحالية

بعد فحص الكود وقاعدة البيانات، اكتشفت عدة مشاكل جوهرية تمنع سيرا من الوصول للبيانات الحقيقية:

### المشكلة الأولى — الأكثر خطورة: اسم جدول المراجعات خاطئ
- الكود يستعلم من: `'Hotel Reviews'` — **هذا الجدول لا يوجد**
- الجدول الحقيقي اسمه: `reviews` — يحتوي على **7,655 مراجعة**
- النتيجة: سيرا لا ترى أي مراجعة على الإطلاق

### المشكلة الثانية: أعمدة جدول المراجعات خاطئة في الكود
الكود يبحث عن `review['Reviews Summary']` لكن الجدول الحقيقي يحتوي على هذه الأعمدة:
- `id`, `Date`, `Hotel Name`, `Source`, `Language`, `Score`, `URL`, `Author`, `Title`, `Text`, `Response Text`
- العمود الصحيح للنص هو `Text` وليس `Reviews Summary`

### المشكلة الثالثة: جدول SOPs لا يُقرأ إطلاقًا
- جدول `Sop` موجود في قاعدة البيانات (أعمدة: id, sop, title, department_name, section, file_id)
- لا يوجد أي كود يستعلم منه أو يرسل محتواه لسيرا

### المشكلة الرابعة: معلومات خاطئة في System Prompt
- يقول الـ prompt "~1,719 مراجعة" — الرقم الحقيقي هو **7,655 مراجعة**
- يقول "لا يوجد بيانات تشغيلية" لكن Chat History يحتوي على **27,119 سجل**

### المشكلة الخامسة: Info Summary غير موجود
- الكود يستعلم من جدول `Info Summary` لكنه غير موجود في قاعدة البيانات

### الحالة الحقيقية لقاعدة البيانات

| الجدول | السجلات | الحالة في الكود |
|---|---|---|
| `reviews` | 7,655 | ❌ يُقرأ باسم خاطئ `Hotel Reviews` |
| `Chat History` | 27,119 | ⚠️ يُقرأ لكن بحد 20 فقط |
| `Conducted Training` | 9 | ✅ يُقرأ بشكل صحيح |
| `LongTermMemory` | 5 | ✅ يُقرأ بشكل صحيح |
| `Sop` | 0 (فارغ حاليًا) | ❌ لا يُقرأ إطلاقًا |
| `website_chats` | 94 | ✅ يُقرأ لمحادثات الجلسة |
| `N8N_2S` | يحتوي بيانات | ✅ يُقرأ |
| `uploaded_documents` | 0 | ✅ يُقرأ |
| `Info Summary` | غير موجود | ❌ استعلام لجدول وهمي |
| `conducted_training` (lowercase) | بيانات | ❌ لا يُقرأ |

---

## الحل الشامل — التعديلات المطلوبة

### 1. إصلاح `index.ts` — تصحيح أسماء الجداول والأعمدة

**الملف:** `supabase/functions/chat-with-data/index.ts`

تغيير استعلامات `Promise.allSettled` من:
```ts
supabase.from('Hotel Reviews').select('*')...
supabase.from('Info Summary').select('*')...
```
إلى:
```ts
supabase.from('reviews').select('*').order('Date', { ascending: false }).limit(200),
supabase.from('Sop').select('*').limit(50),
```
وإضافة استعلام `Sop` كمصدر بيانات جديد.

### 2. إصلاح `enhanced-data-service.ts` — تصحيح اسم الجدول

**الملف:** `supabase/functions/chat-with-data/enhanced-data-service.ts`

تغيير:
```ts
this.supabase.from('Hotel Reviews').select('*')...
this.supabase.from('Info Summary').select('*')...
```
إلى:
```ts
this.supabase.from('reviews').select('*').order('Date', { ascending: false })
this.supabase.from('Sop').select('*').limit(50)
```

### 3. إصلاح `enhanced-context-builder.ts` — الأعمدة الصحيحة لجدول `reviews`

**الملف:** `supabase/functions/chat-with-data/enhanced-context-builder.ts`

تغيير الأعمدة المستخدمة في بناء السياق:
```ts
// قديم (خاطئ)
review['Reviews Summary']
// جديد (صحيح)
review['Text']
```

### 4. إصلاح `context-section-builder.ts` — إضافة قسم SOPs + تصحيح الأعمدة

**الملف:** `supabase/functions/chat-with-data/context-section-builder.ts`

- تصحيح مرجع `review['Reviews Summary']` إلى `review['Text']`
- إضافة دالة `buildSopSection()` جديدة تعرض بيانات جدول `Sop`
- تحديث `buildOtherDataSections()` لتشمل SOPs

### 5. تحديث `system-prompt-builder.ts` — تصحيح المعلومات

**الملف:** `supabase/functions/chat-with-data/system-prompt-builder.ts`

تحديث الـ System Prompt ليعكس الواقع الحقيقي:
```
- AVAILABLE: Guest reviews (7,655 reviews, Nov 2024 - Feb 2026)
- AVAILABLE: WhatsApp Chat History (27,119 messages)
- AVAILABLE: Staff Training Records (9 records)
- AVAILABLE: SOPs and Procedures (Sop table)
- AVAILABLE: Long-term conversation memory
- AVAILABLE: Uploaded documents (via N8N_2S)
- Sources: Google Maps, Booking.com, TripAdvisor, Agoda, Expedia, TrustYou, etc.
- Average Score: 4.46/5
```

### 6. إضافة معرفة شاملة بهيكل البيانات في System Prompt

إضافة قسم جديد في الـ prompt يصف بدقة هيكل كل جدول وطبيعة بياناته:

```
DATABASE SCHEMA KNOWLEDGE:
- reviews: Date, Hotel Name, Source, Language, Score(0-5), Author, Title, Text, Response Text
- Chat History: Sender Number, Sender Message, Ai Reply, Name, is_human_controlled
- Conducted Training: Summary of the training, created_at
- Sop: title, department_name, section, sop (full content)
- LongTermMemory: sender, recipient, message
- website_chats: user_message, ai_response, session_id
```

---

## ترتيب التنفيذ

1. تصحيح `index.ts` — إصلاح أسماء الجداول (أعلى أولوية)
2. تصحيح `enhanced-data-service.ts` — نفس الإصلاح في الخدمة
3. تصحيح `enhanced-context-builder.ts` — استخدام الأعمدة الصحيحة
4. تحديث `context-section-builder.ts` — إضافة SOPs وتصحيح الأعمدة
5. تحديث `system-prompt-builder.ts` — معلومات دقيقة وهيكل البيانات
6. نشر الـ Edge Function

## النتيجة المتوقعة

بعد هذه التعديلات، ستتمكن سيرا من:
- قراءة **7,655 مراجعة** حقيقية بدلًا من صفر
- الوصول لـ **27,119 رسالة** من Chat History
- قراءة محتوى **SOPs** وإجراءات الفندق
- فهم أعمدة كل جدول وطبيعة بياناته بدقة
- تقديم تحليلات دقيقة بأرقام حقيقية
