-- ============================================================================
-- DM-007: Fleet Event Routes for Deal Memory (PRD-DM-001)
-- ============================================================================
-- Routes the 'meeting_completed' event to a 'deal_memory_extraction' sequence.
--
-- Integration note: slack-post-meeting now calls extractEventsFromMeeting()
-- directly (fire-and-forget) for immediate extraction when the Slack debrief
-- is generated. This fleet route provides the same extraction path for the
-- full orchestrator pipeline once the fleet dispatcher is active.
--
-- Priority 50 — lower than post-meeting analysis (0) and competitive intel (5),
-- so memory extraction runs after the primary post-meeting work completes.
-- ============================================================================

-- Route: meeting_completed → deal memory extraction
INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, is_active)
VALUES (NULL, 'meeting_completed', 'deal_memory_extraction', 50, true)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- Sequence definition: deal_memory_extraction
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES (
  NULL,
  'deal_memory_extraction',
  1,
  '[
    {
      "skill": "extract-deal-memory-events",
      "requires_context": ["org_id", "meeting_id", "deal_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 60000
    }
  ]'::JSONB,
  '["org_id", "meeting_id", "deal_id"]'::JSONB,
  true
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET
  steps                = EXCLUDED.steps,
  context_requirements = EXCLUDED.context_requirements,
  is_active            = EXCLUDED.is_active,
  updated_at           = NOW();
