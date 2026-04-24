

## Light/Dark Mode Toggle — مع استثناء صفحة WhatsApp

### الوضع الحالي
- التطبيق dark إجباري عبر `document.documentElement.classList.add('dark')` في `src/main.tsx`
- الـ light tokens في `src/index.css` نسخة مكررة من dark — لازم تتعاد كتابتها كـ light theme حقيقي
- مفيش theme switcher في الـ UI

### الحل

#### 1) `src/contexts/ThemeContext.tsx` (جديد)
- Provider بسيط بـ 3 خيارات: `light` / `dark` / `system`
- يحفظ في `localStorage` تحت `two-seasons-theme`
- يضيف/يشيل class `dark` على `<html>` تلقائياً
- يستمع لتغيرات `prefers-color-scheme` لما يكون `system`
- يصدّر hook `useTheme()`

#### 2) `src/main.tsx`
شيل `document.documentElement.classList.add('dark')` — الـ Provider هياخد المسؤولية.

#### 3) `src/App.tsx`
لفّ التطبيق بـ `<ThemeProvider>` (قبل `AuthProvider`).

#### 4) `src/index.css` — إعادة كتابة `:root` كـ light theme حقيقي
- خلفية فاتحة ناعمة (off-white بلمسة بنفسجية خفيفة) تحافظ على روح "neon-soft"
- نفس brand colors (purple/cyan/magenta) لكن بـ contrast مظبوط على فاتح
- gradients/shadows أخف وأنعم
- sidebar فاتح بـ borders واضحة
- الـ `.dark` tokens تفضل زي ما هي

#### 5) `src/components/UserMenu.tsx`
إضافة قسم "Theme" في الـ DropdownMenu بـ 3 عناصر (Light / Dark / System) بأيقونات `Sun` / `Moon` / `Monitor` من lucide-react، والمختار يبان بعلامة ✓.

#### 6) `src/components/ui/sonner.tsx`
استبدال `next-themes` (مش مفعّل) بالـ `useTheme` بتاع الـ context الجديد.

---

### استثناء صفحة WhatsApp (مهم)
صفحة `/whatsapp` و `/whatsapp-inbox` و كل components تحت `src/components/whatsapp/*` تستخدم ألوان WhatsApp الرسمية الثابتة (`#128C7E`, `#E9EDEF`, إلخ) — **مش هتتأثر بالـ theme** لأنها مش بتقرأ من design tokens أصلاً، بتستخدم hex ثابت. ده مقصود ومتطابق مع المطلوب.

كمان نفس صفحة `/dashboard/whatsapp` (الإحصائيات) — هتتبع الـ theme زي باقي صفحات الـ dashboard لأنها بتستخدم design tokens. لو المطلوب إنها تفضل dark دايماً، نقدر نعزلها بـ wrapper `<div className="dark">` عشان tokens الـ dark تشتغل جواها بس.

**سؤال**: هل المقصود بـ "WhatsApp page" هو:
- (أ) `/whatsapp` و `/whatsapp-inbox` فقط (واجهة WhatsApp Web) — وهي بالفعل غير متأثرة
- (ب) كمان `/dashboard/whatsapp` (صفحة إحصائيات WhatsApp في الـ dashboard) تفضل dark دايماً

لو (ب)، هنضيف wrapper `<div className="dark bg-background">` حول محتوى `src/pages/dashboard/WhatsApp.tsx` عشان يفضل dark بغض النظر عن الـ theme المختار.

سأفترض **(ب)** عند التنفيذ — `/dashboard/whatsapp` تفضل dark دايماً، بالإضافة لواجهة WhatsApp Web اللي أصلاً مستقلة.

---

### الملفات

**جديدة:**
- `src/contexts/ThemeContext.tsx`

**معدّلة:**
- `src/main.tsx`
- `src/App.tsx`
- `src/index.css` (إعادة كتابة light tokens فقط)
- `src/components/UserMenu.tsx`
- `src/components/ui/sonner.tsx`
- `src/pages/dashboard/WhatsApp.tsx` (لفّ بـ `dark` wrapper)

### مش هيتعمل
- مفيش تغيير على database / RLS / edge functions
- مفيش تعديل على components تحت `src/components/whatsapp/*`
- مفيش تغيير على layout أو structure — بس الألوان والـ toggle

