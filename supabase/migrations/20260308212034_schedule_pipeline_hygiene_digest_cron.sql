-- Migration: schedule_pipeline_hygiene_digest_cron
-- Date: 20260308212034
--
-- What this migration does:
--   Schedules a weekly pg_cron job (Monday 9am UTC) to send pipeline hygiene digest
--   via the pipeline-hygiene-digest edge function.
--
-- Rollback strategy:
--   SELECT cron.unschedule('pipeline-hygiene-digest');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule if exists (idempotent)
SELECT cron.unschedule('pipeline-hygiene-digest')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'pipeline-hygiene-digest'
);

-- Schedule: Monday 9am UTC (after health score recalc which runs earlier)
SELECT cron.schedule(
  'pipeline-hygiene-digest',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.system_config WHERE key = 'supabase_url') || '/functions/v1/pipeline-hygiene-digest',
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
