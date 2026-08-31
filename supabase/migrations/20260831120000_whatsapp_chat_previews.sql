-- Sidebar previews: latest row per sender, computed server-side.
--
-- The sidebar previously selected the WHOLE "Chat History" table ordered by
-- created_at desc; PostgREST's 1000-row clamp meant only conversations present
-- in the newest 1,000 rows could ever appear — measured 2026-08-31: 182 of
-- 3,983 conversations visible (95.4% invisible). fetchAllRows was measured and
-- rejected (36,525 rows / ~25.7 MB / 37 requests). DISTINCT ON needs the index
-- below to avoid a 15 MB external merge sort (209 ms measured without it).
--
-- SECURITY INVOKER: "Chat History" RLS (is_hotel_staff) applies to the caller,
-- so staff get rows, anon/non-staff get none. The function is ALSO revoked from
-- anon/PUBLIC as belt-and-braces. NOTE: PostgREST clamps SETOF results at 1000
-- like any response — the frontend pages this via p_limit/p_offset (.range).

CREATE INDEX IF NOT EXISTS idx_chat_history_sender_created
  ON public."Chat History" ("Sender Number", created_at DESC);

CREATE OR REPLACE FUNCTION public.whatsapp_chat_previews(
  p_limit int DEFAULT 400,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  sender_number text,
  name text,
  preview text,
  has_media boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM (
    SELECT DISTINCT ON ("Sender Number")
      "Sender Number" AS sender_number,
      "Name" AS name,
      -- Newest-writer-first preview: an operator reply must show, not blank.
      COALESCE(
        NULLIF(human_reply, ''),
        NULLIF("Ai Reply", ''),
        NULLIF("Sender Message", '')
      ) AS preview,
      -- Blank-ish Media ("" / "\n" junk) does not count as media; mirrors
      -- src/lib/whatsappMedia.ts.
      (length(regexp_replace(COALESCE("Media"::text, ''), '[^a-zA-Z0-9]', '', 'g')) > 0) AS has_media,
      created_at
    FROM public."Chat History"
    WHERE COALESCE(is_archived, false) = false
      AND "Sender Number" IS NOT NULL
    ORDER BY "Sender Number", created_at DESC
  ) latest
  ORDER BY created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

REVOKE EXECUTE ON FUNCTION public.whatsapp_chat_previews(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_chat_previews(int, int) TO authenticated, service_role;
