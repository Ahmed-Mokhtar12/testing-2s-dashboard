

## إعادة تصميم شات Sera بنمط "Lovable AI Assistant" (الصورة المرفقة)

الصورة المرفقة تُظهر مساعد Lovable على يمين الشاشة: لوحة عمودية نظيفة، header بسيط بأيقونة + اسم + قائمة، رسائل بدون فقاعات ثقيلة (نص مباشر مع توهج خفيف)، حالات سير عمل (Ran search_docs ✓ / Reasoned ⓘ)، وصندوق إدخال سفلي بسيط مع dropdown للموديل.  
سنطبّق نفس النمط على لوحة Sera مع الحفاظ على هويتنا (نيون بنفسجي + شعار Two Seasons).

### الملفات التي ستُعدَّل
1. `src/components/dashboard/RightChatPanel.tsx` — Header اللوحة
2. `src/components/WelcomeScreen.tsx` — شاشة البداية
3. `src/components/ChatMessage.tsx` — شكل الرسائل (إزالة الفقاعات الثقيلة)
4. `src/components/InputBar.tsx` — صندوق إدخال أنحف + dropdown
5. `src/components/TypingIndicator.tsx` — استبداله بـ "Reasoning…" بنمط Lovable
6. `src/components/ChatFooter.tsx` — حذفه أو دمج نصه داخل الـ input footer

---

### 1) Header اللوحة (RightChatPanel)
نمط مطابق للصورة:
```
[★ logo]  Sera  ⌄              [+]  [⚙]  [✕]
```
- شعار Two Seasons داخل دائرة صغيرة `w-7 h-7` بحدود `border-primary/40` و `glow-primary` خفيف.
- اسم "Sera" بخط `text-sm font-medium` + سهم `ChevronDown` صغير (placeholder للقائمة لاحقاً).
- على اليمين: زر `+` (محادثة جديدة → `clearMessages`)، زر `Settings` (placeholder)، زر `X` (إغلاق اللوحة).
- خلفية الـ header: `bg-card/40 backdrop-blur border-b border-border` بدون gradient ثقيل.
- حذف الـ subtitle "Hotel Consultant" — نظافة بصرية كاملة مثل الصورة.

### 2) WelcomeScreen
- إزالة دائرة الشعار الكبيرة + الـ chips الحالية.
- استبدالها بـ **رسالة افتتاحية واحدة** بنمط Lovable:
  ```
  ✦ Hi, I'm Sera.
  Your hotel data consultant. Ask me about
  bookings, reviews, competitors, or guests.
  ```
  - أيقونة ✦ (Sparkles من lucide) بلون `text-primary`.
  - عنوان `text-base font-medium text-foreground`.
  - وصف `text-sm text-muted-foreground`.
  - محاذاة لليسار، padding `px-4 py-6`.
- تحت الرسالة: 3 suggestion chips أصغر وأنحف (بدل المربعات):
  - "Yesterday's WhatsApp conversations"
  - "Rate vs competitors"
  - "Latest guest reviews"
  - تصميم: `text-xs text-muted-foreground hover:text-foreground border border-border/60 hover:border-primary/40 rounded-lg px-3 py-2 text-left w-full transition-colors`
  - مرتبة عمودياً (`flex flex-col gap-1.5`) مثل suggestions Lovable.

### 3) ChatMessage — إزالة الفقاعات الثقيلة
بنمط Lovable الرسائل تظهر كنص مباشر بدون كروت بارزة:

- **رسالة Sera** (AI):
  ```
  [logo 6x6]  نص الرسالة بدون خلفية
              بـ text-foreground/90 text-sm leading-relaxed
              [timestamp text-foreground/40 text-[10px]]
  ```
  - بدون `bg-card`، بدون `border`، بدون `rounded-2xl`.
  - فقط padding `py-3` وفاصل خفيف `border-b border-border/30` بين الرسائل (اختياري).

- **رسالة المستخدم**:
  - تبقى فقاعة خفيفة لتمييزها لكن أنحف:  
    `bg-primary/10 border border-primary/20 rounded-xl px-3 py-2 text-sm text-foreground` على اليمين.
  - بدون gradient ثقيل.
  - بدون avatar (مثل Lovable الذي لا يُظهر avatar للمستخدم).

- إزالة "(Dubai)" من الـ timestamp — يكفي الوقت.

### 4) InputBar — صندوق إدخال بنمط Lovable
نسخة مطابقة لصورة Lovable:
```
┌─────────────────────────────────────────┐
│  Ask Sera a follow up question...       │
│                                          │
│  [model ⌄]              [📎] [🎤] [↑]  │
└─────────────────────────────────────────┘
```
- حاوية: `rounded-2xl bg-card/60 border border-border focus-within:border-primary/50 backdrop-blur` بدون shadow ثقيل.
- Textarea بسطر واحد افتراضياً يكبر تلقائياً، placeholder: `"Ask Sera a follow up question..."`.
- شريط سفلي داخل نفس الحاوية:
  - يسار: زر صغير `[Sera ⌄]` placeholder للموديل/الأداة بنمط `text-xs text-muted-foreground hover:text-foreground bg-background/40 rounded-md px-2 py-1`.
  - يمين: 3 أزرار `Paperclip` / `Mic` / `ArrowUp` بحجم `h-7 w-7`، الزر الأخير (إرسال) `bg-primary text-primary-foreground rounded-lg` بدون gradient.
- إزالة زر Send المربع الكبير المنفصل.

### 5) TypingIndicator → "Reasoning indicator"
بدل النقاط الثلاث، عرض سطر بنمط Lovable:
```
○ Reasoning…
```
- دائرة صغيرة `w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin`.
- نص `text-xs text-muted-foreground`.
- بدون فقاعة، بدون avatar، فقط محاذاة يسار مع `pl-9` ليتماشى مع الرسائل.

### 6) ChatFooter
- حذف "Powered by Two Seasons Data" من شريط مستقل.
- نقله كـ نص رمادي صغير جداً تحت الـ InputBar مباشرة:  
  `text-[10px] text-muted-foreground/60 text-center mt-1.5`.

---

### ملاحظات تقنية
- جميع الألوان عبر HSL design tokens فقط.
- لا تغييرات على المنطق (`useChat`, sessions, edge functions, n8n).
- لا تغييرات على routing أو قاعدة البيانات.
- الـ `+` button في الـ header يستدعي `clearMessages` الموجودة في `useChat`.
- زر `X` في الـ header يستدعي callback إغلاق اللوحة (موجود بالفعل في `RightChatPanel` كـ prop).

### اختبار سريع بعد التنفيذ
1. افتح `/dashboard/whatsapp` → افتح لوحة الشات.
2. تأكد أن الـ header مثل الصورة: شعار + "Sera ⌄" يسار، أزرار + / ⚙ / ✕ يمين.
3. تأكد أن الرسائل بدون فقاعات ثقيلة (نص مباشر مع شعار صغير لـ Sera).
4. تأكد أن صندوق الإدخال موحّد: textarea + شريط سفلي بـ model selector + أزرار attach/mic/send.
5. أرسل رسالة وتأكد أن مؤشر "Reasoning…" يظهر بدل النقاط.

