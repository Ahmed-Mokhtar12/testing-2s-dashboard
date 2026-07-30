-- DO NOT APPLY YET. This migration must be applied ONLY after the user has
-- reviewed both manual test-send emails (mode:'test', 'monthly' and
-- 'reminder' reports) and explicitly approved go-live. It is committed now
-- so the schedule definition is version-controlled ahead of that approval,
-- but it is intentionally left unapplied until then.
--
-- Hourly heartbeat for training report emails. The function itself decides
-- what (if anything) is due — Dubai date logic, idempotent via report_runs,
-- retries across the grace window. Anon bearer is sufficient by design: the
-- endpoint is idempotent, fixed-recipient, and returns no data (same trust
-- model as whatsapp-auto-release).
select cron.schedule(
  'training-report-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/training-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljemNlYmZhcWVybHdmYWxyYmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0ODE1MTcsImV4cCI6MjA2MTA1NzUxN30.fcVru8vxui_Jsuv1O8J7vh-Yn4dCcvPQ9UaOFZNjjQI'
    ),
    body := '{"mode":"cron"}'::jsonb
  ) as request_id;
  $$
);
