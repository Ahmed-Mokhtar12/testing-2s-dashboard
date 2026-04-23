

## تفعيل زر `+` لإرفاق ومشاركة المستندات في شريط المحادثة

سأجعل زر الإضافة `+` على يسار حقل الإدخال في WhatsApp يعمل تماماً كما في WhatsApp Web الحقيقي — فتح قائمة منبثقة بخيارات إرفاق (مستند، صورة/فيديو، كاميرا) مع إمكانية اختيار الملفات وإرسالها داخل المحادثة.

### ما سيحدث للمستخدم
- الضغط على زر `+` يفتح قائمة منبثقة فوقه تحتوي على:
  - 📄 **Document** — يفتح متصفح الملفات لاختيار PDF/Word/Excel/PowerPoint/TXT.
  - 🖼️ **Photos & videos** — يفتح متصفح الملفات لاختيار صور أو فيديو.
  - 📷 **Camera** — معطّل مع تلميح "Coming soon" (الكاميرا تتطلب صلاحيات إضافية، خارج النطاق).
- بعد اختيار الملف:
  - تظهر **بطاقة معاينة** فوق حقل الإدخال (اسم الملف + حجمه + أيقونة نوعه + زر × لإلغاء الإرفاق).
  - يمكن للمستخدم كتابة تعليق نصي اختياري مع المرفق.
  - الضغط على زر الإرسال يُرسل الرسالة + المرفق.
- بعد الإرسال:
  - تظهر **فقاعة رسالة** تحتوي على بطاقة المرفق (أيقونة + اسم الملف + الحجم + زر تنزيل) — مطابقة لشكل WhatsApp.
  - الصور تُعرض كمعاينة مصغّرة قابلة للنقر.
- أيقونة `+` تتلوّن بأخضر `#128C7E` عند فتح القائمة.

### حدود الملفات
- الحد الأقصى للحجم: **16 MB** لكل ملف (نفس حد WhatsApp).
- الأنواع المسموحة:
  - **مستندات**: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV.
  - **صور/فيديو**: JPG, PNG, GIF, WEBP, MP4, MOV.
- التحقّق من النوع والحجم قبل الإرفاق، مع رسالة `toast` خطأ واضحة عند التجاوز.

### التخزين
استخدام **Supabase Storage** (Lovable Cloud) — bucket عام جديد باسم `whatsapp-attachments`:
- مسار التخزين: `whatsapp-attachments/{senderNumber}/{timestamp}_{filename}`.
- الملفات تُرفع أولاً، ثم يُرسل الرابط العام (`publicUrl`) ضمن payload الرسالة إلى n8n webhook.
- سياسات RLS: قراءة عامة (للعرض في الفقاعات)، كتابة مفتوحة عبر الـ anon key (الواجهة فقط).

### تكامل n8n
سيُضاف إلى payload الـ `whatsapp-web-chat` Edge Function حقول جديدة:
```json
{
  "message": "النص الاختياري",
  "senderNumber": "...",
  "attachment": {
    "url": "https://.../public/whatsapp-attachments/...",
    "filename": "report.pdf",
    "mimeType": "application/pdf",
    "size": 1234567,
    "kind": "document" | "image" | "video"
  }
}
```
يبقى الحقل `attachment` اختيارياً (null عند عدم وجود مرفق) — لن يكسر التدفّق الحالي.

### عرض المرفقات في فقاعة الرسالة
في `WhatsAppMessage.tsx`:
- إذا كانت الرسالة تحوي `attachment.kind === "image"` → عرض `<img>` مصغّرة مع ضغطة لفتحها.
- إذا كانت `kind === "document"` → بطاقة بيضاء بأيقونة نوع الملف (PDF أحمر، Word أزرق، Excel أخضر) + اسم الملف + الحجم + زر تنزيل.
- إذا كانت `kind === "video"` → عنصر `<video controls>` مصغّر.

### الملفات المعدّلة / المُنشأة

**جديد**:
1. `src/components/whatsapp/AttachmentMenu.tsx` — القائمة المنبثقة لزر `+`.
2. `src/components/whatsapp/AttachmentPreview.tsx` — بطاقة المعاينة قبل الإرسال.
3. `src/components/whatsapp/AttachmentBubble.tsx` — عرض المرفق داخل فقاعة الرسالة.
4. `src/hooks/useWhatsAppAttachment.ts` — منطق الرفع لـ Supabase Storage + التحقّق.
5. **Migration SQL** — إنشاء bucket `whatsapp-attachments` + RLS policies.

**معدّل**:
6. `src/components/whatsapp/WhatsAppInput.tsx` — لفّ زر `+` بـ `Popover` يحتوي `AttachmentMenu`، إدارة state للمرفق المختار، عرض `AttachmentPreview` فوق الحقل، تمرير المرفق إلى `onSend`.
7. `src/components/whatsapp/WhatsAppMessage.tsx` — عرض `AttachmentBubble` عند وجود مرفق في الرسالة.
8. `src/hooks/useWhatsAppChat.ts` — تمديد دالة الإرسال لقبول مرفق + إدراجه في `Chat History` + إرساله ضمن payload.
9. `supabase/functions/whatsapp-web-chat/index.ts` — تمرير حقل `attachment` من الواجهة إلى webhook n8n.

### خارج النطاق
- لن أُفعّل الكاميرا (تتطلب `getUserMedia` وصلاحيات).
- لن أُضيف خيارات WhatsApp الأخرى (Sticker, Poll, Contact, Event) — يمكن في خطوات لاحقة.
- لن أُغيّر شكل/سلوك زر الإيموجي أو الميكروفون أو الإرسال.

