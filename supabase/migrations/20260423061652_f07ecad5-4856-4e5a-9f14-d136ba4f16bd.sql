
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-attachments', 'whatsapp-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read whatsapp-attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-attachments');

CREATE POLICY "Public upload whatsapp-attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'whatsapp-attachments');

CREATE POLICY "Public update whatsapp-attachments"
ON storage.objects FOR UPDATE
USING (bucket_id = 'whatsapp-attachments');

CREATE POLICY "Public delete whatsapp-attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'whatsapp-attachments');
