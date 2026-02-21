-- ============================================================================
-- Migration: Schedule Pipeline Snapshot Cron Job
-- Purpose: Register weekly cron that triggers agent-pipeline-snapshot
--          every Monday at 5:00 AM UTC — before the morning briefing cycle.
-- Story: BRF-005
-- Date: 2026-02-22
-- DEPENDS ON: BRF-001 (pipeline_snapshots table)
-- ============================================================================

-- Wrapper function: calls agent-pipeline-snapshot via call_proactive_edge_function
CREATE OR REPLACE FUNCTION public.cron_pipeline_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function(
    'agent-pipeline-snapshot',
    '{"action": "snapshot"}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.cron_pipeline_snapshot IS
  'Cron job: Capture weekly pipeline snapshot for all users (runs every Monday at 5:00 AM UTC, before morning briefing cycle)';

-- Unschedule if already exists (idempotent re-run)
DO $$
BEGIN
  PERFORM cron.unschedule('weekly-pipeline-snapshot');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule: every Monday at 5:00 AM UTC
-- Runs before proactive-meeting-prep (7 AM) and morning briefing delivery
SELECT cron.schedule(
  'weekly-pipeline-snapshot',
  '0 5 * * 1',   -- 5:00 AM UTC, Monday only
  $$SELECT public.cron_pipeline_snapshot()$$
);

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222500004_schedule_pipeline_snapshot_cron.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: BRF-005';
  RAISE NOTICE '';
  RAISE NOTICE 'Cron job registered:';
  RAISE NOTICE '  - Name:     weekly-pipeline-snapshot';
  RAISE NOTICE '  - Schedule: 0 5 * * 1  (every Monday at 05:00 UTC)';
  RAISE NOTICE '  - Function: cron_pipeline_snapshot()';
  RAISE NOTICE '  - Calls:    agent-pipeline-snapshot edge function (action=snapshot)';
  RAISE NOTICE '';
  RAISE NOTICE 'Timing rationale:';
  RAISE NOTICE '  Monday 05:00 UTC — runs before proactive-meeting-prep (07:00)';
  RAISE NOTICE '  and before the morning briefing agent delivery window.';
  RAISE NOTICE '  Ensures fresh snapshot data is available for weekly briefing math.';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
