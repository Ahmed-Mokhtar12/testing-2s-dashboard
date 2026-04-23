

## إعادة تصميم شات Sera ليطابق هوية الـ Dashboard (نيون داكن)

الشات الحالي بخلفية بيضاء/رمادية وألوان ذهبية (`#C8A351`) لا تنسجم مع الموقع الجديد ذو الخلفية البنفسجية الداكنة والألوان النيون (primary بنفسجي، accent سماوي، magenta).  
سيتم إعادة تصميم اللوحة بالكامل باستخدام الـ design tokens الموجودة في `index.css`.

### الملفات التي ستُعدَّل
1. `src/components/WelcomeScreen.tsx`
2. `src/components/InputBar.tsx`
3. `src/components/ChatMessage.tsx`
4. `src/components/MessageList.tsx`
5. `src/components/ChatFooter.tsx` (إزالة لون رمادي قديم)
6. `src/components/dashboard/RightChatPanel.tsx` (تنظيف الـ header)

---

### 1) WelcomeScreen — شاشة الترحيب
- **حذف كامل** للعنوان "Welcome to Two Seasons Hotel AI Manager" والفقرة الفارغة تحته.
- **الإبقاء على شعار Two Seasons فقط** داخل دائرة بحدود نيون (primary glow):
  ```tsx
  <div className="w-16 h-16 rounded-full bg-card border border-primary/30 glow-primary
                  flex items-center justify-center overflow-hidden mx-auto mb-4">
    <img src={twoSeasonsLogo} alt="Two Seasons" className="w-12 h-12 object-contain" />
  </div>
  ```
- استبدال الكروت الثلاث (📊 / 🎯 / 🤖) بـ **3 chips صغيرة "suggestion prompts"** بنفس لغة الموقع، قابلة للنقر تملأ الـ input:
  - "Show yesterday's WhatsApp conversations"
  - "Compare our rates vs competitors"
  - "Summarize latest guest reviews"
  - تصميم: `bg-card/60 border border-border hover:border-primary/50 hover:bg-primary/5 rounded-full px-3 py-1.5 text-xs text-foreground/80 transition-all`
- إزالة الخلفية البيضاء `from-gray-50 to-gray-100` → استخدام `bg-transparent` (الـ panel الأب لديه `bg-card-gradient`).
- إزالة سطر "💡 Tip: …" (ضوضاء بصرية).

### 2) InputBar — صندوق الإدخال
- إزالة `bg-white` و `border-gray-300` و `text-gray-900`.
- الحاوية الخارجية: `bg-transparent border-t border-border`.
- Textarea container:
  ```
  rounded-2xl bg-card/80 border border-border
  focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/40
  shadow-card-soft backdrop-blur
  ```
- النص: `text-foreground placeholder:text-muted-foreground`.
- أيقونات Mic / Upload: `text-muted-foreground hover:text-primary`.
- زر Send: `bg-primary-gradient text-primary-foreground glow-primary hover:scale-105 transition-transform rounded-2xl`.

### 3) ChatMessage — فقاعات المحادثة
- **رسائل المستخدم** (يمين): `bg-primary-gradient text-primary-foreground rounded-2xl rounded-tr-md shadow-card-soft`.
- **رسائل Sera** (يسار): `bg-card border border-border text-card-foreground rounded-2xl rounded-tl-md shadow-card-soft`.
- **Avatar Sera**: استبدال دائرة "TS" الذهبية بدائرة بشعار Two Seasons:
  ```tsx
  <div className="w-8 h-8 rounded-full bg-card border border-primary/40 glow-primary
                  overflow-hidden flex items-center justify-center">
    <img src={twoSeasonsLogo} className="w-6 h-6 object-contain" />
  </div>
  ```
- **Avatar المستخدم**: استبدال "You" الرمادي بـ `bg-accent/20 border border-accent/40 text-accent` مع أيقونة `User` من lucide.
- Timestamp: `text-foreground/50` بدل `text-gray-500`.

### 4) MessageList
- إزالة `bg-gray-50` → `bg-transparent` (يأخذ خلفية الـ panel).
- الإبقاء على `ScrollArea` و `space-y-6`.

### 5) TypingIndicator
- فحص سريع وتحديث ألوان النقاط من رمادي إلى `bg-primary/60` مع `animate-pulse`.

### 6) ChatFooter
- تغيير `text-gray-500 border-t` → `text-muted-foreground border-t border-border bg-transparent`.
- النص يبقى "Powered by Two Seasons Data".

### 7) RightChatPanel — header اللوحة
- استبدال دائرة "S" البنفسجية بشعار Two Seasons داخل دائرة صغيرة بنفس نمط الـ avatar الجديد.
- إزالة "Hotel Consultant" أو الإبقاء عليه كـ subtitle خفيف `text-muted-foreground` (سيتم الإبقاء — جزء من هوية Sera).

---

### ملاحظات تقنية
- جميع الألوان عبر **HSL design tokens** (`hsl(var(--primary))`, `bg-card`, `border-border` …) — لا hardcoded hex.
- الشعار يُستورد من `@/assets/two-seasons-logo.png` (الموجود مسبقاً).
- لا تغييرات على المنطق (`useChat`, `useChatSessions`, edge functions, n8n).
- لا تغييرات على الـ routing أو قاعدة البيانات.

### اختبار سريع بعد التنفيذ
1. افتح `/dashboard/whatsapp` → اضغط زر الشات العائم.
2. تأكد أن اللوحة بخلفية داكنة منسجمة مع الـ dashboard، شعار Two Seasons في الأعلى، وعنوان "Welcome to Two Seasons Hotel AI Manager" مُزال.
3. اكتب رسالة وتأكد من ظهور فقاعة بنفسجية متدرجة على اليمين، ورد Sera في فقاعة `bg-card` على اليسار مع شعار Two Seasons كـ avatar.
4. تأكد أن صندوق الإدخال داكن مع توهج نيون عند التركيز، وزر Send بتدرج بنفسجي.

