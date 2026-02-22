-- Meeting Analytics: pg_cron schedules for automated report delivery
-- Daily report check at 8:00 AM UTC
SELECT cron.schedule(
  'meeting-analytics-daily-reports',
  '0 8 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/meeting-analytics-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'x-cron-secret', current_setting('app.settings.cron_secret')
    ),
    body := jsonb_build_object('type', 'daily')
  )$$
);

-- Weekly report check on Mondays at 9:00 AM UTC
SELECT cron.schedule(
  'meeting-analytics-weekly-reports',
  '0 9 * * 1',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/meeting-analytics-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'x-cron-secret', current_setting('app.settings.cron_secret')
    ),
    body := jsonb_build_object('type', 'weekly')
  )$$
);
