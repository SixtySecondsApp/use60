-- Migration: check_contact_decay_cron
-- Date: 20260314181726
--
-- What this migration does:
--   Schedules weekly pg_cron job to call check-contact-decay edge function.
--   Runs Sunday 3am UTC (matching the original decay schedule from DM-012).
--   The edge function handles org iteration, decay, and alert delivery.
--
-- Replaces: fleet orchestrator note in 20260225100006_relationship_decay_cron.sql
--
-- Rollback strategy:
--   SELECT cron.unschedule('check-contact-decay');

-- ============================================================================
-- BA-005b: Weekly contact decay + alert delivery (Sunday 3am UTC)
-- ============================================================================

-- Remove old job name if it somehow exists
SELECT cron.unschedule('contact-relationship-decay')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contact-relationship-decay');

-- Remove this job name if re-running migration
SELECT cron.unschedule('check-contact-decay')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-contact-decay');

SELECT cron.schedule(
  'check-contact-decay',
  '0 3 * * 0',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/check-contact-decay',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  )
  $$
);
