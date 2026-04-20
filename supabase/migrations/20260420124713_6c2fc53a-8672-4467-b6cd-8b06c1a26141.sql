-- Ensure full row data is sent on updates/deletes
ALTER TABLE public."Chat History" REPLICA IDENTITY FULL;
ALTER TABLE public.reviews REPLICA IDENTITY FULL;
ALTER TABLE public.welcome_message_success_log REPLICA IDENTITY FULL;

-- Add tables to the realtime publication (idempotent)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Chat History";
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.welcome_message_success_log;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;