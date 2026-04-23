

## خطة إعداد المصادقة (Login فقط + email confirmation)

### المرحلة 1: قاعدة البيانات (Migration واحدة)

#### 1.1 حذف الـ trigger المكسور
```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
```
سبب: الـ function تستهدف جدول `profiles` غير موجود → سيكسر التسجيل.

#### 1.2 تشديد RLS — تقييد كل القراءة على المستخدمين المسجّلين فقط

**الجداول المتأثرة (تحويل من `public` → `authenticated` only):**
- `Chat History` — استبدال السياسات الحالية الفضفاضة
- `reviews`, `email_threads`, `welcome_message_success_log`
- `info_email_audit_log`, `social_engagement_logs`
- `Two Seasons Competitor Hotel room Rates`
- `Sop`, `Conducted Training`, `LongTermMemory`, `N8N_2S`
- `khaldia_reviews`, `conducted_training` — إضافة سياسة قراءة للمسجّلين

**النموذج المُطبَّق على كل جدول:**
```sql
DROP POLICY IF EXISTS "..." ON public."...";
CREATE POLICY "Authenticated users can read X"
  ON public."X" FOR SELECT TO authenticated USING (true);
```

#### 1.3 منع التسجيل الذاتي على مستوى DB
لا حاجة لتغيير DB — سنعطّل sign-up من الـ UI ومن إعدادات Supabase Auth (يدويًا من اللوحة، أو عبر تعطيل صفحة sign-up فقط).

---

### المرحلة 2: الكود (Frontend)

#### 2.1 ملفات جديدة
- **`src/contexts/AuthContext.tsx`** — Provider يدير `user`/`session` عبر `onAuthStateChange` (يُسجَّل **قبل** `getSession()` كما يُلزم الـ guide).
- **`src/hooks/useAuth.ts`** — wrapper بسيط للسياق.
- **`src/components/ProtectedRoute.tsx`** — يلفّ الـ routes الحساسة، يعيد التوجيه لـ `/auth` عند عدم وجود session، مع `loading` state أثناء التحقق.
- **`src/pages/Auth.tsx`** — صفحة بنموذج Login فقط (email + password) + رابط "Forgot password?".
- **`src/pages/ResetPassword.tsx`** — صفحة لإعادة تعيين كلمة المرور (تتعامل مع `type=recovery` في الـ hash).
- **`src/components/UserMenu.tsx`** — قائمة منسدلة في الـ top bar تعرض البريد + زر Logout.

#### 2.2 ملفات معدّلة
- **`src/App.tsx`**:
  - لفّ التطبيق بـ `<AuthProvider>`.
  - إضافة `/auth` و `/reset-password` كـ public routes.
  - لفّ كل الـ dashboard routes (`/`, `/dashboard/*`, `/whatsapp*`) بـ `<ProtectedRoute>`.
- **`src/layouts/DashboardShell.tsx`** — إضافة `<UserMenu />` في الـ top bar (يسار/يمين الـ DateRangePicker).
- **`src/hooks/useSeraLocalSessions.ts`** — جعل الـ storage key يتضمن `user.id` لمنع تسريب محادثات Sera بين المستخدمين على نفس المتصفح.

#### 2.3 سلوك email confirmation
- في `signUp()` المستقبلي (إن أُعيد تفعيله): `emailRedirectTo: window.location.origin`.
- في `resetPasswordForEmail()`: `redirectTo: window.location.origin + '/reset-password'`.
- بما أن sign-up معطّل من UI، الحسابات تُنشأ يدويًا من Supabase Dashboard → المستخدم سيتلقى إيميل دعوة → يضغط الرابط → يدخل لتعيين كلمة مرور.

---

### المرحلة 3: التحقق

1. **Build check** — تشغيل `npm run build` للتأكد من عدم وجود أخطاء TypeScript.
2. **Security scan** — تشغيل `security--run_security_scan` بعد الـ migration.
3. **اختبار يدوي بسيط** — التأكد أن `/auth` تُحمَّل، والـ redirect يعمل عند الوصول لـ `/dashboard`.

---

### ⚠️ ملاحظة مهمة للمستخدم بعد التنفيذ

ستحتاج تنفيذ هذه الخطوات **يدويًا في Supabase Dashboard**:

1. **تعطيل sign-up** (Authentication → Providers → Email → ❌ Enable Sign-ups).
2. **تفعيل Email Confirmations** (Authentication → Settings → ✅ Confirm email).
3. **إنشاء أول حساب admin** يدويًا من (Authentication → Users → Add user → Send invite).
4. **(اختياري) لتفعيل Lovable auth email templates مع برانديق Two Seasons** — يحتاج إعداد email domain منفصل (يمكن طلبه لاحقًا).

---

### لا تأثير على
- منطق الـ chat-with-data أو أي edge function أخرى.
- بنية `useChat` و `useSeraLocalSessions` (سوى scoping الـ key).
- الـ UI للـ dashboard pages أو الـ sidebar.

