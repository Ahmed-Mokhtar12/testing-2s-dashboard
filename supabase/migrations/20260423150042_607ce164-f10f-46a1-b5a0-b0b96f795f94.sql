-- 1) Realtime: drop ALL existing policies and recreate staff-only
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON realtime.messages', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Hotel staff only - realtime select"
ON realtime.messages FOR SELECT
TO authenticated
USING (public.is_hotel_staff((SELECT auth.uid())));

CREATE POLICY "Hotel staff only - realtime insert"
ON realtime.messages FOR INSERT
TO authenticated
WITH CHECK (public.is_hotel_staff((SELECT auth.uid())));

-- 2) website_chat_sessions / website_chat_messages: explicit RESTRICTIVE deny for non-staff
CREATE POLICY "Deny anon and non-staff sessions"
ON public.website_chat_sessions
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (public.is_hotel_staff(auth.uid()))
WITH CHECK (public.is_hotel_staff(auth.uid()));

CREATE POLICY "Deny anon and non-staff messages"
ON public.website_chat_messages
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (public.is_hotel_staff(auth.uid()))
WITH CHECK (public.is_hotel_staff(auth.uid()));

-- 3) sop storage bucket: explicit staff-only policies
CREATE POLICY "Staff read sop bucket"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'sop' AND public.is_hotel_staff(auth.uid()));

CREATE POLICY "Staff upload sop bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'sop' AND public.is_hotel_staff(auth.uid()));

CREATE POLICY "Staff update sop bucket"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'sop' AND public.is_hotel_staff(auth.uid()));

CREATE POLICY "Staff delete sop bucket"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'sop' AND public.is_hotel_staff(auth.uid()));

CREATE POLICY "Service role full sop bucket"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'sop')
WITH CHECK (bucket_id = 'sop');