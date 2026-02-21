-- ============================================================================
-- Migration: Schedule CC Daily Cleanup Cron Job
-- Purpose: Register daily cron that triggers cc-daily-cleanup at 6:00 AM UTC,
--          before the morning briefing cycle so briefings see fresh scores.
-- Story: CC9-004
-- Date: 2026-02-22
-- DEPENDS ON: CC8-001 (command_centre_items table)
-- ============================================================================

-- Wrapper function: calls cc-daily-cleanup via call_proactive_edge_function
CREATE OR REPLACE FUNCTION public.cron_cc_daily_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function(
    'cc-daily-cleanup',
    '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.cron_cc_daily_cleanup IS
  'Cron job: Daily Command Centre cleanup (6:00 AM UTC). Re-checks stale items '
  '(>24h old), auto-resolves items where deal closed/contact responded, '
  'then re-scores ALL open items via the prioritisation engine.';

-- Unschedule if already exists (idempotent re-run)
DO $$
BEGIN
  PERFORM cron.unschedule('cc-daily-cleanup');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule: daily at 6:00 AM UTC
-- Runs before proactive-morning-brief (7:00 AM) so briefings see fresh scores.
SELECT cron.schedule(
  'cc-daily-cleanup',
  '0 6 * * *',   -- 6:00 AM UTC, every day
  $$SELECT public.cron_cc_daily_cleanup()$$
);

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222600004_schedule_cc_cleanup_cron.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: CC9-004';
  RAISE NOTICE '';
  RAISE NOTICE 'Cron job registered:';
  RAISE NOTICE '  - Name:     cc-daily-cleanup';
  RAISE NOTICE '  - Schedule: 0 6 * * *  (every day at 06:00 UTC)';
  RAISE NOTICE '  - Function: cron_cc_daily_cleanup()';
  RAISE NOTICE '  - Calls:    cc-daily-cleanup edge function';
  RAISE NOTICE '';
  RAISE NOTICE 'Cleanup phases:';
  RAISE NOTICE '  Phase 1 — Stale check (items open >24h):';
  RAISE NOTICE '    - Deal closed (Closed Won / Closed Lost) → auto_resolved';
  RAISE NOTICE '    - deal_action where close_date passed    → auto_resolved';
  RAISE NOTICE '    - follow_up/outreach where contact has';
  RAISE NOTICE '      newer activity than CC item            → auto_resolved';
  RAISE NOTICE '';
  RAISE NOTICE '  Phase 2 — Re-score ALL open items:';
  RAISE NOTICE '    - Recalculates priority_score, priority_factors, urgency';
  RAISE NOTICE '    - Uses calculatePriority() + scoreToUrgency()';
  RAISE NOTICE '    - Processes in pages of 500, updates in chunks of 50 parallel';
  RAISE NOTICE '';
  RAISE NOTICE 'Timing rationale:';
  RAISE NOTICE '  06:00 UTC — after weekly-pipeline-snapshot (Mon 05:00)';
  RAISE NOTICE '  and before proactive-morning-brief delivery (~07:00).';
  RAISE NOTICE '  Ensures morning briefings always use fresh priority scores.';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
