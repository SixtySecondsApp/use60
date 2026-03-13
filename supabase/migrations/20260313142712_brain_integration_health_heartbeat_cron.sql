-- Migration: brain_integration_health_heartbeat_cron
-- Date: 20260313142712
--
-- What this migration does:
--   Schedules a pg_cron job to invoke integration-health-heartbeat every 2 hours at :15.
--
-- Rollback strategy:
--   SELECT cron.unschedule('brain-integration-health-heartbeat');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule if exists (idempotent)
SELECT cron.unschedule('brain-integration-health-heartbeat')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'brain-integration-health-heartbeat'
);

-- Schedule: every 2 hours at :15
SELECT cron.schedule(
  'brain-integration-health-heartbeat',
  '15 */2 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.system_config WHERE key = 'supabase_url') || '/functions/v1/integration-health-heartbeat',
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
