-- ============================================================================
-- Migration: Schedule CC Auto-Execute Cron Job
-- Purpose: Register cron that triggers cc-auto-execute every 15 minutes
--          during business hours (8am-6pm UTC, Monday-Friday) so the
--          Command Centre auto-executes high-confidence approved actions.
-- Story: CC12-001
-- Date: 2026-02-22
-- ============================================================================

-- Wrapper function: calls cc-auto-execute via call_proactive_edge_function
CREATE OR REPLACE FUNCTION public.cron_cc_auto_execute()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function(
    'cc-auto-execute',
    '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.cron_cc_auto_execute IS
  'Cron job: Command Centre auto-execute (every 15 min, 08:00–18:00 UTC, Mon–Fri). '
  'Picks up approved Command Centre items with high-confidence actions and '
  'executes them autonomously (send follow-up, log activity, update deal stage, etc.).';

-- Unschedule if already exists (idempotent re-run)
DO $$
BEGIN
  PERFORM cron.unschedule('cc-auto-execute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule: every 15 minutes during business hours (8am-6pm UTC, Mon-Fri)
SELECT cron.schedule(
  'cc-auto-execute',
  '*/15 8-17 * * 1-5',   -- every 15 min, 08:00–17:45 UTC, Monday–Friday
  $$SELECT public.cron_cc_auto_execute()$$
);

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222700005_schedule_cc_auto_execute_cron.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: CC12-001';
  RAISE NOTICE '';
  RAISE NOTICE 'Cron job registered:';
  RAISE NOTICE '  - Name:     cc-auto-execute';
  RAISE NOTICE '  - Schedule: */15 8-17 * * 1-5  (every 15 min, 08:00–17:45 UTC, Mon–Fri)';
  RAISE NOTICE '  - Function: cron_cc_auto_execute()';
  RAISE NOTICE '  - Calls:    cc-auto-execute edge function';
  RAISE NOTICE '';
  RAISE NOTICE 'Execution window:';
  RAISE NOTICE '  08:00–17:45 UTC Monday–Friday (aligns with business hours 8am-6pm UTC).';
  RAISE NOTICE '  Cron hour range 8-17 fires ticks at :00, :15, :30, :45 within each hour,';
  RAISE NOTICE '  giving up to 40 execution opportunities per business day.';
  RAISE NOTICE '';
  RAISE NOTICE 'What cc-auto-execute does:';
  RAISE NOTICE '  - Polls open Command Centre items with status = approved / auto_approved';
  RAISE NOTICE '  - Executes high-confidence actions autonomously (send email, log activity,';
  RAISE NOTICE '    update deal stage, create task, post Slack notification, etc.)';
  RAISE NOTICE '  - Marks item as executed / failed with outcome metadata';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
