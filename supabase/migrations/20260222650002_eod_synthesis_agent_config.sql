-- ============================================================================
-- Migration: EOD Synthesis Agent Config Seed
-- Purpose: Seed agent_config_defaults for eod_synthesis-specific config keys:
--          delivery method, detail level, scorecard composition, preview/plan
--          toggles, and MEDDIC methodology override.
-- Story: EOD-002
-- Date: 2026-02-22
-- ============================================================================
-- NOTE: The core eod_synthesis keys (mission, playbook, boundaries, voice,
-- heartbeat, delivery, thresholds) were seeded in
-- 20260222000001_agent_config_engine.sql.
-- This migration adds the NEW eod-specific keys only.
-- All inserts use ON CONFLICT DO UPDATE for idempotency.
-- ============================================================================

INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description) VALUES

-- ============================================================================
-- EOD SYNTHESIS — delivery and detail configuration (EOD-002)
-- ============================================================================

('eod_synthesis', 'eod_enabled', 'true'::jsonb,
  'Master on/off switch for the EOD synthesis agent. When false, no delivery is sent even if the cron fires. Allows orgs to disable the agent without deleting config.'),

('eod_synthesis', 'delivery_method', '"slack_dm"'::jsonb,
  'How the EOD synthesis is delivered. Values: slack_dm (direct message to rep) | slack_channel (posted to a configured channel) | in_app (surfaces in the copilot panel only). Default: slack_dm.'),

('eod_synthesis', 'detail_level', '"full"'::jsonb,
  'Output verbosity for the EOD synthesis. Values: full (all sections with prose + numbers) | summary (bullet-only scorecard, no narrative). Default: full.'),

('eod_synthesis', 'include_overnight_plan', 'true'::jsonb,
  'When true, the EOD synthesis includes a suggested overnight plan: async actions the rep can take tonight or first thing tomorrow (email drafts, CRM updates, prep notes). Default: true.'),

('eod_synthesis', 'include_tomorrow_preview', 'true'::jsonb,
  'When true, the EOD synthesis includes a preview of tomorrow''s calendar: meetings, suggested prep, and recommended first action of the day. Default: true.'),

-- ============================================================================
-- EOD SYNTHESIS — methodology override hints
-- The agent reads active_methodology from global config, then applies these
-- overrides to adjust what appears in the scorecard section.
-- ============================================================================

('eod_synthesis', 'methodology_hints.MEDDIC', '{
  "scorecard_extras": ["deal_qualification_recap"],
  "scorecard_sections": {
    "deal_qualification_recap": "For each active deal touched today, summarise the MEDDIC qualification status: which criteria are confirmed, which are missing. Flag gaps that should be addressed before the next meeting.",
    "champion_health": "Report champion health score and last contact date for any deal where the champion was not contacted today.",
    "metrics_status": "Surface whether economic metrics (ROI/payback period) are quantified for deals that advanced stage today."
  },
  "prompt_injection": "You are using MEDDIC methodology. In the EOD scorecard, include a deal qualification recap that summarises MEDDIC criteria coverage for each active deal touched today. Highlight any deal missing a champion or an agreed success metric."
}'::jsonb,
  'EOD scorecard extras when active_methodology = MEDDIC. Adds deal_qualification_recap to the scorecard to surface MEDDIC gap analysis at the end of each day.'),

('eod_synthesis', 'methodology_hints.BANT', '{
  "scorecard_extras": ["budget_authority_check"],
  "scorecard_sections": {
    "budget_authority_check": "For each deal touched today, confirm whether budget has been discussed and the economic buyer engaged. Flag deals where BANT criteria are unconfirmed after today''s activities.",
    "need_validation": "Note deals where a business need has not been documented in CRM notes despite today''s meeting or call."
  },
  "prompt_injection": "You are using BANT methodology. In the EOD scorecard, check whether today''s activities confirmed budget and authority for each deal. Flag any deal where the economic buyer has not been engaged."
}'::jsonb,
  'EOD scorecard extras when active_methodology = BANT. Adds budget and authority check to the end-of-day deal review.'),

