

## إضافة خيار إظهار/إخفاء كلمة المرور

### الفكرة
إضافة أيقونة عين (👁 / 👁‍🗨) داخل كل حقل password، عند الضغط عليها تتبدّل بين `type="password"` و `type="text"`.

### الأماكن اللي هيتم تعديلها

كل الحقول دي محتاجة الميزة:

1. **`src/pages/Auth.tsx`** — حقل Password في شاشة تسجيل الدخول
2. **`src/pages/ResetPassword.tsx`** — حقلين: New password + Confirm password
3. **`src/components/UserMenu.tsx`** — 3 حقول في dialog تغيير كلمة المرور: Current, New, Confirm

### طريقة التنفيذ

**إنشاء component جديد قابل لإعادة الاستخدام:**
- `src/components/ui/password-input.tsx`
- يلفّ `<Input>` الموجود ويضيف زرار عين على اليمين
- يحتفظ بـ state داخلي `showPassword` (افتراضياً false = مخفية)
- يستخدم أيقونتي `Eye` و `EyeOff` من `lucide-react`
- يقبل نفس props بتاع `<Input>` العادي (value, onChange, required, autoComplete, إلخ)
- زرار العين يكون `type="button"` عشان ميعملش submit للفورم
- مع `aria-label` مناسب للـ accessibility

**استبدال الحقول:**
استبدال كل `<Input type="password" ... />` في الملفات الأربعة بـ `<PasswordInput ... />` مع الحفاظ على نفس الأيقونة الموجودة على الشمال (مثل `Lock` icon في صفحة Auth).

### الشكل النهائي
```
┌─────────────────────────────────────┐
│ 🔒  ••••••••••              👁     │
└─────────────────────────────────────┘
```
لما يضغط على العين:
```
┌─────────────────────────────────────┐
│ 🔒  MyPassword123          👁‍🗨    │
└─────────────────────────────────────┘
```

### ملاحظات
- كل حقل له toggle مستقل (إظهار حقل New password ميأثرش على Confirm password)
- الافتراضي دائماً = مخفية (للأمان)
- مفيش تعديلات على backend أو database

