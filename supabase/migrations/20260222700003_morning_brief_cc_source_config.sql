-- ============================================================================
-- Migration: Morning Briefing — CC Source Config Flag
-- Purpose: Seed the morning_brief_source config key into agent_config_defaults.
--          Controls whether the morning brief reads priorities/insights from
--          command_centre_items (new path) or from the legacy AI skill.
-- Story: CC8-006
-- Date: 2026-02-22
-- ============================================================================
-- Safe rollout: defaults to 'legacy'. Set to 'command_centre' per org via
-- agent_config_org_overrides when ready to enable the new path.
-- ============================================================================

INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description) VALUES

('morning_briefing', 'morning_brief_source', '"legacy"'::jsonb,
  'Controls the source for morning brief priorities and insights. Values: legacy (AI skill, default) | command_centre (reads from command_centre_items WHERE status IN (''open'',''ready'') for the user, grouped by urgency tier). Falls back to legacy if CC has fewer than 3 items.')

ON CONFLICT (agent_type, config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description  = EXCLUDED.description,
      updated_at   = now();

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222700003_morning_brief_cc_source_config.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: CC8-006';
  RAISE NOTICE '';
  RAISE NOTICE 'Seed data added to agent_config_defaults (morning_briefing):';
  RAISE NOTICE '  New key:';
  RAISE NOTICE '    - morning_brief_source   (legacy | command_centre, default: legacy)';
  RAISE NOTICE '';
  RAISE NOTICE 'To enable CC-sourced morning briefs for an org, insert into';
  RAISE NOTICE 'agent_config_org_overrides:';
  RAISE NOTICE '';
  RAISE NOTICE '  INSERT INTO agent_config_org_overrides';
  RAISE NOTICE '    (org_id, agent_type, config_key, config_value)';
  RAISE NOTICE '  VALUES';
  RAISE NOTICE '    (''<org-uuid>'', ''morning_briefing'', ''morning_brief_source'', ''"command_centre"'');';
  RAISE NOTICE '';
  RAISE NOTICE 'Fallback: if CC has < 3 open/ready items for the user, the legacy path runs';
  RAISE NOTICE 'automatically regardless of this config flag.';
  RAISE NOTICE '';
  RAISE NOTICE 'All inserts use ON CONFLICT DO UPDATE — safe to re-run.';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
