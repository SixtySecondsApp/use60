-- Migration: schedule_reminders_cron
-- Date: 20260307223925
--
-- What this migration does:
--   Schedules a pg_cron job to process due reminders every minute.
--   Calls the process-reminders edge function via pg_net.
--
-- Rollback strategy:
--   SELECT cron.unschedule('process-reminders');

-- Ensure extensions are available
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule if exists (idempotent)
SELECT cron.unschedule('process-reminders')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-reminders'
);

-- Schedule: every minute, call process-reminders edge function
SELECT cron.schedule(
  'process-reminders',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.system_config WHERE key = 'supabase_url') || '/functions/v1/process-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
      ),
      'x-cron-secret', COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
        'not-set'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
