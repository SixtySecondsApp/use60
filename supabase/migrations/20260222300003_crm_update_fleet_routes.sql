-- ============================================================================
-- PRD-03: Auto CRM Update Agent — Fleet Routes & Sequence Definition
-- Stories: CRM-008
--
-- Registers the crm_update fleet sequence and the meeting_ended → crm_update
-- event route. Adds a handoff from crm_update's slack_notify step to
-- deal_risk_rescore so the risk scorer re-evaluates the deal after CRM writes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Event Route — meeting_ended → crm_update (wave 3, priority 30)
--    Fires alongside the existing platform meeting_ended route (priority 0)
--    but is a distinct sequence_key so both run in parallel.
-- ---------------------------------------------------------------------------

INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  (NULL, 'meeting_ended', 'crm_update', 30, NULL, true)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  priority   = EXCLUDED.priority,
  is_active  = EXCLUDED.is_active,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Sequence Definition — crm_update (5 steps, platform default)
--
-- Step shape matches fleet_seed_data.sql pattern:
--   skill            — skill slug called by the fleet runner adapter
--   requires_context — context tier requirements
--   requires_approval — whether this step needs HITL before execution
--   criticality      — "critical" | "best-effort"
--   available        — runtime availability flag
--   depends_on       — upstream skill slugs that must complete first
--
-- Execution order (wave-aware):
--   Wave 1: extract-crm-fields               (no deps)
--   Wave 2: classify-crm-fields              (after extract)
--   Wave 3: auto-apply-crm-fields            (after classify)
--   Wave 4: hubspot-sync + slack-crm-notify  (after auto-apply, parallel)
-- ---------------------------------------------------------------------------

INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES (
  NULL,
  'crm_update',
  1,
  '[
    {
      "skill": "extract-crm-fields",
      "requires_context": ["tier1", "tier2"],
      "requires_approval": false,
      "criticality": "critical",
      "available": true,
      "depends_on": []
    },
    {
      "skill": "classify-crm-fields",
      "requires_context": ["tier2"],
      "requires_approval": false,
      "criticality": "critical",
      "available": true,
      "depends_on": ["extract-crm-fields"]
    },
    {
      "skill": "auto-apply-crm-fields",
      "requires_context": ["tier2"],
      "requires_approval": false,
      "criticality": "critical",
      "available": true,
      "depends_on": ["classify-crm-fields"]
    },
    {
      "skill": "hubspot-sync-crm-fields",
      "requires_context": ["tier2"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["auto-apply-crm-fields"]
    },
    {
      "skill": "slack-crm-notify",
      "requires_context": ["tier1"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["auto-apply-crm-fields"]
    }
  ]'::jsonb,
  '["tier1", "tier2"]'::jsonb,
  true
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET
  steps                = EXCLUDED.steps,
  context_requirements = EXCLUDED.context_requirements,
  is_active            = EXCLUDED.is_active,
  updated_at           = now();

-- ---------------------------------------------------------------------------
-- 3. Handoff Route — crm_update / slack-crm-notify → deal_risk_rescore
--    After the CRM notify step completes (approval-required fields queued,
--    auto-applied fields written) the fleet fires deal_risk_rescore so the
--    risk scorer can immediately re-evaluate the updated deal.
--    context_mapping surfaces the deal_id from the crm_update context.
-- ---------------------------------------------------------------------------

INSERT INTO fleet_handoff_routes (
  org_id,
  source_sequence_key,
  source_step_skill,
  target_event_type,
  context_mapping,
  conditions,
  delay_minutes,
  is_active
)
VALUES (
  NULL,
  'crm_update',
  'slack-crm-notify',
  'deal_risk_rescore',
  '{
    "deal_id":        "context.deal_id",
    "meeting_id":     "context.meeting_id",
    "changed_fields": "outputs.auto_applied_fields",
    "trigger":        "crm_updated"
  }'::jsonb,
  '{"has_deal_id": true}'::jsonb,
  0,
  true
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Done
-- ---------------------------------------------------------------------------
