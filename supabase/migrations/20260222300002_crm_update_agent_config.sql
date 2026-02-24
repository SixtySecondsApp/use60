-- ============================================================================
-- Migration: CRM Update Agent — Field Approval Config Seed
-- Purpose: Seed agent_config_defaults for crm_update field-level approval gates
--          and update agent_methodology_templates with CRM-specific overrides
-- Stories: CRM-002
-- Date: 2026-02-22
-- ============================================================================

-- ============================================================================
-- SEED DATA: agent_config_defaults — crm_update field approval settings
-- Adds 7 new config keys specific to the CRM Update Agent's field classifier
-- and approval workflow. Idempotent — ON CONFLICT DO UPDATE.
-- ============================================================================

INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description) VALUES

-- Fields the agent may apply automatically without human approval
('crm_update', 'auto_approve_fields', '["notes", "next_steps", "activity_log", "stakeholders", "blockers"]'::jsonb,
 'CRM fields that the agent may write autonomously after a meeting — no approval required'),

-- Fields that must go through the HITL approval queue before being applied
('crm_update', 'approval_required_fields', '["stage", "close_date", "deal_value"]'::jsonb,
 'CRM fields that require explicit human approval before being written — routed through crm_approval_queue'),

-- Minimum confidence level for auto-applying a field update (low / medium / high)
('crm_update', 'confidence_minimum', '"medium"'::jsonb,
 'Minimum confidence band for auto-applied updates. Values: "low", "medium", "high". Updates below this threshold are queued for approval.'),

-- How long a pending approval request stays open before expiring
('crm_update', 'approval_expiry_hours', '48'::jsonb,
 'Hours before a pending crm_approval_queue entry is marked expired and the update is abandoned'),

-- Safety cap on concurrent pending approvals per deal
('crm_update', 'max_pending_approvals', '10'::jsonb,
 'Maximum number of simultaneously open approval requests per deal. Prevents queue flooding on busy deals.'),

-- Whether to send Slack HITL messages for approval-required fields
('crm_update', 'slack_notification_enabled', 'true'::jsonb,
 'When true, the agent sends a Slack Block Kit message for each approval-required field update, enabling one-click approve/reject from Slack'),

-- Whether to sync approved field updates to HubSpot after application
('crm_update', 'hubspot_sync_enabled', 'true'::jsonb,
 'When true, auto-applied and approved CRM field updates are pushed to HubSpot after being written to the local CRM')

ON CONFLICT (agent_type, config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description  = EXCLUDED.description,
      updated_at   = now();

-- ============================================================================
-- UPDATE: agent_methodology_templates — add crm_update overrides
-- MEDDIC: adds meddic_score to auto_approve_fields
-- BANT: adds budget_confirmed to approval_required_fields
--
-- config_overrides keys use "agent_type.config_key" dot notation so
-- apply_methodology() can write them into agent_config_org_overrides.
-- ============================================================================

-- MEDDIC: trust meddic_score extraction (auto-approve), tighten confidence bar
UPDATE agent_methodology_templates
SET
  config_overrides = config_overrides || '{
    "crm_update.auto_approve_fields": ["notes", "next_steps", "activity_log", "stakeholders", "blockers", "meddic_score"],
    "crm_update.confidence_minimum":  "high"
  }'::jsonb,
  updated_at = now()
WHERE methodology_key = 'meddic';

-- BANT: budget_confirmed must be approved — high stakes qualifier
UPDATE agent_methodology_templates
SET
  config_overrides = config_overrides || '{
    "crm_update.approval_required_fields": ["stage", "close_date", "deal_value", "budget_confirmed"]
  }'::jsonb,
  updated_at = now()
WHERE methodology_key = 'bant';

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222300002_crm_update_agent_config.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Stories covered: CRM-002';
  RAISE NOTICE '';
  RAISE NOTICE 'Seed data (agent_config_defaults — crm_update):';
  RAISE NOTICE '  - auto_approve_fields        → ["notes", "next_steps", "activity_log", "stakeholders", "blockers"]';
  RAISE NOTICE '  - approval_required_fields   → ["stage", "close_date", "deal_value"]';
  RAISE NOTICE '  - confidence_minimum         → "medium"';
  RAISE NOTICE '  - approval_expiry_hours      → 48';
  RAISE NOTICE '  - max_pending_approvals      → 10';
  RAISE NOTICE '  - slack_notification_enabled → true';
  RAISE NOTICE '  - hubspot_sync_enabled       → true';
  RAISE NOTICE '';
  RAISE NOTICE 'Methodology overrides updated (agent_methodology_templates.config_overrides):';
  RAISE NOTICE '  - meddic: crm_update.auto_approve_fields += "meddic_score"';
  RAISE NOTICE '            crm_update.confidence_minimum = "high"';
  RAISE NOTICE '  - bant:   crm_update.approval_required_fields += "budget_confirmed"';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
