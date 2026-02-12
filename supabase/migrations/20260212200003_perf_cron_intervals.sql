-- Migration: Performance optimization — reduce cron frequencies
-- Date: 2026-02-12
--
-- Changes:
-- 1. auto-join-scheduler: 2 min → 5 min (saves ~1,500 requests/day)
-- 2. poll-gladia-jobs: 3 min → 5 min (saves ~160 requests/day, aligns with other pollers)

-- =============================================================================
-- 1. auto-join-scheduler: */2 → */5
-- =============================================================================
DO $$
BEGIN
  PERFORM cron.unschedule('auto-join-scheduler');
EXCEPTION WHEN OTHERS THEN
  NULL; -- Job doesn't exist, ignore
END $$;

SELECT cron.schedule(
  'auto-join-scheduler',
  '*/5 * * * *',
  $$SELECT public.call_auto_join_scheduler()$$
);

-- =============================================================================
-- 2. poll-gladia-jobs: */3 → */5
-- =============================================================================
DO $$
BEGIN
  PERFORM cron.unschedule('poll-gladia-jobs');
EXCEPTION WHEN OTHERS THEN
  NULL; -- Job doesn't exist, ignore
END $$;

SELECT cron.schedule(
  'poll-gladia-jobs',
  '*/5 * * * *',
  $$SELECT public.call_poll_gladia_jobs()$$
);
