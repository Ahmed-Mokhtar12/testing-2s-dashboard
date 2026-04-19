
## تصحيح دالة `match_documents` + متابعة الإصلاحات الأمنية

### المشكلة
الدالة الحالية تستخدم `where filter = '{}'` فتُرجع نتائج فقط عندما يكون الفلتر فارغاً، وتُرجع صفر نتائج لأي فلتر غير فارغ — كسر كامل للبحث المتجهي المُفلتَر.

### التصحيح

```sql
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector,
  match_count integer DEFAULT 6,
  filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
begin
  return query
  select
    docs.id,
    docs.content,
    docs.metadata,
    1 - (docs.embedding <#> query_embedding) as similarity
  from public."N8N_2S" as docs
  where (filter = '{}'::jsonb OR docs.metadata @> filter)
  order by docs.embedding <#> query_embedding
  limit coalesce(match_count, 6);
end;
$$;
```

ملاحظة: `SET search_path TO 'public'` يُضاف هنا أيضاً ليُغطّي إصلاح search_path المُخطّط له في الخطوة 5، فنُنفّذ الإصلاحين معاً.

### نفس المعالجة لدالة `N8N_2S`
نفس النمط مطلوب لتسهيل الفلترة المستقبلية وإصلاح search_path:

```sql
CREATE OR REPLACE FUNCTION public."N8N_2S"(
  filter jsonb,
  match_count integer,
  query_embedding vector
)
RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
begin
  return query
  select
    docs.id, docs.content, docs.metadata,
    1 - (docs.embedding <#> query_embedding) as similarity
  from public."N8N_2S" as docs
  where (filter = '{}'::jsonb OR docs.metadata @> filter)
  order by docs.embedding <#> query_embedding
  limit match_count;
end;
$$;
```

### بقية الخطة الأمنية المعتمدة سابقاً (دون تغيير)
1. `website_chats`: حذف 4 سياسات public خاطئة + إنشاء سياسة `service_role` موحّدة
2. Realtime: إزالة الجداول الحساسة من publication + RLS service_role
3. `Chat History`: تشديد سياسة UPDATE إلى service_role فقط
4. Storage: إضافة UPDATE policy لـ `documents` bucket
5. `skip_reaction_rows`: إضافة `SET search_path = public`
6. `supabase/config.toml`: `[auth] otp_expiry = 600`
7. تحديث حالات الـ findings (mark_as_fixed / ignore)

### ما لن يتغيّر
- `/whatsapp` يعمل كما هو
- Realtime على `Chat History` مستمر
- `whatsapp-send-message` بدون JWT
- لا مصادقة في هذه المرحلة
