
-- =====================================================
-- إصلاح 1: website_chats - إزالة شرط auth.uid() IS NULL الخطير
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own website chats or guest chats" ON public.website_chats;
DROP POLICY IF EXISTS "Users can update their own website chats" ON public.website_chats;
DROP POLICY IF EXISTS "Users can delete their own website chats" ON public.website_chats;

-- سياسة SELECT آمنة: المستخدمون المصادقون يرون محادثاتهم فقط
CREATE POLICY "Authenticated users can view own website chats"
ON public.website_chats
FOR SELECT
USING (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

-- سياسة UPDATE آمنة
CREATE POLICY "Authenticated users can update own website chats"
ON public.website_chats
FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

-- سياسة DELETE آمنة
CREATE POLICY "Authenticated users can delete own website chats"
ON public.website_chats
FOR DELETE
USING (
  auth.uid() IS NOT NULL AND auth.uid() = user_id
);

-- =====================================================
-- إصلاح 2: Storage - إزالة السياسات القديمة وإضافة تحقق من الملكية
-- =====================================================
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated downloads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletions" ON storage.objects;

-- service_role له وصول كامل للـ Edge Functions
CREATE POLICY "Service role full access to documents"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

-- المستخدمون المصادقون يصلون لملفاتهم فقط عبر مجلد يحمل uid الخاص بهم
CREATE POLICY "Authenticated users upload own documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users view own documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users delete own documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- =====================================================
-- إصلاح 3: إنشاء جدول uploaded_documents مع RLS مفعّل
-- =====================================================
CREATE TABLE IF NOT EXISTS public.uploaded_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  upload_status TEXT NOT NULL DEFAULT 'uploading',
  relevance_score DECIMAL(3,2),
  relevance_reason TEXT,
  document_category TEXT,
  processing_error TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- تفعيل RLS فوراً
ALTER TABLE public.uploaded_documents ENABLE ROW LEVEL SECURITY;

-- سياسات service_role فقط (الجدول يُستخدم داخلياً عبر Edge Functions)
CREATE POLICY "Service role can insert documents"
ON public.uploaded_documents
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can read documents"
ON public.uploaded_documents
FOR SELECT
TO service_role
USING (true);

CREATE POLICY "Service role can update documents"
ON public.uploaded_documents
FOR UPDATE
TO service_role
USING (true);

CREATE POLICY "Service role can delete documents"
ON public.uploaded_documents
FOR DELETE
TO service_role
USING (true);
