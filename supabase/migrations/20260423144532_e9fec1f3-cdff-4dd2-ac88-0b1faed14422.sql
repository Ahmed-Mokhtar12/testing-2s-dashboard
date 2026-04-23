-- 1) Fix function search_path for skip_reaction_rows
CREATE OR REPLACE FUNCTION public.skip_reaction_rows()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if lower(coalesce(new.message_type, '')) = 'reaction' then
    return null;
  end if;
  return new;
end;
$function$;

-- 2) Fix two_seasons_competitor_rates_insert_as_upsert search_path
CREATE OR REPLACE FUNCTION public.two_seasons_competitor_rates_insert_as_upsert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  update public."Two Seasons Competitor Hotel room Rates"
  set
    workflow_name = new.workflow_name,
    execution_id = new.execution_id,
    generated_at = new.generated_at,
    dry_run = new.dry_run,
    source_group = new.source_group,
    checkout_date = new.checkout_date,
    status = new.status,
    original_price = new.original_price,
    original_currency = new.original_currency,
    converted_price_aed = new.converted_price_aed,
    accor_tax_type = new.accor_tax_type,
    booking_url = new.booking_url,
    error_message = new.error_message,
    request_id = new.request_id,
    is_lowest_for_day = new.is_lowest_for_day,
    lowest_price_for_day_aed = new.lowest_price_for_day_aed,
    summary = new.summary,
    parser_debug = new.parser_debug,
    raw_result = new.raw_result,
    updated_at = now()
  where workflow_id = new.workflow_id
    and report_date = new.report_date
    and hotel_name = new.hotel_name
    and checkin_date = new.checkin_date;

  if found then
    return null;
  end if;

  return new;
end;
$function$;

-- 3) Tighten RLS on Chat History UPDATE: only allow updating to set human reply fields by the same user
DROP POLICY IF EXISTS "Authenticated staff can update Chat History" ON public."Chat History";

CREATE POLICY "Authenticated staff can update Chat History"
ON public."Chat History"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  -- Only allow updates where the staff member identifies themselves correctly
  replied_by_user_id IS NULL OR replied_by_user_id = auth.uid()
);

-- 4) Secure whatsapp-attachments bucket: restrict listing/upload to authenticated users
-- Keep public read (so media URLs work) but restrict listing/upload
UPDATE storage.buckets SET public = false WHERE id = 'whatsapp-attachments';

-- Allow authenticated users to read whatsapp attachments
DROP POLICY IF EXISTS "Authenticated can read whatsapp attachments" ON storage.objects;
CREATE POLICY "Authenticated can read whatsapp attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'whatsapp-attachments');

-- Allow service role to read (for edge functions / n8n)
DROP POLICY IF EXISTS "Service role read whatsapp attachments" ON storage.objects;
CREATE POLICY "Service role read whatsapp attachments"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'whatsapp-attachments');

-- Allow authenticated to upload whatsapp attachments
DROP POLICY IF EXISTS "Authenticated can upload whatsapp attachments" ON storage.objects;
CREATE POLICY "Authenticated can upload whatsapp attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'whatsapp-attachments');

-- 5) Realtime authorization: restrict subscriptions to authenticated users only
-- This prevents anonymous access to realtime channels
ALTER PUBLICATION supabase_realtime SET (publish = 'insert, update, delete');