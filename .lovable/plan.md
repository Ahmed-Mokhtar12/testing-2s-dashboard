

## تحسين رسالة الخطأ عند محاولة المراسلة أثناء تحكّم AI

### المشكلة
في `/whatsapp`، حين يكون AI يتحكّم بالمحادثة (Take Over غير مفعّل) ويحاول الموظف إرسال رسالة للضيف، يظهر خطأ عام:
> "Sorry, there was an error processing your message. Please try again."

السبب: الحارس (Guard) في `useWhatsAppChat.ts` السطر 308 يرمي خطأ "Conversation is currently under human control..." لكن الـ catch block يعرض رسالة عامة بدل التعليمات الواضحة.

### الحل
تعديل واحد بسيط في ملف واحد فقط: `src/hooks/useWhatsAppChat.ts` (الأسطر 333-344).

**المنطق الجديد** في الـ catch block:
- إذا كان الخطأ بسبب الحارس (AI متحكّم والموظف حاول إرسال) → عرض رسالة إرشادية واضحة.
- إذا كان فشل في إرسال WhatsApp أثناء Human mode → نفس رسالة الفشل الحالية.
- إذا كان أي خطأ آخر → رسالة عامة.

**الرسالة الإرشادية المقترحة (إنجليزية + عربية)**:
> "⚠️ The AI is currently handling this conversation. Please click the **Take Over** button at the top to start replying to the guest manually."

### تفاصيل تقنية
- التحقّق من نوع الخطأ عبر `error.message?.includes('human control')` لمطابقة النص الذي يرميه الحارس في السطر 309.
- لا تغييرات على n8n workflows ولا على الـ Edge Functions ولا على قاعدة البيانات.
- لا تغييرات على مكونات الـ UI — الرسالة تظهر بنفس فقاعة رسالة النظام الحالية.

### نطاق التغيير
- ملف واحد: `src/hooks/useWhatsAppChat.ts`
- ~10 أسطر فقط داخل الـ catch block.

### اختبار سريع بعد التطبيق
1. تأكّد أن Take Over **غير مفعّل** (AI يتحكّم).
2. اكتب رسالة في الـ input واضغط إرسال.
3. تأكّد أن الرسالة الإرشادية الجديدة تظهر بدلاً من رسالة الخطأ القديمة.
4. فعّل Take Over، أرسل رسالة، تأكّد أنها تصل للضيف عادةً.

