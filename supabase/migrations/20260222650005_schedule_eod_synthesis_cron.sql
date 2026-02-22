-- ============================================================================
-- Migration: Schedule EOD Synthesis Cron Job
-- Purpose: Register a 15-minute cron job that fires agent-eod-synthesis.
--          Runs every 15 minutes to catch users across all timezones whose
--          EOD delivery time (from user_time_preferences) falls within the
--          current window.
-- Story: EOD-007
-- Date: 2026-02-22
-- DEPENDS ON: EOD-001 (user_time_preferences table)
-- ============================================================================

-- ============================================================================
-- Wrapper function: calls agent-eod-synthesis via call_proactive_edge_function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cron_eod_synthesis()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function(
    'agent-eod-synthesis',
    '{"action": "deliver"}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.cron_eod_synthesis IS
  'Cron job: Fires agent-eod-synthesis every 15 minutes to deliver EOD synthesis to users whose eod_time (from user_time_preferences) falls within the current 15-minute window. Timezone-aware — handles users across all time zones.';

-- ============================================================================
-- Register cron: every 15 minutes, every day
-- ============================================================================

-- Unschedule if exists (idempotent re-run)
DO $$
BEGIN
  PERFORM cron.unschedule('eod-synthesis-delivery');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule: every 15 minutes, every day of the week
-- The edge function handles timezone-aware eligibility filtering internally.
-- Running every 15 minutes ensures no user misses their delivery window
-- regardless of their timezone offset.
SELECT cron.schedule(
  'eod-synthesis-delivery',
  '*/15 * * * *',  -- every 15 minutes
  $$SELECT public.cron_eod_synthesis()$$
);

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222600005_schedule_eod_synthesis_cron.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: EOD-007';
  RAISE NOTICE '';
  RAISE NOTICE 'Cron job registered:';
  RAISE NOTICE '  - Name:     eod-synthesis-delivery';
  RAISE NOTICE '  - Schedule: */15 * * * *  (every 15 minutes, all days)';
  RAISE NOTICE '  - Function: cron_eod_synthesis()';
  RAISE NOTICE '  - Calls:    agent-eod-synthesis edge function (action=deliver)';
  RAISE NOTICE '';
  RAISE NOTICE 'Timing rationale:';
  RAISE NOTICE '  15-minute resolution matches the delivery window in the edge function.';
  RAISE NOTICE '  Users with eod_time=17:00 in their timezone will be served when';
  RAISE NOTICE '  the cron fires at 17:00-17:14 local time. The function skips users';
  RAISE NOTICE '  who already received a delivery for today (idempotent).';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
