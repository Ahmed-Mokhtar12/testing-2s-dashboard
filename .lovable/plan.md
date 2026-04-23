

## استبدال أيقونة "TS" في أعلى يسار محادثة WhatsApp بشعار Two Seasons

### الموقع المستهدف
الدائرة الذهبية المكتوب فيها "TS" في أعلى يسار نافذة المحادثة (header) في صفحة `/whatsapp`.

### الملف الذي سيتم تعديله
`src/components/whatsapp/WhatsAppHeader.tsx`

### التغييرات

#### 1) استيراد الشعار
إضافة:
```tsx
import twoSeasonsLogo from '@/assets/two-seasons-logo.png';
```

#### 2) استبدال الدائرة الذهبية بالشعار
الكود الحالي:
```tsx
<div className="w-10 h-10 bg-gradient-to-br from-[#C8A351] to-[#B8934A] rounded-full flex items-center justify-center flex-shrink-0">
  <span className="text-white font-bold text-sm">TS</span>
</div>
```

سيُستبدل بـ:
```tsx
<div className="w-10 h-10 rounded-full overflow-hidden bg-white flex items-center justify-center flex-shrink-0">
  <img
    src={twoSeasonsLogo}
    alt="Two Seasons Hotel Dubai"
    className="w-full h-full object-contain"
  />
</div>
```

### تفاصيل تقنية
- نفس الحجم `w-10 h-10` للحفاظ على تناسق الـ header.
- `rounded-full` + `overflow-hidden` لضمان شكل دائري نظيف.
- خلفية `bg-white` لإبراز ألوان الشعار.
- `object-contain` لعرض الشعار كاملاً بدون قص.
- ملف واحد فقط، بدون أي تغييرات على routing أو n8n أو قاعدة البيانات.

### اختبار سريع بعد التطبيق
افتح `/whatsapp` وتأكّد أن الدائرة الموجودة في أعلى يسار نافذة المحادثة (بجانب اسم "Two Seasons Hotel Dubai") أصبحت تعرض شعار Two Seasons بدلاً من "TS".

