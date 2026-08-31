-- Sidebar previews: latest row per sender + per-operator unread counts,
-- computed server-side.
--
-- The sidebar previously selected the whole "Chat History" table ordered by
-- created_at desc; PostgREST's 1000-row clamp meant only conversations present
-- in the newest 1,000 rows could ever appear — measured 2026-08-31: 182 of
-- 3,983 conversations visible (95.4% invisible). fetchAllRows was measured and
-- rejected (36,525 rows / ~25.7 MB / 37 requests). DISTINCT ON needs the index
-- below to avoid a 15 MB external merge sort (209 ms measured without it).
--
-- Unread counts are computed HERE, not client-side — counting rows-after-
-- watermark in the browser would re-create the same clamp bug (Phase-2 plan,
-- codex/plan-review demand). Unread = guest messages (non-empty
-- "Sender Message") newer than the operator's per-conversation watermark;
-- AI/human replies and takeover/release marker rows never count. A
-- conversation with no watermark counts every guest message ever — true
-- "never opened" semantics; the client caps the badge display.
--
-- whatsapp_read_state is dashboard-only: n8n never reads or writes it, and
-- nothing here touches any column n8n writes (additive objects only).
--
-- OPERATOR NOTE (apply in a quiet window): the plain CREATE INDEX takes a
-- SHARE lock on "Chat History" that queues n8n's INSERT/claim traffic for the
-- build duration — seconds at ~36k rows, but schedule it, don't just run it.
--
-- SECURITY INVOKER: "Chat History" RLS (is_hotel_staff) applies to the caller,
-- so staff get rows, anon/non-staff get none; auth.uid() scopes read state to
-- the calling operator. NOTE: PostgREST clamps SETOF results at 1000 like any
-- response — the frontend pages this via p_limit/p_offset (.range).

CREATE INDEX IF NOT EXISTS idx_chat_history_sender_created
  ON public."Chat History" ("Sender Number", created_at DESC);

-- Per-operator read watermarks (Phase-2 item 2.9).
CREATE TABLE IF NOT EXISTS public.whatsapp_read_state (
  operator_id uuid NOT NULL DEFAULT auth.uid(),
  sender_number text NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, sender_number)
);

ALTER TABLE public.whatsapp_read_state ENABLE ROW LEVEL SECURITY;

-- Blanket default grants would otherwise let anon at it (this repo's own
-- hard-won lesson) — revoke, then grant narrowly; RLS scopes authenticated.
REVOKE ALL ON public.whatsapp_read_state FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_read_state TO authenticated, service_role;

DROP POLICY IF EXISTS "Operators manage their own read state" ON public.whatsapp_read_state;
CREATE POLICY "Operators manage their own read state"
ON public.whatsapp_read_state
FOR ALL TO authenticated
USING (operator_id = auth.uid() AND public.is_hotel_staff(auth.uid()))
WITH CHECK (operator_id = auth.uid() AND public.is_hotel_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.whatsapp_chat_previews(
  p_limit int DEFAULT 400,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  sender_number text,
  name text,
  preview text,
  has_media boolean,
  created_at timestamptz,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT latest.*, COALESCE(unread.unread_count, 0) AS unread_count
  FROM (
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
  LEFT JOIN LATERAL (
    SELECT count(*) AS unread_count
    FROM public."Chat History" ch
    WHERE ch."Sender Number" = latest.sender_number
      AND COALESCE(ch.is_archived, false) = false
      AND NULLIF(ch."Sender Message", '') IS NOT NULL
      AND ch.created_at > COALESCE(
        (SELECT rs.last_read_at
         FROM public.whatsapp_read_state rs
         WHERE rs.operator_id = auth.uid()
           AND rs.sender_number = latest.sender_number),
        'epoch'::timestamptz
      )
  ) unread ON true
  ORDER BY latest.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

REVOKE EXECUTE ON FUNCTION public.whatsapp_chat_previews(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_chat_previews(int, int) TO authenticated, service_role;
