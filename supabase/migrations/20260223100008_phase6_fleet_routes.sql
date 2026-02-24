-- ============================================================================
-- CTI-012: Phase 6 Fleet Event Routes & Cron Schedules
-- Phase 6: Coaching & Team Intelligence — PRD-19/20/21
-- ============================================================================

-- ============================================================================
-- 1. Enhanced Coaching Digest Sequence (PRD-19)
--    Extends the coaching_weekly sequence with Phase 6 steps
-- ============================================================================

-- Update the coaching_weekly sequence definition to include pipeline patterns,
-- competitive trends, and org learning steps.
-- The sequence definition is stored as a JSONB steps array — we upsert the full
-- enhanced version.
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES
  (NULL, 'coaching_weekly_enhanced', 1, '[
    {
      "skill": "aggregate-weekly-metrics",
      "requires_context": ["org_id", "user_id"],
      "requires_approval": false,
      "criticality": "required",
      "available": true,
      "depends_on": [],
      "timeout_ms": 60000
    },
    {
      "skill": "correlate-win-loss",
      "requires_context": ["org_id", "user_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["aggregate-weekly-metrics"],
      "timeout_ms": 60000
    },
    {
      "skill": "fetch-pipeline-patterns",
      "requires_context": ["org_id", "user_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["correlate-win-loss"],
      "timeout_ms": 30000
    },
    {
      "skill": "fetch-competitive-trends",
      "requires_context": ["org_id", "user_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["correlate-win-loss"],
      "timeout_ms": 30000
    },
    {
      "skill": "fetch-org-learning",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["correlate-win-loss"],
      "timeout_ms": 30000
    },
    {
      "skill": "generate-coaching-digest",
      "requires_context": ["org_id", "user_id"],
      "requires_approval": false,
      "criticality": "required",
      "available": true,
      "depends_on": ["fetch-pipeline-patterns", "fetch-competitive-trends", "fetch-org-learning"],
      "timeout_ms": 60000
    },
    {
      "skill": "deliver-coaching-slack",
      "requires_context": ["org_id", "user_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["generate-coaching-digest"],
      "timeout_ms": 15000
    }
  ]'::JSONB,
  '["org_id", "user_id"]'::JSONB,
  true)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET
  steps      = EXCLUDED.steps,
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- Route: enhanced coaching digest (Friday, configurable via agent_config)
INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  (NULL, 'cron.coaching_digest_enhanced', 'coaching_weekly_enhanced', 5, NULL, true)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- ============================================================================
-- 2. Forecast Calibration Route (PRD-21)
--    Runs Monday 5:30am UTC, after the pipeline snapshot (5:00am)
-- ============================================================================

INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  (NULL, 'cron.forecast_calibration', 'forecast_calibration_batch', 5, NULL, true)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- Sequence for forecast calibration (single step — snapshot function handles calibration)
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES
  (NULL, 'forecast_calibration_batch', 1, '[
    {
      "skill": "compute-forecast-calibration",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "required",
      "available": true,
      "depends_on": [],
      "timeout_ms": 60000
    }
  ]'::JSONB,
  '["org_id"]'::JSONB,
  true)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET
  steps      = EXCLUDED.steps,
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- Cron job: forecast calibration (Monday 5:30am UTC, after pipeline snapshot)
SELECT cron.schedule(
  'forecast_calibration_weekly',
  '30 5 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/agent-pipeline-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body := '{"action": "snapshot"}'::jsonb,
    timeout_milliseconds := 90000
  );
  $$
);

-- ============================================================================
-- 3. Summary of all Phase 6 cron schedules
-- ============================================================================
-- | Schedule                    | Cron Expression  | Function                  |
-- |-----------------------------|------------------|---------------------------|
-- | coaching_weekly             | Existing (Fri)   | coaching-analysis         |
-- | coaching_digest_enhanced    | Fri (configurable)| coaching-analysis + Phase6|
-- | org_learning_weekly         | 0 6 * * 0 (Sun)  | agent-org-learning        |
-- | forecast_calibration_weekly | 30 5 * * 1 (Mon) | agent-pipeline-snapshot   |
-- | pipeline_snapshot           | 0 5 * * 1 (Mon)  | agent-pipeline-snapshot   |