('eod_synthesis', 'methodology_hints.SPIN', '{
  "scorecard_extras": ["spin_question_log"],
  "scorecard_sections": {
    "spin_question_log": "For each meeting held today, note whether situation, problem, implication, and need-payoff questions were logged in the meeting notes. Highlight any stage where the conversation did not progress beyond situation questions.",
    "next_spin_question": "Suggest the highest-impact SPIN question for the most important deal meeting tomorrow."
  },
  "prompt_injection": "You are using SPIN Selling. In the EOD scorecard, review today''s meetings for SPIN question progression. Surface deals where implication or need-payoff conversations have not yet happened."
}'::jsonb,
  'EOD scorecard extras when active_methodology = SPIN. Reviews SPIN question progression across today''s meetings.'),

('eod_synthesis', 'methodology_hints.Challenger', '{
  "scorecard_extras": ["insight_delivery_log"],
  "scorecard_sections": {
    "insight_delivery_log": "For each customer meeting today, note whether a commercial insight or reframe was delivered. Flag deals in Proposal or Negotiation stage where no insight has been delivered in the last two meetings.",
    "tension_opportunities": "Surface deals where constructive tension was missed today — late-stage deals where the rep did not push for a concrete commitment."
  },
  "prompt_injection": "You are using Challenger Sale. In the EOD scorecard, evaluate whether today''s meetings included a commercial insight or constructive tension moment. Flag late-stage deals where tension was not applied."
}'::jsonb,
  'EOD scorecard extras when active_methodology = Challenger. Evaluates insight delivery and constructive tension across today''s meetings.'),

('eod_synthesis', 'methodology_hints.generic', '{
  "scorecard_extras": [],
  "scorecard_sections": {
    "activity_summary": "Summarise today''s call, email, and meeting counts versus targets.",
    "deal_momentum": "Highlight deals that advanced stage today and deals that went stale.",
    "next_step_health": "Surface deals with overdue or missing next steps discovered today."
  },
  "prompt_injection": "Review today''s activities, deal momentum, and next-step discipline. Celebrate wins and flag stalled deals."
}'::jsonb,
  'Default EOD scorecard rules when no specific methodology is active. Covers activity counts, deal momentum, and next-step health.')

ON CONFLICT (agent_type, config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description  = EXCLUDED.description,
      updated_at   = now();

-- ============================================================================
-- UPDATE: agent_methodology_templates — add eod_synthesis overrides
--
-- MEDDIC: adds deal_qualification_recap to the EOD scorecard, raising the bar
--         on qualification review at the end of each day.
-- ============================================================================

UPDATE agent_methodology_templates
SET
  config_overrides = config_overrides || '{
    "eod_synthesis.scorecard_extras": ["deal_qualification_recap"],
    "eod_synthesis.detail_level": "full"
  }'::jsonb,
  updated_at = now()
WHERE methodology_key = 'meddic';

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222600002_eod_synthesis_agent_config.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: EOD-002';
  RAISE NOTICE '';
  RAISE NOTICE 'Seed data added to agent_config_defaults (eod_synthesis):';
  RAISE NOTICE '  New keys:';
  RAISE NOTICE '    - eod_enabled               (boolean, default: true)';
  RAISE NOTICE '    - delivery_method           (slack_dm | slack_channel | in_app)';
  RAISE NOTICE '    - detail_level              (full | summary, default: full)';
  RAISE NOTICE '    - include_overnight_plan    (boolean, default: true)';
  RAISE NOTICE '    - include_tomorrow_preview  (boolean, default: true)';
  RAISE NOTICE '';
  RAISE NOTICE '  Methodology override hints (scorecard_extras + prompt_injection):';
  RAISE NOTICE '    - methodology_hints.MEDDIC      (deal_qualification_recap section)';
  RAISE NOTICE '    - methodology_hints.BANT        (budget_authority_check section)';
  RAISE NOTICE '    - methodology_hints.SPIN        (spin_question_log section)';
  RAISE NOTICE '    - methodology_hints.Challenger  (insight_delivery_log section)';
  RAISE NOTICE '    - methodology_hints.generic     (activity + momentum + next-step)';
  RAISE NOTICE '';
  RAISE NOTICE 'Methodology template overrides (agent_methodology_templates.config_overrides):';
  RAISE NOTICE '  - meddic: eod_synthesis.scorecard_extras = ["deal_qualification_recap"]';
  RAISE NOTICE '            eod_synthesis.detail_level = "full"';
  RAISE NOTICE '';
  RAISE NOTICE 'All inserts use ON CONFLICT DO UPDATE — safe to re-run.';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
