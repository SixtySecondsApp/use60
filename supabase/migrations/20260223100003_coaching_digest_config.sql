-- ============================================================================
-- CTI-005: Coaching Digest Config Keys (PRD-19)
-- Phase 6: Coaching & Team Intelligence — Configurable Delivery
-- ============================================================================

-- Seed default config values for enhanced coaching digest
INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description)
VALUES
  ('coaching', 'coaching.digest_enabled', '"true"', 'Enable weekly coaching digest delivery'),
  ('coaching', 'coaching.digest_day', '"friday"', 'Day of week to deliver coaching digest (monday-sunday)'),
  ('coaching', 'coaching.digest_hour', '16', 'Hour (0-23) in user timezone to deliver coaching digest'),
  ('coaching', 'coaching.focus_areas', '"auto"', 'Coaching focus areas: auto (AI selects) or comma-separated list'),
  ('coaching', 'coaching.detail_level', '"standard"', 'Coaching digest detail: summary, standard, or detailed')
ON CONFLICT (agent_type, config_key) DO UPDATE
SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description;
