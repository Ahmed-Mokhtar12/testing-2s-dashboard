-- Allow public read access to dashboard analytics tables (no PII concerns for these aggregate/operational tables)

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read reviews"
  ON public.reviews FOR SELECT
  USING (true);

ALTER TABLE public.welcome_message_success_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read welcome_message_success_log"
  ON public.welcome_message_success_log FOR SELECT
  USING (true);

ALTER TABLE public."Two Seasons Competitor Hotel room Rates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read competitor rates"
  ON public."Two Seasons Competitor Hotel room Rates" FOR SELECT
  USING (true);

ALTER TABLE public.social_engagement_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read social_engagement_logs"
  ON public.social_engagement_logs FOR SELECT
  USING (true);

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read email_threads"
  ON public.email_threads FOR SELECT
  USING (true);

ALTER TABLE public.info_email_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read info_email_audit_log"
  ON public.info_email_audit_log FOR SELECT
  USING (true);