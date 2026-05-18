SELECT cron.schedule(
  'whatsapp-auto-release',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/whatsapp-auto-release',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
               ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
