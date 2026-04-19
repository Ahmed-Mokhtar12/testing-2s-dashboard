-- 1. website_chats: drop 4 incorrect public policies, create unified service_role policy
DROP POLICY IF EXISTS "Service role can read website chats" ON public.website_chats;
DROP POLICY IF EXISTS "Service role can insert website chats" ON public.website_chats;
DROP POLICY IF EXISTS "Service role can update website chats" ON public.website_chats;
DROP POLICY IF EXISTS "Service role can delete website chats" ON public.website_chats;

CREATE POLICY "Service role full access to website_chats"
ON public.website_chats
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. Chat History: tighten UPDATE policy to service_role only
DROP POLICY IF EXISTS "Service role can update Chat History" ON public."Chat History";

CREATE POLICY "Service role can update Chat History"
ON public."Chat History"
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Realtime: remove sensitive tables from publication
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'website_chat_sessions',
    'website_email_threads',
    'burst_email',
    'burst_social_dm',
    'email_threads',
    'burst_messaging',
    'website_chat_messages',
    'website_burst_whatsapp_message'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Enable RLS + service_role policies on sensitive tables
ALTER TABLE public.website_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.burst_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.burst_social_dm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.burst_messaging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_burst_whatsapp_message ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.website_chat_sessions;
CREATE POLICY "Service role full access" ON public.website_chat_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.website_email_threads;
CREATE POLICY "Service role full access" ON public.website_email_threads FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.burst_email;
CREATE POLICY "Service role full access" ON public.burst_email FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.burst_social_dm;
CREATE POLICY "Service role full access" ON public.burst_social_dm FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.email_threads;
CREATE POLICY "Service role full access" ON public.email_threads FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.burst_messaging;
CREATE POLICY "Service role full access" ON public.burst_messaging FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.website_chat_messages;
CREATE POLICY "Service role full access" ON public.website_chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.website_burst_whatsapp_message;
CREATE POLICY "Service role full access" ON public.website_burst_whatsapp_message FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Storage: UPDATE policy for documents bucket (own folder)
DROP POLICY IF EXISTS "Users can update files in own documents folder" ON storage.objects;
CREATE POLICY "Users can update files in own documents folder"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Fix search_path on functions
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

-- 6. Fix match_documents: correct filter logic + search_path
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector,
  match_count integer DEFAULT 6,
  filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
$function$;

-- 7. Fix N8N_2S function: same correct filter logic + search_path
CREATE OR REPLACE FUNCTION public."N8N_2S"(
  filter jsonb,
  match_count integer,
  query_embedding vector
)
RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
  limit match_count;
end;
$function$;