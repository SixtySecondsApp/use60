-- ============================================================================
-- Migration: Deal Temperature Threshold Alerts — Fleet Routes & Sequences
-- Purpose: Wire deal temperature threshold crossing events into the fleet
--          orchestrator for Slack alert delivery
-- Story: SIG-009
-- Date: 2026-02-22
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fleet Event Route
-- ---------------------------------------------------------------------------

INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  -- Fired by agent-deal-temperature when temperature crosses a threshold
  (NULL, 'deal_temperature.threshold_crossed', 'deal_temperature_alert', 0, NULL, true)

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
  -- deal_temperature_alert — 1-step: Slack DM to deal owner
  --   Triggered when a deal's temperature crosses a threshold (30 or 60).
  --   Delivers heating-up or cooling-down alert via dealTemperatureSlack
  --   adapter with 48-hour cooldown per deal.
  -- -----------------------------------------------------------------
  (NULL, 'deal_temperature_alert', 1, '[
    {
      "skill": "deliver-temperature-alert",
      "requires_context": ["org_id", "deal_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 30000
    }
  ]'::JSONB,
  '["org_id", "deal_id"]'::JSONB,
  true)

ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET
  steps                = EXCLUDED.steps,
  context_requirements = EXCLUDED.context_requirements,
  is_active            = EXCLUDED.is_active,
  updated_at           = NOW();

-- ---------------------------------------------------------------------------
-- Done
-- ---------------------------------------------------------------------------
