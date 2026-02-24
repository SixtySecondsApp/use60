-- Migration: Schedule auto-join-scheduler via pg_cron
-- Date: 2026-01-22
--
-- Purpose:
-- - Ensure the auto-join scheduler actually runs (every 15 minutes) to deploy bots to upcoming meetings.
--
-- Notes:
-- - The helper function `public.call_auto_join_scheduler()` already exists in baseline schema.
-- - This migration is idempotent: it unschedules any existing job with the same name before scheduling.
--
-- Setup required:
-- - Add `service_role_key` to Supabase Vault (used by call_auto_join_scheduler).
--   Dashboard → Settings → Vault → New Secret
--   Name: service_role_key
--   Value: <project service role key>
--
-- Alternative:
-- - Use Supabase Dashboard → Edge Functions → auto-join-scheduler → Schedule.

DO $$
BEGIN
  -- If the job exists, remove it to avoid duplicates.
  PERFORM cron.unschedule('auto-join-scheduler');
EXCEPTION WHEN OTHERS THEN
  -- Job doesn't exist (or pg_cron not available), ignore.
  NULL;
END $$;

-- Run every 2 minutes (matches auto-join-scheduler logic: small lead-time windows)
SELECT cron.schedule(
  'auto-join-scheduler',
  '*/2 * * * *',
  $$SELECT public.call_auto_join_scheduler()$$
);

