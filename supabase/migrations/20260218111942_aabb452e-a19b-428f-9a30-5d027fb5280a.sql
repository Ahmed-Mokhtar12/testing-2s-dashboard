
-- إصلاح دوال SQL: إضافة SECURITY INVOKER و SET search_path

-- 1. إعادة إنشاء mark_recent_document_context
CREATE OR REPLACE FUNCTION public.mark_recent_document_context(doc_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public."N8N_2S" SET is_recent_context = false WHERE is_recent_context = true;
  UPDATE public."N8N_2S" SET is_recent_context = true WHERE document_id = doc_id;
  UPDATE public.uploaded_documents SET last_accessed = now() WHERE id = doc_id;
END;
$$;

-- 2. إعادة إنشاء get_recent_document_context
CREATE OR REPLACE FUNCTION public.get_recent_document_context(limit_count integer DEFAULT 5)
RETURNS TABLE(content text, document_filename text, document_category text, chunk_index integer, relevance_score numeric)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.content,
    d.original_filename,
    d.document_category,
    n.chunk_index,
    d.relevance_score
  FROM public."N8N_2S" n
  JOIN public.uploaded_documents d ON n.document_id = d.id
  WHERE n.is_recent_context = true AND d.upload_status = 'processed'
  ORDER BY d.last_accessed DESC, n.chunk_index ASC
  LIMIT limit_count;
END;
$$;

-- 3. إصلاح handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;
