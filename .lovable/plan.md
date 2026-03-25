

# اصلاح شامل لنظام الشات - المشاكل والحلول

## المشاكل المكتشفة

### المشكلة 1: لا يتم ارسال `sessionId` للـ Edge Function
الفرونت اند يرسل فقط `message` و `messageId` عبر `sendMessageToAI()` في `src/utils/messageSender.ts`. الـ Edge Function يبحث عن تاريخ المحادثة بـ `session_id = 'guest'` فلا يجد شيء = لا ذاكرة محادثة.

### المشكلة 2: OpenAI يرجع tool_calls بدلا من نص
في `openai-service.ts`، الاستدعاء الثاني لـ OpenAI يستخدم `tool_choice: 'auto'`. احياناً OpenAI يقرر يستدعي tools مرة ثانية بدلاً من كتابة رد نصي. النتيجة: `content = null` والفولباك يكون "I'm here to help!"

### المشكلة 3: عدم معالجة tool_calls المتكررة
لا يوجد كود يتعامل مع حالة ان الاستدعاء الثاني يرجع tool_calls ايضاً. يجب اجبار OpenAI على الرد بنص في المرحلة الاخيرة.

---

## الحل المقترح

### 1. تمرير `sessionId` من الفرونت اند (ملف: `src/utils/messageSender.ts`)
- تعديل `sendMessageToAI` لقبول `sessionId` كمعامل وارساله في body الطلب

### 2. تمرير `sessionId` من hook ارسال الرسائل (ملف: `src/hooks/useMessageSending.ts`)
- تمرير `currentSessionId` عند استدعاء `sendMessageToAI`

### 3. اجبار الرد النصي في الاستدعاء الثاني (ملف: `supabase/functions/chat-with-data/openai-service.ts`)
- تغيير `tool_choice` في الاستدعاء الثاني من `'auto'` الى `'none'` لاجبار OpenAI على انتاج نص بدلاً من tool calls اضافية

### 4. تحسين الفولباك في index.ts (ملف: `supabase/functions/chat-with-data/index.ts`)
- اذا لم يكن هناك content ولا action tool calls، يتم اعادة استدعاء OpenAI بدون tools كمحاولة اخيرة بدلاً من الرد الجنيريك

---

## التفاصيل التقنية

### `src/utils/messageSender.ts`
```text
sendMessageToAI(message, messageId, sessionId?)
  → body: { message, messageId, sessionId }
```

### `src/hooks/useMessageSending.ts`
```text
sendMessageToAI(userMessageContent, userMessage.id, sessionId)
```

### `supabase/functions/chat-with-data/openai-service.ts`
```text
// الاستدعاء الثاني - اجبار نص
const finalResponse = await client.makeRequest(
  executionResult.messages,
  secondCallTools,
  'none'  // بدلاً من 'auto'
);
```

### `supabase/functions/chat-with-data/index.ts`
```text
// فولباك ذكي بدل الجنيريك
if (!response.response || response.response === "I'm here to help!...") {
  // اعادة استدعاء بدون tools
}
```

### نشر التحديث
اعادة نشر Edge Function `chat-with-data` بعد التعديلات

