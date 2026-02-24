-- ============================================================================
-- Migration: EOD Synthesis Fleet Routes & Sequence Definition
-- Purpose: Register fleet event route and 5-step sequence for the end-of-day
--          synthesis pipeline. Triggered by cron.eod_synthesis (fired every
--          15 minutes by the timezone-aware cron wrapper).
-- Story: EOD-007
-- Date: 2026-02-22
-- DEPENDS ON: EOD-001 (user_time_preferences, eod_deliveries tables)
--             EOD-002 (agent_config_defaults for eod_synthesis)
--             EOD-006 (buildEODSynthesisMessage + Slack handlers)
--             PRD-02  (fleet_event_routes, fleet_sequence_definitions tables)
-- ============================================================================

-- ============================================================================
-- 1. Event Route — cron.eod_synthesis → eod_synthesis sequence
-- ============================================================================

INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES (
  NULL,
  'cron.eod_synthesis',
  'eod_synthesis',
  0,
  NULL,
  true
)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- ============================================================================
-- 2. Sequence Definition — eod_synthesis (5 steps)
--
-- Steps:
--   1. aggregate-scorecard     — calls get_daily_scorecard() RPC (critical)
--   2. detect-open-items       — eodOpenItemsAdapter (best-effort)
--   3. build-tomorrow-preview  — eodTomorrowPreviewAdapter (best-effort)
--   4. generate-overnight-plan — eodOvernightPlanAdapter (best-effort)
--   5. deliver-eod-slack       — sends Slack DM + writes eod_deliveries (critical)
--
-- Steps 2-4 run in parallel (no depends_on each other). Step 5 waits for all.
-- Only step 5 is critical — if scorecard or previews fail, we still deliver
-- what we have rather than silently dropping the entire message.
-- ============================================================================

INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES (
  NULL,
  'eod_synthesis',
  1,
  '[
    {
      "skill": "aggregate-scorecard",
      "requires_context": [],
      "requires_approval": false,
      "criticality": "critical",
      "available": true,
      "depends_on": [],
      "timeout_ms": 30000
    },
    {
      "skill": "eod-open-items",
      "requires_context": [],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 20000
    },
    {
      "skill": "eod-tomorrow-preview",
      "requires_context": [],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 20000
    },
    {
      "skill": "eod-overnight-plan",
      "requires_context": [],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 15000
    },
    {
      "skill": "deliver-eod-slack",
      "requires_context": ["tier1"],
      "requires_approval": false,
      "criticality": "critical",
      "available": true,
      "depends_on": ["aggregate-scorecard", "eod-open-items", "eod-tomorrow-preview", "eod-overnight-plan"],
      "timeout_ms": 30000
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
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222600004_eod_synthesis_fleet_routes.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: EOD-007';
  RAISE NOTICE '';
  RAISE NOTICE 'Fleet routes registered:';
  RAISE NOTICE '  - event_type:    cron.eod_synthesis';
  RAISE NOTICE '  - sequence_key:  eod_synthesis';
  RAISE NOTICE '';
  RAISE NOTICE 'Sequence steps:';
  RAISE NOTICE '  1. aggregate-scorecard      (critical, 30s)  — calls get_daily_scorecard() RPC';
  RAISE NOTICE '  2. eod-open-items           (best-effort, 20s) — pending replies, overdue tasks';
  RAISE NOTICE '  3. eod-tomorrow-preview     (best-effort, 20s) — calendar preview for tomorrow';
  RAISE NOTICE '  4. eod-overnight-plan       (best-effort, 15s) — agent overnight work plan';
  RAISE NOTICE '  5. deliver-eod-slack        (critical, 30s)  — Slack DM + eod_deliveries write';
  RAISE NOTICE '';
  RAISE NOTICE '  Steps 1-4 can run in parallel (steps 2-4 have no depends_on constraints).';
  RAISE NOTICE '  Step 5 waits for all upstream steps before delivering.';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
