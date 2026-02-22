-- ============================================================================
-- CTI-008: Org Learning Config & Privacy Controls (PRD-20)
-- Phase 6: Coaching & Team Intelligence — Privacy Enforcement
-- ============================================================================

-- Seed default config values for org-wide learning
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES
  ('org_learning', 'intelligence.org_learning.enabled', 'true', 'Enable org-wide anonymised learning from cross-rep patterns'),
  ('org_learning', 'intelligence.org_learning.min_team_size', '5', 'Minimum team size before org learning generates insights'),
  ('org_learning', 'intelligence.org_learning.anonymise_individual_data', 'true', 'Always anonymise individual data in org insights (enforced at platform level)')
ON CONFLICT (agent_type, config_key) DO UPDATE
SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description;

-- Note: anonymise_individual_data is enforced at the application level in agent-org-learning.
-- The agent_config_user_overridable table is org-scoped (requires org_id) and would be
-- configured per-org at runtime by org admins, not at migration time.
