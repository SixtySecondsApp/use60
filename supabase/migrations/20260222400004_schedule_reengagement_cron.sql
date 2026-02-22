-- ============================================================================
-- PRD-05/06: Re-engagement Agent — Daily Cron Schedule
-- Story: REN-007
--
-- Schedules the re-engagement signal scan to run every day at 06:00 UTC.
-- The cron calls agent-reengagement via call_proactive_edge_function(),
-- which injects CRON_SECRET into the x-cron-secret header.
-- ============================================================================

-- Wrapper function called by pg_cron
CREATE OR REPLACE FUNCTION public.cron_reengagement_scan()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function('agent-reengagement', '{}'::jsonb);
END;
$$;

-- Unschedule if it already exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('reengagement-daily-scan');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule daily at 06:00 UTC
SELECT cron.schedule(
  'reengagement-daily-scan',
  '0 6 * * *',
  $$SELECT public.cron_reengagement_scan()$$
);
