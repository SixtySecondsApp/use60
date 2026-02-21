-- ============================================================================
-- PRD-04: Deal Risk Scorer Agent — Fleet Routes & Seed Data
-- Stories: RSK-010, RSK-011, RSK-012
--
-- Fleet event routes, sequence definitions, and handoff routes for the
-- deal risk scorer agent integration with PRD-02 Fleet Orchestrator.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Event Routes — cron.deal_risk_scan and deal_risk_rescore
-- ---------------------------------------------------------------------------

INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  -- Daily cron route: scores all stale deals
  (NULL, 'cron.deal_risk_scan', 'risk_scoring', 0, NULL, true),
  -- Event-triggered re-score for a single deal
  (NULL, 'deal_risk_rescore', 'risk_rescore_single', 0, NULL, true)
ON CONFLICT ON CONSTRAINT fleet_event_routes_unique_route
DO UPDATE SET
  sequence_key = EXCLUDED.sequence_key,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 2. Sequence Definitions — risk_scoring (daily batch) and risk_rescore_single
-- ---------------------------------------------------------------------------

INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES
  -- Daily batch scoring sequence: 4 steps
  (NULL, 'risk_scoring', 1, '[
    {
      "skill": "batch-score-deals",
      "adapter": "dealRiskBatchScore",
      "label": "Score all stale deals",
      "critical": true,
      "timeout_ms": 120000
    },
    {
      "skill": "evaluate-risk-alerts",
      "adapter": "dealRiskEvaluateAlerts",
      "label": "Evaluate which deals need alerts",
      "critical": false,
      "timeout_ms": 30000
    },
    {
      "skill": "deliver-risk-slack",
      "adapter": "slackDealRiskAlert",
      "label": "Send Slack alerts for high-risk deals",
      "critical": false,
      "timeout_ms": 60000
    },
    {
      "skill": "generate-risk-alerts",
      "adapter": "dealRiskGenerateAlerts",
      "label": "Generate in-app risk notifications",
      "critical": false,
      "timeout_ms": 30000
    }
  ]'::JSONB, '["org_id"]'::JSONB, true),

  -- Single deal re-score sequence: 2 steps
  (NULL, 'risk_rescore_single', 1, '[
    {
      "skill": "rescore-deal",
      "adapter": "dealRiskRescore",
      "label": "Re-score single deal risk",
      "critical": true,
      "timeout_ms": 30000
    },
    {
      "skill": "evaluate-risk-alerts",
      "adapter": "dealRiskEvaluateAlerts",
      "label": "Check if alert needed for re-scored deal",
      "critical": false,
      "timeout_ms": 15000
    }
  ]'::JSONB, '["org_id", "deal_id"]'::JSONB, true)
ON CONFLICT ON CONSTRAINT fleet_sequence_definitions_unique_version
DO UPDATE SET
  steps = EXCLUDED.steps,
  context_requirements = EXCLUDED.context_requirements,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 3. Handoff Routes — meeting_ended → rescore, crm_update → rescore
-- ---------------------------------------------------------------------------

INSERT INTO fleet_handoff_routes (
  org_id, source_sequence_key, source_step_skill, target_event_type,
  context_mapping, conditions, delay_minutes, is_active
)
VALUES
  -- RSK-010: After meeting_ended post-meeting analysis → re-score deal
  (NULL, 'meeting_ended', 'suggest-next-actions', 'deal_risk_rescore',
   '{"deal_id": "outputs.deal_id", "meeting_id": "outputs.meeting_id", "trigger": "meeting_ended"}'::JSONB,
   '{"has_deal_id": true}'::JSONB,
   0, true),

  -- RSK-011: After CRM update on high-impact fields → re-score deal
  (NULL, 'crm_update', 'update-crm-from-meeting', 'deal_risk_rescore',
   '{"deal_id": "outputs.deal_id", "changed_fields": "outputs.updated_fields", "trigger": "crm_update"}'::JSONB,
   '{"crm_field_type": ["stage", "amount", "close_date"]}'::JSONB,
   0, true)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Done
-- ---------------------------------------------------------------------------
