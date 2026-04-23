

## الهدف
محاذاة لوحة Sera (يمين) مع المحتوى الرئيسي (يسار) بحيث يبدآن **من نفس الخط الأفقي** بالضبط، تحت الـ topbar.

## المشكلة الحالية
- `RightChatPanel` يستخدم `h-screen` ويبدأ من أعلى الصفحة (Y=0)
- المحتوى الرئيسي على اليسار يبدأ **تحت** topbar بارتفاع `h-14` (56px)
- النتيجة: عنوان "Competitor Rates" يقع أوطى من رأس Sera بـ ~56px

## الحل المقترح

تعديل واحد فقط في `src/layouts/DashboardShell.tsx`:

نقل `<RightChatPanel />` من خارج العمود الرئيسي إلى **داخل صف يبدأ تحت الـ topbar**، بحيث:
- الـ topbar يصبح ممتدًا فوق كامل العرض (sidebar + main + Sera)
- Sera وmain content يبدآن من نفس النقطة (تحت الـ topbar مباشرة)

### التغيير البنيوي

```text
قبل:                          بعد:
┌─────┬──────────────┬──┐    ┌─────┬─────────────────┐
│Side │ Topbar       │  │    │Side │ Topbar (full)   │
│bar  ├──────────────┤Se│    │bar  ├──────────┬──────┤
│     │ Main         │ra│    │     │ Main     │ Sera │
└─────┴──────────────┴──┘    └─────┴──────────┴──────┘
```

### تفاصيل تقنية
1. في `DashboardShell.tsx`: نقل `<RightChatPanel />` ليكون **شقيقًا للـ `<main>`** داخل نفس الـ flex row، وإزالة `h-screen` منه (يصبح يأخذ ارتفاع المتاح تلقائيًا).
2. في `RightChatPanel.tsx`: تغيير `h-screen` إلى `h-full` على الـ `<aside>` لأنه أصبح داخل container بارتفاع محدود.
3. الـ floating trigger button (الزر العائم لفتح Sera) يبقى كما هو `fixed bottom-6 right-6`.

### ملفات معدّلة
- `src/layouts/DashboardShell.tsx` — إعادة ترتيب الصفوف
- `src/components/dashboard/RightChatPanel.tsx` — `h-screen` → `h-full`

### لا تأثير على
- وظائف Sera (الشات، الجلسات، الرفع)
- الـ sidebar الأيسر
- الزر العائم

