-- =========================================
-- 1. CLEANUP: Remove broken trigger/function
-- =========================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- =========================================
-- 2. RLS HARDENING — authenticated read only
-- =========================================

-- Helper: drop ALL existing policies on a table, then add a single authenticated-read policy.

-- ----- Chat History -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='Chat History' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public."Chat History"', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public."Chat History" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read Chat History"
  ON public."Chat History" FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can update Chat History"
  ON public."Chat History" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ----- reviews -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='reviews' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.reviews', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read reviews"
  ON public.reviews FOR SELECT TO authenticated USING (true);

-- ----- khaldia_reviews -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='khaldia_reviews' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.khaldia_reviews', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public.khaldia_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read khaldia_reviews"
  ON public.khaldia_reviews FOR SELECT TO authenticated USING (true);

-- ----- email_threads -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='email_threads' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.email_threads', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read email_threads"
  ON public.email_threads FOR SELECT TO authenticated USING (true);

-- ----- welcome_message_success_log -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='welcome_message_success_log' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.welcome_message_success_log', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public.welcome_message_success_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read welcome_message_success_log"
  ON public.welcome_message_success_log FOR SELECT TO authenticated USING (true);

-- ----- info_email_audit_log -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='info_email_audit_log' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.info_email_audit_log', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public.info_email_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read info_email_audit_log"
  ON public.info_email_audit_log FOR SELECT TO authenticated USING (true);

-- ----- social_engagement_logs -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='social_engagement_logs' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.social_engagement_logs', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public.social_engagement_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read social_engagement_logs"
  ON public.social_engagement_logs FOR SELECT TO authenticated USING (true);

-- ----- Two Seasons Competitor Hotel room Rates -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='Two Seasons Competitor Hotel room Rates' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public."Two Seasons Competitor Hotel room Rates"', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public."Two Seasons Competitor Hotel room Rates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read competitor rates"
  ON public."Two Seasons Competitor Hotel room Rates" FOR SELECT TO authenticated USING (true);

-- ----- Sop -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='Sop' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public."Sop"', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public."Sop" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read Sop"
  ON public."Sop" FOR SELECT TO authenticated USING (true);

-- ----- Conducted Training -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='Conducted Training' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public."Conducted Training"', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public."Conducted Training" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read Conducted Training"
  ON public."Conducted Training" FOR SELECT TO authenticated USING (true);

-- ----- conducted_training (lowercase) -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='conducted_training' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.conducted_training', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public.conducted_training ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read conducted_training"
  ON public.conducted_training FOR SELECT TO authenticated USING (true);

-- ----- LongTermMemory -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='LongTermMemory' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public."LongTermMemory"', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public."LongTermMemory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read LongTermMemory"
  ON public."LongTermMemory" FOR SELECT TO authenticated USING (true);

-- ----- N8N_2S -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='N8N_2S' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public."N8N_2S"', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public."N8N_2S" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read N8N_2S"
  ON public."N8N_2S" FOR SELECT TO authenticated USING (true);

-- ----- n8n_chat_histories -----
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='n8n_chat_histories' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.n8n_chat_histories', r.policyname);
  END LOOP;
END $$;
ALTER TABLE public.n8n_chat_histories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read n8n_chat_histories"
  ON public.n8n_chat_histories FOR SELECT TO authenticated USING (true);