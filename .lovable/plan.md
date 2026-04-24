

## إصلاح: Reset link بيعمل auto-login + Sign out مش شغال

### السبب الجذري (مشكلة واحدة بتسبب الاتنين)

الـ Site URL في Supabase دلوقتي = preview domain اللي بيتغير. اللينك في الإيميل بيروح على `/verify` في Supabase، وده بيستبدل الـ recovery token بـ **session كاملة** ويرجّع المستخدم للـ root `/` بدل `/reset-password`.

النتيجة:
1. **Auto-login** — Supabase أنشأت session فعلاً، فالـ `AuthProvider` بيلاقي user موجود ويوديك على الـ dashboard مباشرة بدون ما تدخل كلمة سر.
2. **Sign out مش شغال** — الـ session دي مش متخزنة في الـ `localStorage` بتاع المتصفح الحالي بشكل صحيح (شايف في الـ logs: `session id ... doesn't exist` مع `403` على `/logout`)، فلما تضغط Sign out، Supabase ترفض لأن الـ session ID مش موجودة عندها.

السبب التاني للـ logout: في `signOut()` مفيش معالجة للأخطاء ولا تنظيف local state، فلما الـ API ترجع 403 الـ UI مبيعرفش يحدّث.

---

### الحل

#### 1) `src/contexts/AuthContext.tsx` — تقوية `signOut`
- استخدام `supabase.auth.signOut({ scope: 'local' })` كـ fallback لما الـ remote session مش موجودة، عشان نضمن إن الـ tokens المحلية تتمسح حتى لو الـ server رفض.
- مسح `user` و `session` من الـ state يدوياً بعد الـ signOut عشان الـ UI يحدّث فوراً حتى لو حصل error.
- إرجاع error من `signOut` عشان `UserMenu` يقدر يعرضه.

#### 2) `src/pages/ResetPassword.tsx` — منع الـ auto-login redirect
المشكلة: لما المستخدم بيوصل للصفحة من اللينك، Supabase خلاص عملت session. الـ `ProtectedRoute` و `Auth.tsx` بيشوفوا user موجود ويعملوا redirect بعيد عن `/reset-password`.

الإصلاح:
- صفحة `/reset-password` نفسها مش محمية، بس المشكلة إن اللينك بيرجّع المستخدم على `/#` (الـ root) مش على `/reset-password`. ده معناه إن الـ **redirect URL** اللي Supabase بتستخدمه مش `/reset-password`.
- نضيف **تحقق إجباري** في `Auth.tsx` و `Overview` redirect: لو الـ URL فيه `type=recovery` أو `code=` أو `#access_token` مع `type=recovery`، نعمل redirect على `/reset-password` بدل ما نسيب المستخدم يدخل الـ dashboard.
- نضيف نفس المنطق في `ProtectedRoute`: لو فيه recovery token في الـ URL، redirect على `/reset-password`.

#### 3) `src/contexts/AuthContext.tsx` — كشف PASSWORD_RECOVERY event
Supabase بترسل event اسمه `PASSWORD_RECOVERY` لما يتم استخدام recovery link. نضيف flag `isRecovering` في الـ context، ولما يكون true:
- `ProtectedRoute` يعمل redirect على `/reset-password` تلقائي
- `Auth.tsx` ميعملش auto-redirect بعيد

#### 4) إعدادات Supabase (المستخدم يعملها يدوياً)
في Supabase Dashboard → Authentication → URL Configuration:
- تأكد إن الـ **Redirect URLs** فيها اللينك الكامل `.../reset-password` (مش بس wildcard `/**`)
- الـ Site URL يفضل ثابت على preview domain الحالي

---

### الملفات اللي هتتعدل
- `src/contexts/AuthContext.tsx` — كشف PASSWORD_RECOVERY + تقوية signOut
- `src/components/ProtectedRoute.tsx` — redirect لو recovery flow
- `src/pages/Auth.tsx` — منع auto-redirect لو recovery flow
- `src/components/UserMenu.tsx` — التعامل مع error من signOut

### مش هيتعمل
- مفيش تعديل على الـ database أو RLS
- مفيش edge functions جديدة
- مفيش تغيير في `/reset-password` page نفسها (شغالة صح)

