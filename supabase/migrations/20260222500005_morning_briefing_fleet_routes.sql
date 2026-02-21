-- ============================================================================
-- Migration: Enhanced Morning Briefing — Fleet Routes & Sequence
-- Purpose: Register fleet event route and 4-step sequence for the enhanced
--          morning briefing pipeline. Triggered by cron.morning_briefing
--          event (fired by the morning briefing cron wrapper).
-- Story: BRF-008
-- Date: 2026-02-22
-- DEPENDS ON: BRF-007 (upgraded proactive-pipeline-analysis function)
--             PRD-02 (fleet_event_routes, fleet_sequence_definitions tables)
-- ============================================================================

-- ============================================================================
-- 1. Event Route — cron.morning_briefing → enhanced_morning_briefing sequence
-- ============================================================================

INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES (
  NULL,
  'cron.morning_briefing',
  'enhanced_morning_briefing',
  0,
  NULL,
  true
)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- ============================================================================
-- 2. Sequence Definition — enhanced_morning_briefing (4 steps)
--
-- Steps:
--   1. calculate-pipeline-math  — call calculate_pipeline_math() RPC, write snapshot
--   2. detect-quarter-phase     — pure calculation, no DB call
--   3. overnight-summary        — query activities + deal_signal_temperature
--   4. deliver-enhanced-briefing — build Slack message + send
--
-- Each step passes its output to the next via the orchestrator state.outputs map.
-- Steps 2-3 are best-effort (non-blocking failures). Step 4 is critical.
-- ============================================================================

INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES (
  NULL,
  'enhanced_morning_briefing',
  1,
  '[
    {
      "skill": "calculate-pipeline-math",
      "adapter": "calculatePipelineMath",
      "label": "Compute pipeline math and write snapshot",
      "critical": true,
      "timeout_ms": 30000,
      "depends_on": []
    },
    {
      "skill": "detect-quarter-phase",
      "adapter": "detectQuarterPhase",
      "label": "Detect quarter phase and emphasis weights",
      "critical": false,
      "timeout_ms": 5000,
      "depends_on": ["calculate-pipeline-math"]
    },
    {
      "skill": "overnight-summary",
      "adapter": "overnightSummary",
      "label": "Gather overnight work summary",
      "critical": false,
      "timeout_ms": 15000,
      "depends_on": []
    },
    {
      "skill": "deliver-enhanced-briefing",
      "adapter": "deliverEnhancedBriefing",
      "label": "Build and deliver enhanced morning brief via Slack",
      "critical": true,
      "timeout_ms": 30000,
      "depends_on": ["calculate-pipeline-math", "detect-quarter-phase", "overnight-summary"]
    }
  ]'::JSONB,
  '["user_id", "org_id"]'::JSONB,
  true
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET
  steps                = EXCLUDED.steps,
  context_requirements = EXCLUDED.context_requirements,
  is_active            = EXCLUDED.is_active,
  updated_at           = NOW();

-- ============================================================================
-- 3. Cron wrapper function
--    Called by pg_cron daily at delivery_time (08:00 local).
--    Fires cron.morning_briefing for all active org members.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cron_morning_briefing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function(
    'proactive-pipeline-analysis',
    '{"action": "analyze"}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.cron_morning_briefing IS
  'Cron wrapper: fires enhanced proactive-pipeline-analysis for all users (daily at 08:00 UTC). Delivers pipeline math, quarter phase, overnight summary, and top action via Slack.';

-- Unschedule if exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('enhanced-morning-briefing');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule: 08:00 UTC daily (Monday–Friday)
-- Offset from pipeline-weekly-snapshot (Mon 05:00) to ensure snapshots are ready
SELECT cron.schedule(
  'enhanced-morning-briefing',
  '0 8 * * 1-5',   -- 08:00 UTC, Monday–Friday
  $$SELECT public.cron_morning_briefing()$$
);

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222500005_morning_briefing_fleet_routes.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: BRF-008';
  RAISE NOTICE '';
  RAISE NOTICE 'Fleet routes registered:';
  RAISE NOTICE '  - event_type: cron.morning_briefing';
  RAISE NOTICE '  - sequence_key: enhanced_morning_briefing';
  RAISE NOTICE '';
  RAISE NOTICE 'Sequence steps:';
  RAISE NOTICE '  1. calculate-pipeline-math  (critical)    — BRF-003 RPC';
  RAISE NOTICE '  2. detect-quarter-phase     (best-effort) — BRF-004 pure fn';
  RAISE NOTICE '  3. overnight-summary        (best-effort) — BRF-006 adapter';
  RAISE NOTICE '  4. deliver-enhanced-briefing (critical)   — BRF-007 Slack';
  RAISE NOTICE '';
  RAISE NOTICE 'Cron job registered:';
  RAISE NOTICE '  - Name:     enhanced-morning-briefing';
  RAISE NOTICE '  - Schedule: 0 8 * * 1-5  (08:00 UTC, Mon-Fri)';
  RAISE NOTICE '  - Calls:    proactive-pipeline-analysis (action=analyze)';
  RAISE NOTICE '';
  RAISE NOTICE 'Sequence fires after pipeline-weekly-snapshot (Mon 05:00)';
  RAISE NOTICE 'ensuring fresh snapshot data is available for pipeline math.';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
