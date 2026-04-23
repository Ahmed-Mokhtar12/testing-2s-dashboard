-- 1) WhatsApp attachments — remove public/anon access, restrict to staff + service_role
-- Drop any existing public/permissive policies on whatsapp-attachments
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (policyname ILIKE '%whatsapp%' OR policyname ILIKE '%public%whatsapp%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Recreate strict policies
CREATE POLICY "Staff can read whatsapp attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'whatsapp-attachments' AND public.is_hotel_staff(auth.uid()));

CREATE POLICY "Service role read whatsapp attachments"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'whatsapp-attachments');

CREATE POLICY "Staff can upload whatsapp attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'whatsapp-attachments' AND public.is_hotel_staff(auth.uid()));

CREATE POLICY "Service role upload whatsapp attachments"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'whatsapp-attachments');

-- Ensure bucket is private
UPDATE storage.buckets SET public = false WHERE id = 'whatsapp-attachments';

-- 2) Realtime — restrict subscriptions to hotel staff only
DROP POLICY IF EXISTS "Authenticated can subscribe to realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Allow all authenticated" ON realtime.messages;

CREATE POLICY "Hotel staff can subscribe to realtime"
ON realtime.messages FOR SELECT
TO authenticated
USING (public.is_hotel_staff((SELECT auth.uid())));

CREATE POLICY "Hotel staff can broadcast to realtime"
ON realtime.messages FOR INSERT
TO authenticated
WITH CHECK (public.is_hotel_staff((SELECT auth.uid())));

-- 3) website_chats — remove anonymous insert, restrict to service_role
-- (the edge function uses service_role to log website chats)
DROP POLICY IF EXISTS "Anyone can insert website chats" ON public.website_chats;
DROP POLICY IF EXISTS "Authenticated users can delete own website chats" ON public.website_chats;
DROP POLICY IF EXISTS "Authenticated users can update own website chats" ON public.website_chats;
DROP POLICY IF EXISTS "Authenticated users can view own website chats" ON public.website_chats;

-- Hotel staff can read all website chats (for monitoring)
CREATE POLICY "Hotel staff can read website_chats"
ON public.website_chats FOR SELECT
TO authenticated
USING (public.is_hotel_staff(auth.uid()));

-- 4) website_chat_messages — let staff read for monitoring
CREATE POLICY "Hotel staff can read website_chat_messages"
ON public.website_chat_messages FOR SELECT
TO authenticated
USING (public.is_hotel_staff(auth.uid()));