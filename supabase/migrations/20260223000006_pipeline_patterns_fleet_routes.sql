-- ============================================================================
-- KNW-011: Pipeline Patterns Fleet Routes (PRD-18)
-- Phase 5: Knowledge & Memory
-- ============================================================================

-- Event routes: weekly cron → pattern analysis + critical alert delivery
INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  (NULL, 'cron.pipeline_pattern_analysis', 'pipeline_pattern_weekly', 0, NULL, true),
  (NULL, 'pipeline_pattern.critical',       'pipeline_pattern_alert',  0, NULL, true)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- Sequence: pipeline_pattern_weekly (Monday 6am UTC cron)
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES
  (NULL, 'pipeline_pattern_weekly', 1, '[
    {
      "skill": "analyse-pipeline-patterns",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "critical",
      "available": true,
      "depends_on": [],
      "timeout_ms": 60000
    },
    {
      "skill": "deliver-pattern-slack",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["analyse-pipeline-patterns"],
      "timeout_ms": 15000
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

-- Sequence: pipeline_pattern_alert (immediate alert for critical patterns)
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES
  (NULL, 'pipeline_pattern_alert', 1, '[
    {
      "skill": "deliver-pattern-slack",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 15000
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
