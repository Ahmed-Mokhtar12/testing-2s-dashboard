

## خطة: إضافة زر WhatsApp في هيدر الداشبورد

### الموقع
داخل `src/layouts/DashboardShell.tsx` في الهيدر العلوي، بين قسم "Live data · Dubai (GMT+4)" وزر اختيار التاريخ "Yesterday".

### التصميم
- زر بنفس ارتفاع زر التاريخ (`h-9`) ليكون متطابقًا بصريًا.
- أيقونة WhatsApp فقط (بدون نص) — مربع بنفس الارتفاع.
- لون أخضر WhatsApp المميز `#25D366` مع hover أغمق `#20BD5A`.
- أيقونة بيضاء داخل الزر.
- tooltip عند المرور: "Open WhatsApp chat".
- يفتح صفحة `/whatsapp` عبر `react-router-dom Link`.

### التغييرات التقنية
ملف واحد فقط:

**`src/layouts/DashboardShell.tsx`**
- إضافة `import { Link } from 'react-router-dom'`.
- إضافة `import { MessageCircle } from 'lucide-react'` (أو استخدام نفس SVG المستخدم في `ChatHeader.tsx` للحفاظ على التطابق البصري مع الـ branding).
- داخل الـ `<header>`، تغليف العناصر الموجودة على اليمين في `<div className="flex items-center gap-2">` تحتوي على:
  1. زر WhatsApp الجديد (`Link` إلى `/whatsapp`) بـ classes:
     `h-9 w-9 rounded-md bg-[#25D366] hover:bg-[#20BD5A] flex items-center justify-center transition-colors shadow-sm`
  2. مكوّن `<DateRangePicker />` الحالي.

### التحقق بعد التنفيذ
- يظهر زر WhatsApp أخضر بحجم مساوٍ لزر "Yesterday".
- النقر عليه ينقل المستخدم إلى `/whatsapp`.
- التصميم لا يكسر باقي عناصر الهيدر على شاشات mobile/desktop.

