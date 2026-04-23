

## إعادة تصميم الـ Sidebar داخل لوحة Sera

### المشاكل الحالية
1. **لا يوجد زر إغلاق** للـ inner sidebar — فُتح ولا طريقة لإقفاله من داخله.
2. **لا يعرض المحادثات السابقة** بشكل صحيح — يظهر فقط الهيدر "Two Seasons GPT" + زر New Chat + أيقونة Settings، والقائمة فارغة.
3. **زر "+ New Chat" مكرر** — موجود أصلاً في هيدر Sera الأيمن (`+`).
4. **هيدر "Two Seasons GPT" غير ضروري** داخل لوحة Sera (تكرار بصري).

### الحل المقترح

إنشاء مكوّن جديد مخصص للـ inner sidebar بدلاً من إعادة استخدام `Sidebar.tsx` العام (المصمم أصلاً للصفحة الكاملة `/`).

**ملف جديد:** `src/components/dashboard/SeraHistorySidebar.tsx`

#### المحتوى الجديد للـ sidebar:

```text
┌──────────────────────────┐
│ Chat History         [×] │ ← هيدر بسيط + زر إغلاق
├──────────────────────────┤
│ 🔍 Search conversations  │ ← (اختياري) بحث
├──────────────────────────┤
│ ▸ Today                  │
│   • Rate vs competitors  │ ← المحادثات السابقة
│   • Latest reviews    🗑 │   مع زر حذف عند hover
│ ▸ Yesterday              │
│   • WhatsApp summary     │
│ ▸ Previous 7 days        │
│   • ...                  │
└──────────────────────────┘
```

#### المواصفات التقنية

1. **زر إغلاق (×)** في الزاوية اليمنى العليا للـ sidebar — يستدعي `setInnerSidebar(false)` عبر prop جديد `onClose`.
2. **حذف زر "+ New Chat"** ورمز Settings و LayoutDashboard و LogIn من الـ inner sidebar (تبقى موجودة في هيدر Sera الرئيسي).
3. **حذف هيدر "Two Seasons GPT"** — نستبدله بعنوان مبسّط "Chat History".
4. **عرض المحادثات السابقة** من `chatSessions` (آتية أصلاً من `useChatSessions`) — مع تجميع اختياري حسب التاريخ (Today / Yesterday / Previous).
5. **تنسيق متّسق** مع ثيم لوحة Sera: `bg-card/40`, `border-border`, `text-foreground`, `text-muted-foreground` — بدون ألوان hardcoded مثل `#1E1E1E`.
6. **تفاعل العنصر:** click → اختيار الجلسة، hover → إظهار أيقونة الحذف.

#### تعديل `RightChatPanel.tsx`

- استبدال `<Sidebar … />` (السطور 97–104) بـ `<SeraHistorySidebar … onClose={() => setInnerSidebar(false)} />`.
- تمرير نفس الـ props الحالية: `chatSessions`, `activeSessionId`, `onSessionSelect`, `onDeleteSession`.

### الملفات المعدّلة
- **جديد:** `src/components/dashboard/SeraHistorySidebar.tsx`
- **تعديل:** `src/components/dashboard/RightChatPanel.tsx` (استبدال المكوّن المستخدم في الـ inner sidebar فقط)

### لا تأثير على
- `src/components/Sidebar.tsx` يبقى كما هو (مستخدم في صفحة `/` الرئيسية).
- منطق `useChatSessions` و حفظ/تحميل المحادثات.
- الزر العائم وهيدر Sera الرئيسي.

