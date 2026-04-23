-- ============================================
-- 1. WHATSAPP-ATTACHMENTS BUCKET HARDENING
-- ============================================
-- Drop overly permissive public write policies
DROP POLICY IF EXISTS "Public upload whatsapp-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public update whatsapp-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public delete whatsapp-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload whatsapp-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update whatsapp-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete whatsapp-attachments" ON storage.objects;

-- Restrict uploads to authenticated staff only
CREATE POLICY "Authenticated can upload whatsapp-attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'whatsapp-attachments');

-- Restrict updates to service_role only
CREATE POLICY "Service role can update whatsapp-attachments"
  ON storage.objects
  FOR UPDATE
  TO service_role
  USING (bucket_id = 'whatsapp-attachments')
  WITH CHECK (bucket_id = 'whatsapp-attachments');

-- Restrict deletes to service_role only
CREATE POLICY "Service role can delete whatsapp-attachments"
  ON storage.objects
  FOR DELETE
  TO service_role
  USING (bucket_id = 'whatsapp-attachments');

-- ============================================
-- 2. REVOKE anon ACCESS TO SECURITY DEFINER RPC
-- ============================================
REVOKE EXECUTE ON FUNCTION public.is_conversation_human_controlled(text) FROM anon;

-- ============================================
-- 3. EXPLICIT DENY FOR SENSITIVE TABLES
-- ============================================
-- website_email_threads: only service_role; explicitly block anon/authenticated
DROP POLICY IF EXISTS "Block anon and authenticated from website_email_threads" ON public.website_email_threads;
CREATE POLICY "Block anon and authenticated from website_email_threads"
  ON public.website_email_threads
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- website_burst_whatsapp_message: only service_role; explicitly block anon/authenticated
DROP POLICY IF EXISTS "Block anon and authenticated from website_burst_whatsapp_message" ON public.website_burst_whatsapp_message;
CREATE POLICY "Block anon and authenticated from website_burst_whatsapp_message"
  ON public.website_burst_whatsapp_message
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);