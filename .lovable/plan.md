

# اضافة دعم عمود Media في واجهة WhatsApp

## الوضع الحالي
جدول `Chat History` يحتوي على عمود `Media` (نوع jsonb) يخزن روابط الوسائط (صور، ملفات) المرسلة في المحادثات. لكن الكود الحالي يتجاهل هذا العمود تماما ولا يعرض اي وسائط.

## البيانات في عمود Media
- يحتوي على روابط مباشرة (مثل روابط Google Drive)
- بعض السجلات تحتوي على `null` (بدون وسائط)
- بعضها يحتوي على نص رابط مباشر

## التغييرات المطلوبة

### 1. تحديث نوع الرسالة (`useWhatsAppChat.ts`)
- اضافة حقل `mediaUrl` اختياري في واجهة `WhatsAppMessage`
- عند تحميل السجلات من الجدول، قراءة عمود `Media` وتمريره مع كل رسالة

### 2. تحديث مكون الرسالة (`WhatsAppMessage.tsx`)
- اضافة خاصية `mediaUrl` اختيارية
- عرض الصورة/الرابط فوق نص الرسالة اذا كان `mediaUrl` موجودا
- التصميم يتبع نمط WhatsApp (صورة بزوايا مستديرة داخل فقاعة الرسالة)

### 3. تحديث لوحة المحادثة (`WhatsAppChatPanel.tsx`)
- تمرير `mediaUrl` الى مكون `WhatsAppMessage`

## التفاصيل التقنية

### تحديث واجهة WhatsAppMessage
```text
interface WhatsAppMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  mediaUrl?: string;  // جديد
}
```

### قراءة Media من الجدول
عند تحميل السجلات، يتم قراءة `chat['Media']` وتمريره كـ `mediaUrl`. القيمة قد تكون:
- `null` -- بدون وسائط
- نص رابط مباشر (string)
- كائن JSON

### عرض الوسائط في WhatsAppMessage
- اذا كان الرابط صورة: عرضها كـ `<img>` قابلة للنقر
- اذا كان رابط عادي: عرضه كرابط قابل للنقر
- التصميم داخل فقاعة الرسالة بنمط WhatsApp

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/hooks/useWhatsAppChat.ts` | اضافة `mediaUrl` للواجهة وقراءة عمود `Media` |
| `src/components/whatsapp/WhatsAppMessage.tsx` | عرض الوسائط (صور/روابط) |
| `src/components/whatsapp/WhatsAppChatPanel.tsx` | تمرير `mediaUrl` للمكون |

