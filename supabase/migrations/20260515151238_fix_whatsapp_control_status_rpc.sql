CREATE OR REPLACE FUNCTION public.is_conversation_human_controlled(p_sender_number text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN last_takeover.ts IS NULL THEN false
    WHEN last_release.ts IS NULL THEN true
    WHEN last_takeover.ts > last_release.ts THEN true
    ELSE false
  END
  FROM
    (SELECT MAX(created_at) AS ts
     FROM public."Chat History"
     WHERE "Sender Number" = p_sender_number
       AND is_human_controlled = true) AS last_takeover,
    (SELECT MAX(released_to_ai_at) AS ts
     FROM public."Chat History"
     WHERE "Sender Number" = p_sender_number
       AND released_to_ai_at IS NOT NULL) AS last_release;
$$;

GRANT EXECUTE ON FUNCTION public.is_conversation_human_controlled(text)
  TO anon, authenticated, service_role;
