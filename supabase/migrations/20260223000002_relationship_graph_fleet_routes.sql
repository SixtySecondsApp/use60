-- ============================================================================
-- KNW-003: Relationship Graph Fleet Routes (PRD-16)
-- Phase 5: Knowledge & Memory
-- ============================================================================

-- Event routes: meeting_completed → build relationship graph
INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  (NULL, 'meeting_completed', 'relationship_graph_update', 0, NULL, true),
  (NULL, 'contact_enriched',  'relationship_graph_enrichment', 0, NULL, true)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- Sequence: relationship_graph_update (post-meeting)
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES
  (NULL, 'relationship_graph_update', 1, '[
    {
      "skill": "build-relationship-graph",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 30000
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

-- Sequence: relationship_graph_enrichment (Apollo enrichment)
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES
  (NULL, 'relationship_graph_enrichment', 1, '[
    {
      "skill": "enrich-relationship-graph",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 30000
    }
  ]'::JSONB,
  '["org_id", "contact_id"]'::JSONB,
  true)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET
  steps                = EXCLUDED.steps,
  context_requirements = EXCLUDED.context_requirements,
  is_active            = EXCLUDED.is_active,
  updated_at           = NOW();

-- Cron: weekly batch recalculation (Sunday 3am UTC)
-- Uses pg_cron if available, otherwise handled by fleet scheduler
INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  (NULL, 'cron.relationship_graph_batch', 'relationship_graph_batch', 0, NULL, true)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();
