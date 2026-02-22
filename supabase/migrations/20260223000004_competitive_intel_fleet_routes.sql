-- ============================================================================
-- KNW-007: Competitive Intelligence Fleet Routes (PRD-17)
-- Phase 5: Knowledge & Memory
-- ============================================================================

-- Event routes: meeting_completed → extract competitive mentions
INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  (NULL, 'meeting_completed',            'competitive_intel_extraction', 5, NULL, true),
  (NULL, 'email_signal.competitor_mention', 'competitive_intel_email',  0, NULL, true)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- Sequence: competitive_intel_extraction (from meeting transcript)
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES
  (NULL, 'competitive_intel_extraction', 1, '[
    {
      "skill": "extract-competitive-mentions",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 30000
    },
    {
      "skill": "aggregate-competitor-profile",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["extract-competitive-mentions"],
      "timeout_ms": 30000
    },
    {
      "skill": "deliver-competitive-intel-slack",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["extract-competitive-mentions"],
      "timeout_ms": 15000
    }
  ]'::JSONB,
  '["org_id", "meeting_id"]'::JSONB,
  true)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET
  steps                = EXCLUDED.steps,
  context_requirements = EXCLUDED.context_requirements,
  is_active            = EXCLUDED.is_active,
  updated_at           = NOW();

-- Sequence: competitive_intel_email (from email signal)
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES
  (NULL, 'competitive_intel_email', 1, '[
    {
      "skill": "extract-competitive-mentions",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 30000
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
