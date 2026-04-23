

## تكبير شعار Two Seasons وتوضيح زر Back to Dashboard

### التغييرات المطلوبة في `src/components/whatsapp/WhatsAppNavRail.tsx`

#### 1) تكبير دائرة شعار Two Seasons
- زيادة حجم الحاوية من `w-7 h-7` إلى `w-10 h-10` لتملأ معظم زر الـ rail (الذي حجمه `w-12 h-12`).
- إزالة `bg-white` و `ring-1 ring-gray-200` لأن الشعار نفسه واضح ولا يحتاج إطار.
- استخدام `object-contain` بدل `object-cover` حتى يظهر الشعار كاملاً بدون قص.
- النتيجة: شعار أكبر وأوضح بكثير داخل دائرة نظيفة.

#### 2) تحسين زر Back to Dashboard ليكون مفهوماً للمستخدم الجديد
بدل أيقونة `LayoutDashboard` الغامضة، نستبدلها بحلّ مرئي أوضح:

- **استخدام أيقونة `Home` من lucide-react** (أكثر شيوعاً وفهماً للرجوع للصفحة الرئيسية).
- **إضافة label نصي صغير "Dashboard"** أسفل الأيقونة داخل نفس الزر.
- **تمييز الزر بصرياً**: خلفية خضراء فاتحة دائمة `bg-[#E7FCE8]` ولون نص `text-[#128C7E]` (نفس ألوان WhatsApp البراند) ليبرز كزر إجراء مهم.
- **توسيع الزر** من `h-12` إلى `h-14` ليستوعب الأيقونة + النص.
- **الإبقاء على `title="Back to Dashboard"`** للـ tooltip عند hover.

```text
┌──────────┐
│   🏠     │   ← Home icon
│Dashboard │   ← نص صغير
└──────────┘
```

#### 3) ترتيب نهائي للعمود السفلي (بدون تغيير منطقي)
```text
Back to Dashboard (الجديد بشكله الواضح)
─────────────  (separator موجود)
Settings
Two Seasons logo (أكبر وأوضح)
```

### تفاصيل تقنية
- ملف واحد فقط: `src/components/whatsapp/WhatsAppNavRail.tsx`.
- استيراد `Home` بدل `LayoutDashboard` من `lucide-react`.
- لا تغييرات على الـ routing أو على باقي مكونات `/whatsapp`.
- لا تغييرات على n8n أو Edge Functions أو قاعدة البيانات.

### اختبار سريع بعد التطبيق
1. افتح `/whatsapp` وتأكّد أن شعار Two Seasons أكبر وأوضح في أسفل العمود الأيمن.
2. تأكّد أن زر Back to Dashboard يظهر بأيقونة Home + كلمة "Dashboard" بخلفية خضراء فاتحة.
3. اضغط على الزر وتأكد أنه ينقلك إلى `/dashboard`.

