-- Migration: add_weekly_hygiene_cron
-- Date: 20260310213641
--
-- What this migration does:
--   Adds pg_cron job for weekly pipeline hygiene digest (Monday 9am UTC).
--   Calls pipeline-hygiene-digest edge function for all orgs.
--
-- Rollback strategy:
--   SELECT cron.unschedule('weekly-pipeline-hygiene');

-- ============================================================================
-- PST-014: Weekly pipeline hygiene digest (Monday 9am UTC)
-- ============================================================================

SELECT cron.schedule(
  'weekly-pipeline-hygiene',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/pipeline-hygiene-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  )
  $$
);
