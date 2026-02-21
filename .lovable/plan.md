

# نظام سحب الأسعار الديناميكي (Dynamic Rate Retrieval)

## الهدف
عندما تسأل سيرا "ما هي أسعار الغرف من الغد لمدة 4 ليالي؟"، يقوم النظام بـ:
1. سحب أسعار كل ليلة بشكل منفصل من موقع الفندق الرسمي عبر Firecrawl
2. عرض سعر كل ليلة على حدة (ليلة 1: XX درهم، ليلة 2: YY درهم...)
3. لاحقاً: سحب أسعار المنافسين بنفس الطريقة للمقارنة

## كيف سيعمل النظام

عندما تسأل عن الأسعار:
1. سيرا تحلل السؤال وتستخرج: تاريخ الوصول، عدد الليالي
2. تستدعي Firecrawl API لسحب صفحة الحجز مع التواريخ المطلوبة
3. تستخرج أسعار كل ليلة من المحتوى المسحوب
4. تعرض النتائج بشكل مرتب

## مثال على النتيجة المتوقعة

```text
اسعار الغرف من 22 فبراير لمدة 3 ليالي:

Standard Room:
  - ليلة 1 (22 فبراير): 350 AED
  - ليلة 2 (23 فبراير): 350 AED
  - ليلة 3 (24 فبراير): 420 AED (عطلة نهاية الأسبوع)
  الإجمالي: 1,120 AED

Deluxe Room:
  - ليلة 1 (22 فبراير): 500 AED
  ...
```

## الخطوات التقنية

### 1. إنشاء Edge Function: `firecrawl-scrape`
- وظيفة عامة تستدعي Firecrawl API لسحب محتوى أي صفحة
- تدعم `waitFor` للانتظار حتى يتم تحميل المحتوى الديناميكي (JavaScript)
- تدعم استخراج البيانات بتنسيق markdown أو JSON منظم

### 2. تحديث `web-scraper.ts`
- إضافة method جديد: `scrapeHotelRates(checkIn, checkOut)`
- يبني URL صفحة الحجز مع التواريخ المطلوبة
- يستدعي Firecrawl مع `waitFor: 5000` لانتظار تحميل الأسعار
- يحلل المحتوى ويستخرج أسعار كل نوع غرفة لكل ليلة

### 3. تحديث `function-call-handler.ts`
- إضافة أداة جديدة `get_hotel_rates` مع parameters:
  - `check_in_date` (تاريخ الوصول)
  - `nights` (عدد الليالي)
  - `hotel_url` (اختياري - للمنافسين لاحقاً)

### 4. تحديث `search-service.ts`
- إضافة function جديد `getHotelRates()` ينفذ السحب الفعلي
- يحسب تاريخ المغادرة من عدد الليالي
- يستدعي Firecrawl ويعالج النتائج
- يرجع الأسعار بتنسيق منظم لكل ليلة

### 5. تحديث `supabase/config.toml`
- تسجيل Edge Functions الجديدة:
  - `firecrawl-scrape`

### 6. تحديث `index.ts` (chat-with-data)
- إضافة كشف ذكي لأسئلة الأسعار (rate/price/tariff/سعر)
- عند كشف سؤال عن الأسعار، يتم تفعيل أداة `get_hotel_rates` تلقائياً

## الملفات المتأثرة

| الملف | العملية |
|-------|---------|
| `supabase/functions/firecrawl-scrape/index.ts` | جديد |
| `supabase/functions/chat-with-data/web-scraper.ts` | تحديث |
| `supabase/functions/chat-with-data/function-call-handler.ts` | تحديث |
| `supabase/functions/chat-with-data/search-service.ts` | تحديث |
| `supabase/functions/chat-with-data/index.ts` | تحديث |
| `supabase/config.toml` | تحديث |

## ملاحظات مهمة
- صفحة الحجز (`/book/accommodations`) تعتمد على JavaScript بالكامل، لذلك Firecrawl مع `waitFor` ضروري لتحميل الأسعار
- سيتم تجربة السحب أولاً من موقع الفندق الرسمي كاختبار
- بعد نجاح الاختبار، يمكن إضافة URLs المنافسين بنفس الآلية
- الأسعار تتغير حسب التاريخ، لذلك كل طلب يسحب بيانات حية من الموقع

