-- ============================================================================
-- Migration: Engagement Patterns — Fleet Routes & Cron Schedule
-- Purpose: Wire the weekly engagement-pattern recalculation batch job into
--          the fleet orchestrator and schedule it via pg_cron
-- Story: SIG-004
-- Date: 2026-02-22
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fleet Event Route
-- ---------------------------------------------------------------------------

INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  -- Weekly cron: recalculate all contact engagement patterns across all orgs
  (NULL, 'cron.engagement_patterns_batch', 'engagement_patterns_batch', 0, NULL, true)

ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 2. Fleet Sequence Definition
-- ---------------------------------------------------------------------------

INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES
  -- -----------------------------------------------------------------
  -- engagement_patterns_batch — 1-step weekly batch recalculation
  --   Calls agent-engagement-patterns edge function to recalculate
  --   engagement patterns for all contacts with email activity.
  -- -----------------------------------------------------------------
  (NULL, 'engagement_patterns_batch', 1, '[
    {
      "skill": "agent-engagement-patterns",
      "requires_context": [],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 300000
    }
  ]'::JSONB,
  '["org_id"]'::JSONB,
  true)

ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET
  steps                = EXCLUDED.steps,
  context_requirements = EXCLUDED.context_requirements,
  is_active            = EXCLUDED.is_active,
  updated_at           = NOW();

-- ---------------------------------------------------------------------------
-- 3. pg_cron schedule — Weekly Sunday 2am UTC
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
  'engagement-patterns-weekly-batch',   -- job name (unique)
  '0 2 * * 0',                          -- every Sunday at 02:00 UTC
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/agent-engagement-patterns',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{"mode": "batch"}'::jsonb
    );
  $$
);

-- ---------------------------------------------------------------------------
-- Done
-- ---------------------------------------------------------------------------
