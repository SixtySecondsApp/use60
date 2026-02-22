-- ============================================================================
-- Migration: Reengagement Agent — Signal & Cooldown Config Seed
-- Purpose: Seed agent_config_defaults for reengagement-specific config keys
--          and update agent_methodology_templates with reengagement overrides
-- Stories: REN-002
-- Date: 2026-02-22
-- ============================================================================

-- ============================================================================
-- SEED DATA: agent_config_defaults — reengagement-specific config keys
-- Adds 7 new config keys for signal sourcing, cooldown, and re-engagement
-- behaviour. Idempotent — ON CONFLICT DO UPDATE.
--
-- NOTE: mission, playbook, boundaries, voice, heartbeat, delivery, thresholds
-- are already seeded in 20260222000001_agent_config_engine.sql.
-- This migration adds the NEW reengagement-specific keys only.
-- ============================================================================

INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description) VALUES

-- Signal sources the reengagement agent will poll for buying signals
('reengagement', 'signal_sources', '["apollo", "apify"]'::jsonb,
 'External signal sources the reengagement agent queries for job changes, funding events, and company news. Supported: "apollo", "apify".'),

-- Minimum days since last close/lost before attempting reengagement
('reengagement', 'min_days_since_close', '30'::jsonb,
 'Minimum number of days that must have elapsed since a deal was closed (won or lost) before the reengagement agent will surface it as a candidate.'),

-- Maximum number of reengagement attempts before suppressing a contact
('reengagement', 'max_attempts', '3'::jsonb,
 'Maximum reengagement attempts per contact per deal before the agent stops surfacing them. Prevents repeated outreach to unresponsive contacts.'),

-- Global cooldown window: do not re-surface the same contact within N days
('reengagement', 'cooldown_days', '90'::jsonb,
 'Days to wait after a reengagement attempt before the same contact is eligible again. Enforced via deal_signal_temperature.last_signal_sent_at.'),

-- Minimum relevance score for a signal to trigger reengagement
('reengagement', 'signal_relevance_threshold', '0.6'::jsonb,
 'Minimum relevance score (0.0–1.0) a buying signal must achieve before triggering a reengagement candidate. Signals below this threshold are discarded.'),

-- Tone of voice override for outreach drafts
('reengagement', 'tone_of_voice', '"warm_professional"'::jsonb,
 'Default tone for AI-drafted reengagement messages. Overrides the global voice.tone setting for this agent. Values: "warm_professional", "direct", "casual".'),

-- Master on/off switch for the reengagement agent
('reengagement', 'reengagement_enabled', 'true'::jsonb,
 'When false, the reengagement agent will not surface candidates or draft messages, even if triggered by signals. Allows orgs to disable the agent without deleting config.')

ON CONFLICT (agent_type, config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description  = EXCLUDED.description,
      updated_at   = now();

-- ============================================================================
-- UPDATE: agent_methodology_templates — add reengagement overrides
--
-- MEDDIC: champion-focused reengagement — higher relevance threshold and
--         champion_focus_weight to prioritise champions who changed roles.
--
-- Challenger: insight-led approach — flag insight_led_approach to instruct
--             the AI to lead drafts with a disruptive insight rather than
--             a generic check-in.
--
-- config_overrides keys use "agent_type.config_key" dot notation so
-- apply_methodology() can write them into agent_config_org_overrides.
-- ============================================================================

-- MEDDIC: tighten relevance threshold, add champion_focus_weight
UPDATE agent_methodology_templates
SET
  config_overrides = config_overrides || '{
    "reengagement.signal_relevance_threshold": 0.72,
    "reengagement.champion_focus_weight": 1.5
  }'::jsonb,
  updated_at = now()
WHERE methodology_key = 'meddic';

-- Challenger: lower threshold slightly (more proactive), add insight_led flag
UPDATE agent_methodology_templates
SET
  config_overrides = config_overrides || '{
    "reengagement.signal_relevance_threshold": 0.55,
    "reengagement.insight_led_approach": true
  }'::jsonb,
  updated_at = now()
WHERE methodology_key = 'challenger';

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222400002_reengagement_agent_config.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Stories covered: REN-002';
  RAISE NOTICE '';
  RAISE NOTICE 'Seed data (agent_config_defaults — reengagement):';
  RAISE NOTICE '  - signal_sources              → ["apollo", "apify"]';
  RAISE NOTICE '  - min_days_since_close        → 30';
  RAISE NOTICE '  - max_attempts                → 3';
  RAISE NOTICE '  - cooldown_days               → 90';
  RAISE NOTICE '  - signal_relevance_threshold  → 0.6';
  RAISE NOTICE '  - tone_of_voice               → "warm_professional"';
  RAISE NOTICE '  - reengagement_enabled        → true';
  RAISE NOTICE '';
  RAISE NOTICE 'Methodology overrides updated (agent_methodology_templates.config_overrides):';
  RAISE NOTICE '  - meddic:     reengagement.signal_relevance_threshold = 0.72';
  RAISE NOTICE '                reengagement.champion_focus_weight = 1.5';
  RAISE NOTICE '  - challenger: reengagement.signal_relevance_threshold = 0.55';
  RAISE NOTICE '                reengagement.insight_led_approach = true';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
