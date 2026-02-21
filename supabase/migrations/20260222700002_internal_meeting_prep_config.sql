-- ============================================================================
-- Migration: Internal Meeting Prep Agent — Feature-Specific Config Seed
-- Purpose: Seed agent_config_defaults for internal_meeting_prep with keys
--          that control per-meeting-type enablement and prep detail level.
-- Story: IMP-002
-- Date: 2026-02-22
-- ============================================================================
-- NOTE: The core internal_meeting_prep keys (mission, playbook, boundaries,
-- voice, heartbeat, delivery, thresholds) were seeded in
-- 20260222000001_agent_config_engine.sql.
-- This migration adds the NEW prep-type-specific keys only.
-- All inserts use ON CONFLICT DO UPDATE for idempotency.
-- ============================================================================

INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description) VALUES

-- ============================================================================
-- INTERNAL MEETING PREP — feature-gate keys (IMP-002)
-- ============================================================================

-- Master on/off switch for internal meeting prep
('internal_meeting_prep', 'internal_prep_enabled', 'true'::jsonb,
  'Master switch for the internal_meeting_prep agent. When false, no prep docs are generated for any meeting type, even if individual type flags are enabled. Allows orgs to disable the agent entirely without deleting config.'),

-- Per-type enablement flags
('internal_meeting_prep', 'one_on_one_enabled', 'true'::jsonb,
  'When true, the agent generates a prep briefing for 1:1 meetings (identified by exactly 2 attendees sharing the same org domain, or classified as one_on_one by the meeting type classifier). Set to false to skip 1:1 prep entirely.'),

('internal_meeting_prep', 'pipeline_review_enabled', 'true'::jsonb,
  'When true, the agent generates a prep briefing for pipeline review meetings (classified as pipeline_review by the meeting type classifier). These get a deal-table-heavy template. Set to false to skip pipeline review prep.'),

('internal_meeting_prep', 'qbr_enabled', 'true'::jsonb,
  'When true, the agent generates a prep briefing for quarterly business review (QBR) meetings. QBR prep includes executive summary, full pipeline snapshot, and quarter-to-date performance metrics. Set to false to skip QBR prep.'),

('internal_meeting_prep', 'standup_enabled', 'true'::jsonb,
  'When true, the agent generates a prep briefing for standup meetings. Standup prep is intentionally lightweight (blockers, wins, today''s focus). Set to false to skip standup prep entirely.'),

-- Prep detail level: controls verbosity of the generated briefing doc
('internal_meeting_prep', 'prep_detail_level', '"full"'::jsonb,
  'Controls how detailed the meeting prep briefing is. Values: "full" (narrative prose + data tables + suggested questions) | "standard" (deal snapshot + key questions, no prose) | "minimal" (three bullet points only). Default: "full". Can be overridden per org or per user.'),

-- Manager pre-read: generates an additional condensed doc for the manager/host
('internal_meeting_prep', 'manager_preread_enabled', 'true'::jsonb,
  'When true, the agent generates a separate condensed pre-read for the meeting host / manager (determined by calendar organiser). The pre-read is a one-page version of the full prep doc suitable for quick review. Set to false if your org does not use manager pre-reads.')

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
  RAISE NOTICE 'Migration: 20260222700002_internal_meeting_prep_config.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: IMP-002';
  RAISE NOTICE '';
  RAISE NOTICE 'Seed data added to agent_config_defaults (internal_meeting_prep):';
  RAISE NOTICE '  New keys:';
  RAISE NOTICE '    - internal_prep_enabled       (boolean, default: true)  — master on/off';
  RAISE NOTICE '    - one_on_one_enabled          (boolean, default: true)  — 1:1 prep gate';
  RAISE NOTICE '    - pipeline_review_enabled     (boolean, default: true)  — pipeline review gate';
  RAISE NOTICE '    - qbr_enabled                 (boolean, default: true)  — QBR prep gate';
  RAISE NOTICE '    - standup_enabled             (boolean, default: true)  — standup prep gate';
  RAISE NOTICE '    - prep_detail_level           (string,  default: full)  — full|standard|minimal';
  RAISE NOTICE '    - manager_preread_enabled     (boolean, default: true)  — manager pre-read doc';
  RAISE NOTICE '';
  RAISE NOTICE 'All inserts use ON CONFLICT DO UPDATE — safe to re-run.';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
