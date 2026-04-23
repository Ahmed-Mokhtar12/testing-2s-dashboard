
-- Drop any prior overly permissive policies we created (safe if missing)
DROP POLICY IF EXISTS "Staff read documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff read sop" ON storage.objects;
DROP POLICY IF EXISTS "Staff read whatsapp attachments" ON storage.objects;
DROP POLICY IF EXISTS "Staff upload whatsapp attachments" ON storage.objects;
DROP POLICY IF EXISTS "Staff update whatsapp attachments" ON storage.objects;
DROP POLICY IF EXISTS "Staff delete whatsapp attachments" ON storage.objects;

-- documents bucket: staff read-only
CREATE POLICY "Staff read documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents' AND public.is_hotel_staff(auth.uid()));

-- sop bucket: staff read-only
CREATE POLICY "Staff read sop"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'sop' AND public.is_hotel_staff(auth.uid()));

-- whatsapp-attachments bucket: staff full CRUD
CREATE POLICY "Staff read whatsapp attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'whatsapp-attachments' AND public.is_hotel_staff(auth.uid()));

CREATE POLICY "Staff upload whatsapp attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'whatsapp-attachments' AND public.is_hotel_staff(auth.uid()));

CREATE POLICY "Staff update whatsapp attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'whatsapp-attachments' AND public.is_hotel_staff(auth.uid()))
WITH CHECK (bucket_id = 'whatsapp-attachments' AND public.is_hotel_staff(auth.uid()));

CREATE POLICY "Staff delete whatsapp attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'whatsapp-attachments' AND public.is_hotel_staff(auth.uid()));
