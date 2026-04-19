
خطة الإصلاحات الأمنية الآمنة — جاهزة للتنفيذ

## نطاق التنفيذ المؤكد
- لا مساس بـ `Chat History` ولا `/whatsapp` ولا `whatsapp-send-message`
- لا مصادقة في هذه المرحلة
- توافق كامل مع n8n وEdge Functions الحالية

## التغييرات

### 1. Migration: إصلاح `website_chats`
- حذف 4 سياسات `{public}` الخاطئة (Service role can read/insert/update/delete)
- إنشاء سياسة موحّدة: `FOR ALL TO service_role USING (true) WITH CHECK (true)`
- الإبقاء على `Anyone can insert website chats` و policies المصادقة

### 2. Migration: تأمين Realtime للجداول الحساسة
- إزالة من `supabase_realtime` publication: `website_chat_sessions`, `website_email_threads`, `burst_email`, `burst_social_dm`, `email_threads`
- تفعيل RLS + إضافة policy `service_role` فقط لكل منها
- **`Chat History` realtime يبقى كما هو** (مستخدم في `useWhatsAppChat`)

### 3. Migration: تشديد سياسة `USING (true)` في `Chat History`
- `Service role can update Chat History` تُعاد لـ `{service_role}` فقط (الواجهة لا تحدّث الجدول مباشرة)
- باقي سياسات INSERT العامة تبقى كما هي

### 4. Migration: Storage UPDATE policy لـ `documents`
```sql
CREATE POLICY "Users can update files in own folder"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (...);
```

### 5. Migration: إصلاح `search_path` في الدوال
- `skip_reaction_rows()`
- `N8N_2S(filter, match_count, query_embedding)`
- `match_documents(query_embedding, match_count, filter)`

### 6. تقصير OTP expiry
- تعديل `supabase/config.toml` → `[auth] otp_expiry = 600`

### 7. تحديث حالة الـ Findings
- `mark_as_fixed`: website_chats, realtime sensitive tables, storage UPDATE, search_path, RLS USING true, OTP expiry
- `ignore` بسبب مرحلة الاختبار: chat_history_anon, whatsapp_send_no_auth, realtime_messages_no_policies

## ما لن يتغيّر
- `/whatsapp` يعمل بالكامل
- `useWhatsAppChat` Realtime على Chat History مستمر
- إرسال الرسائل عبر `whatsapp-send-message` بدون JWT
- جدول Chat History مفتوح للـ anon
