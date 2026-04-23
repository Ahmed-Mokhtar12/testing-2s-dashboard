CREATE OR REPLACE FUNCTION public.is_conversation_human_controlled(p_sender_number text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT is_human_controlled
      FROM public."Chat History"
      WHERE "Sender Number" = p_sender_number
      ORDER BY created_at DESC
      LIMIT 1
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_conversation_human_controlled(text) TO anon, authenticated, service_role;