

## مزامنة `activeSessionId` بين `useChat` و `useSeraLocalSessions`

### المشكلة
الآن `useChat` يحتفظ بـ `currentSessionId` داخلي منفصل عن `activeSessionId` في `useSeraLocalSessions`. عند بدء محادثة جديدة من داخل `useChat` (عبر `createNewSessionId`)، الـ hook الخارجي لا يعرف بالـ session الجديد، فلا يتم تحديث `activeSessionId` ولا تظهر الجلسة كنشطة في الـ sidebar حتى يتم حفظ أول رسالة. كذلك عند إعادة render للـ `RightChatPanel`، الـ `activeSessionId` يبدأ دائمًا `null` لأنه state محلي بدون persistence.

### الحل

#### 1. `src/hooks/useSeraLocalSessions.ts`
- **Persist `activeSessionId`** في `localStorage` تحت مفتاح `sera_active_session_v1`:
  - تهيئة الـ state عبر lazy initializer يقرأ من الـ storage.
  - `useEffect` يكتب القيمة عند أي تغيير (يمسح المفتاح إذا كانت `null`).
- **إضافة setter صريح** `setActiveSessionId` ضمن القيم المُرجَعة من الـ hook ليتمكن المستهلك من المزامنة من الخارج.
- التأكد أن `createNewSession`, `selectSession`, `deleteSession` تستمر تحديث الـ state (موجود فعلاً، لكن نضمن أن الـ persistence effect يلتقطها).

#### 2. `src/hooks/useChat.ts`
- استقبال prop جديد اختياري: `onSessionIdChange?: (sessionId: string | null) => void`.
- الإبقاء على `currentSessionId` المحلي لكن:
  - مزامنته مع `activeSessionId` القادم من الـ props عبر `useEffect` (عند تغيّر `activeSessionId` الخارجي → تحديث الـ state الداخلي).
  - عند تغيّر `currentSessionId` داخليًا (مثلاً بعد `createNewSessionId` في `useMessageSending`) → استدعاء `onSessionIdChange` لإبلاغ الـ parent.

#### 3. `src/components/dashboard/RightChatPanel.tsx`
- استخراج `setActiveSessionId` من `useSeraLocalSessions`.
- تمرير `onSessionIdChange={setActiveSessionId}` إلى `useChat`.
- النتيجة: عند إنشاء session جديد من `useChat`، يُرفع للـ hook الخارجي ويُحفظ في localStorage فورًا، ويظهر highlighted في الـ sidebar حتى قبل حفظ أول رد.

### الملفات المعدّلة
- `src/hooks/useSeraLocalSessions.ts` — persistence للـ `activeSessionId` + إضافة setter.
- `src/hooks/useChat.ts` — قبول `onSessionIdChange` ومزامنة ثنائية الاتجاه مع `activeSessionId`.
- `src/components/dashboard/RightChatPanel.tsx` — توصيل الـ setter بين الـ hookين.

### لا تأثير على
- بنية الرسائل أو الـ storage الحالي للـ sessions.
- تدفق الحفظ (`saveChatMessage`) أو حذف الجلسات.
- الـ UI للـ sidebar أو الهيدر.

