-- ============================================================================
-- BA-004b: Commitment Deadline Alerts — Daily Cron Schedule
--
-- What this migration does:
--   Schedules check-commitment-deadlines to run daily at 09:00 UTC.
--   The function scans for overdue/approaching commitments, sends Slack
--   alerts into each user's daily thread, and creates command_centre_items.
--
-- Rollback strategy:
--   SELECT cron.unschedule('check-commitment-deadlines');
--   DROP FUNCTION IF EXISTS public.cron_check_commitment_deadlines();
--
-- Uses call_proactive_edge_function() which injects CRON_SECRET.
-- ============================================================================

-- Wrapper function called by pg_cron
CREATE OR REPLACE FUNCTION public.cron_check_commitment_deadlines()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function('check-commitment-deadlines', '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.cron_check_commitment_deadlines IS
  'Cron job: Check commitment deadlines daily at 09:00 UTC (BA-004b). '
  'Scans deal_memory_events for overdue/approaching commitments, '
  'sends Slack alerts into daily threads, and creates CC items.';

-- Unschedule if it already exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('check-commitment-deadlines');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule daily at 09:00 UTC
SELECT cron.schedule(
  'check-commitment-deadlines',
  '0 9 * * *',
  $$SELECT public.cron_check_commitment_deadlines()$$
);
