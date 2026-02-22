-- Migration: Seed agent_config_defaults for autonomy presets
-- AUT-002: Preset definitions and action type catalog

-- =====================================================================
-- Autonomy preset: global default (balanced)
-- =====================================================================
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES (
  'global',
  'autonomy.preset',
  '"balanced"',
  'Default autonomy preset for the org. One of: conservative, balanced, autonomous, custom'
)
ON CONFLICT (agent_type, config_key) DO NOTHING;

-- =====================================================================
-- Preset definitions: conservative
-- =====================================================================
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES (
  'global',
  'autonomy.presets.conservative',
  '{
    "label": "Conservative",
    "description": "Require human approval for all AI-initiated actions. Maximum oversight.",
    "policies": {
      "crm_stage_change": "approve",
      "crm_field_update": "approve",
      "crm_contact_create": "approve",
      "send_email": "approve",
      "send_slack": "approve",
      "create_task": "approve",
      "enrich_contact": "suggest",
      "draft_proposal": "suggest"
    }
  }',
  'Conservative preset: all actions require approval'
)
ON CONFLICT (agent_type, config_key) DO NOTHING;

-- =====================================================================
-- Preset definitions: balanced
-- =====================================================================
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES (
  'global',
  'autonomy.presets.balanced',
  '{
    "label": "Balanced",
    "description": "Auto-approve low-risk actions (tasks, enrichment). Require approval for high-risk actions (email, stage change).",
    "policies": {
      "crm_stage_change": "approve",
      "crm_field_update": "suggest",
      "crm_contact_create": "suggest",
      "send_email": "approve",
      "send_slack": "auto",
      "create_task": "auto",
      "enrich_contact": "auto",
      "draft_proposal": "suggest"
    }
  }',
  'Balanced preset: low-risk auto, high-risk approve'
)
ON CONFLICT (agent_type, config_key) DO NOTHING;

-- =====================================================================
-- Preset definitions: autonomous
-- =====================================================================
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES (
  'global',
  'autonomy.presets.autonomous',
  '{
    "label": "Autonomous",
    "description": "Maximize automation. AI executes most actions without approval. Only destructive actions require review.",
    "policies": {
      "crm_stage_change": "auto",
      "crm_field_update": "auto",
      "crm_contact_create": "auto",
      "send_email": "approve",
      "send_slack": "auto",
      "create_task": "auto",
      "enrich_contact": "auto",
      "draft_proposal": "approve"
    }
  }',
  'Autonomous preset: most actions auto, only destructive require approval'
)
ON CONFLICT (agent_type, config_key) DO NOTHING;

-- =====================================================================
-- Action type catalog
-- =====================================================================
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES (
  'global',
  'autonomy.action_catalog',
  '[
    {
      "key": "crm_stage_change",
      "label": "CRM Stage Change",
      "description": "Move deals between pipeline stages",
      "risk_level": "high"
    },
    {
      "key": "crm_field_update",
      "label": "CRM Field Update",
      "description": "Update contact, deal, or company fields",
      "risk_level": "medium"
    },
    {
      "key": "crm_contact_create",
      "label": "Create CRM Contact",
      "description": "Create new contacts or companies in CRM",
      "risk_level": "medium"
    },
    {
      "key": "send_email",
      "label": "Send Email",
      "description": "Send emails on behalf of the rep",
      "risk_level": "high"
    },
    {
      "key": "send_slack",
      "label": "Send Slack Message",
      "description": "Send notifications and messages via Slack",
      "risk_level": "low"
    },
    {
      "key": "create_task",
      "label": "Create Task",
      "description": "Create follow-up tasks and reminders",
      "risk_level": "low"
    },
    {
      "key": "enrich_contact",
      "label": "Enrich Contact",
      "description": "Look up and fill in contact details from external sources",
      "risk_level": "low"
    },
    {
      "key": "draft_proposal",
      "label": "Draft Proposal",
      "description": "Generate sales proposal or quote documents",
      "risk_level": "medium"
    }
  ]',
  'Catalog of all action types with risk levels'
)
ON CONFLICT (agent_type, config_key) DO NOTHING;
