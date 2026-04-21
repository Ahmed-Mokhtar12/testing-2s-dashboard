

## خطة: منع صفوف Release marker من التأثير على ترتيب الـ Sidebar

### السبب
بعد تنفيذ Auto-Release، يُدرَج صف "marker" في `Chat History` يحوي فقط `released_to_ai_at` (بدون أي محتوى نصّي). الـ Realtime في `WhatsAppChat.tsx` يلتقط أي INSERT ويرفع المحادثة لأعلى القائمة بـ timestamp جديد، فتظهر محادثات قديمة (مثل تلك من 18 Feb) كأنها وصلت الآن في 13:33.

### الإصلاح (تغيير صغير وآمن)

#### تعديل واحد فقط في `src/components/whatsapp/WhatsAppChat.tsx`
في معالج Realtime INSERT (السطور 86-117)، نضيف حارس في البداية:

```ts
// Skip system marker rows (release/auto-release) — they have no message content
const hasContent =
  chat['Sender Message'] || chat['Ai Reply'] || chat['human_reply'];
if (!hasContent) return;
```

هذا يضمن:
- صف marker الذي لا يحوي رسالة فعلية يُتجاهل تماماً في الـ Sidebar.
- لا يُغيّر ترتيب القائمة، ولا الـ timestamp، ولا الـ lastMessage.
- لا يكسر ظهور الرسائل الحقيقية لأنها دائماً تحمل أحد الحقول الثلاثة.

#### تنظيف بصري للبيانات الموجودة (اختياري داخل نفس الجلسة)
الصفحة سترجع لطبيعتها فور تحديثها (refresh)، لأن الـ initial loader يبني الـ preview من أول صف يحوي محتوى فعلي (السطور 58-68 الموجودة أصلاً تتحقق من `chat['Ai Reply'] || chat['Sender Message']`).

> ملاحظة: لا يوجد تأثير من marker rows على الـ initial load لأن الكود الحالي يبني `lastMessage` من الحقول النصّية فقط، لكنه لا يتجاهل الصف نفسه عند تحديد `created_at` للـ timestamp. لتأمين كامل، يمكن أيضاً تصفية مبكرة في الـ initial load:

```ts
data?.forEach((chat) => {
  const num = chat['Sender Number'];
  const hasContent = chat['Ai Reply'] || chat['Sender Message'] || chat['human_reply'];
  if (num && hasContent && !chatMap.has(num)) {
    chatMap.set(num, { ... });
  }
});
```

### ما لن يتغيّر
- منطق Auto-Release (الـ Edge Function والـ cron) — صحيح ويعمل (السجلات تؤكد إفراج 3 محادثات بنجاح).
- منطق Release اليدوي.
- منطق `useWhatsAppChat` (محادثة واحدة) — أصلاً يتحقق من وجود حقول نصّية قبل عرض الرسالة، فلا داعي لتعديله.
- بنية الـ UI أو الـ Header.

### الملف المتأثر

| الملف | التغيير |
|-------|---------|
| `src/components/whatsapp/WhatsAppChat.tsx` | إضافة حارس `hasContent` في معالج Realtime INSERT + في الـ initial load loop لتجاهل marker rows |

### النتيجة
- بعد التطبيق، Auto-Release سيستمر في تحرير المحادثات الخاملة بصمت كل دقيقة دون رفع أي محادثة قديمة لأعلى الـ Sidebar.
- المحادثات التي ترى تواريخها قديمة الآن (905340540810, 971501234567, 12532797073) ستعود لمكانها الصحيح فور التحديث.
- Release اليدوي أيضاً لن يُحدث أي قفزة بصرية مزعجة.

