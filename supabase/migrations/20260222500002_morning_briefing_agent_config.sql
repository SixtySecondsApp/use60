-- ============================================================================
-- Migration: Morning Briefing Agent Config — Pipeline Math Keys
-- Purpose: Seed additional agent_config_defaults keys specific to the enhanced
--          morning briefing: pipeline math, quarter phasing, overnight summary,
--          and methodology-specific overrides.
-- Story: BRF-002
-- Date: 2026-02-22
-- ============================================================================
-- NOTE: The core morning_briefing keys (mission, playbook, boundaries, voice,
-- heartbeat, delivery, thresholds) were seeded in 20260222000001_agent_config_engine.sql.
-- This migration adds the NEW pipeline-math-specific keys only.
-- All inserts use ON CONFLICT DO UPDATE for idempotency.
-- ============================================================================

INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description) VALUES

-- ============================================================================
-- MORNING BRIEFING — enhanced pipeline math keys (BRF-002)
-- ============================================================================

('morning_briefing', 'briefing_format', '"detailed"'::jsonb,
  'Output format for the morning briefing. Values: detailed (full narrative + numbers) | summary (bullet-only, no prose). Default: detailed.'),

('morning_briefing', 'pipeline_math_enabled', 'true'::jsonb,
  'When true, the briefing agent computes pipeline math (coverage ratio, weighted pipeline, delta vs target) and includes the results in the briefing. Requires pipeline_snapshots to be populated.'),

('morning_briefing', 'quarter_start_month', '1'::jsonb,
  'Calendar month (1-12) that starts Q1 for this org. Default: 1 (January). Change to 4 for April fiscal year start, 7 for July, 10 for October.'),

('morning_briefing', 'overnight_summary_enabled', 'true'::jsonb,
  'When true, the briefing includes a summary of CRM activity that occurred overnight (emails received, deals touched, tasks completed outside business hours).'),

('morning_briefing', 'delivery_time', '"08:00"'::jsonb,
  'Target delivery time for the morning briefing in HH:MM (24-hour, local time). The cron trigger fires slightly before this to account for compute time. Default: 08:00.'),

('morning_briefing', 'delivery_method', '"slack_dm"'::jsonb,
  'How the briefing is delivered. Values: slack_dm (direct message to rep) | slack_channel (posted to a configured channel) | in_app (surfaces in the copilot panel only). Default: slack_dm.'),

-- ============================================================================
-- MORNING BRIEFING — methodology override hints
-- These keys inform the gap-analysis section of the briefing prompt.
-- The agent reads active_methodology from global config, then applies the
-- methodology-specific emphasis rules below.
-- ============================================================================

('morning_briefing', 'methodology_hints.MEDDIC', '{
  "gap_analysis_emphasis": ["champion_health", "metrics_defined", "decision_criteria_captured"],
  "briefing_sections": {
    "champion": "Always include champion health score and last contact date",
    "metrics": "Surface whether economic metrics (ROI/payback) have been quantified in the deal",
    "decision_criteria": "Flag deals missing documented decision criteria in the CRM"
  },
  "prompt_injection": "You are using MEDDIC methodology. In the gap analysis, prioritise champion health and whether economic metrics have been agreed. Flag any deal missing a champion or defined success metric."
}'::jsonb,
  'Briefing emphasis rules when active_methodology = MEDDIC. Highlights champion health and metrics gaps in the morning analysis.'),

('morning_briefing', 'methodology_hints.BANT', '{
  "gap_analysis_emphasis": ["budget_confirmed", "authority_identified", "need_defined"],
  "briefing_sections": {
    "budget": "Flag deals where budget has not been confirmed in the last 30 days",
    "authority": "Highlight deals where the economic buyer has not been engaged",
    "need": "Surface deals with no documented pain point or business need in CRM notes"
  },
  "prompt_injection": "You are using BANT methodology. In the gap analysis, prioritise whether budget is confirmed and the economic buyer is identified. Flag any deal missing authority or need qualification."
}'::jsonb,
  'Briefing emphasis rules when active_methodology = BANT. Highlights budget and authority gaps in the morning analysis.'),

('morning_briefing', 'methodology_hints.SPIN', '{
  "gap_analysis_emphasis": ["implication_questions_asked", "need_payoff_confirmed"],
  "briefing_sections": {
    "situation": "Review whether situation questions were logged in the last meeting",
    "implication": "Flag deals where implication and need-payoff have not been discussed",
    "next_question": "Suggest the most impactful SPIN question for today''s meetings"
  },
  "prompt_injection": "You are using SPIN Selling. In the gap analysis, focus on whether implication and need-payoff conversations have happened. Suggest a targeted SPIN question for each priority meeting today."
}'::jsonb,
  'Briefing emphasis rules when active_methodology = SPIN. Focuses on implication and need-payoff question gaps.'),

('morning_briefing', 'methodology_hints.Challenger', '{
  "gap_analysis_emphasis": ["commercial_insight_delivered", "reframe_opportunity"],
  "briefing_sections": {
    "insight": "Flag deals where a commercial insight or reframe has not been delivered",
    "tailoring": "Highlight deals where messaging has not been tailored to the buyer''s role",
    "tension": "Surface deals ready for constructive tension — late-stage with no concrete next step"
  },
  "prompt_injection": "You are using Challenger Sale. In the gap analysis, identify deals where a commercial insight has not been delivered or where constructive tension would accelerate commitment. Prioritise tailored messaging opportunities."
}'::jsonb,
  'Briefing emphasis rules when active_methodology = Challenger. Emphasises commercial insight delivery and constructive tension.'),

('morning_briefing', 'methodology_hints.generic', '{
  "gap_analysis_emphasis": ["last_activity_recency", "next_step_defined", "deal_momentum"],
  "briefing_sections": {
    "activity": "Flag deals with no activity in the last 14 days",
    "next_step": "Surface deals with no defined next step or overdue next step",
    "momentum": "Highlight deals that advanced stage in the last 7 days"
  },
  "prompt_injection": "Review each deal for activity recency, defined next steps, and forward momentum. Flag stalled deals and celebrate recent stage progressions."
}'::jsonb,
  'Default gap analysis rules when no specific methodology is active. Covers activity recency, next-step discipline, and momentum.')

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
  RAISE NOTICE 'Migration: 20260222500002_morning_briefing_agent_config.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story covered: BRF-002';
  RAISE NOTICE '';
  RAISE NOTICE 'Seed data added to agent_config_defaults (morning_briefing):';
  RAISE NOTICE '  New keys:';
  RAISE NOTICE '    - briefing_format            (detailed | summary, default: detailed)';
  RAISE NOTICE '    - pipeline_math_enabled       (boolean, default: true)';
  RAISE NOTICE '    - quarter_start_month         (int 1-12, default: 1)';
  RAISE NOTICE '    - overnight_summary_enabled   (boolean, default: true)';
  RAISE NOTICE '    - delivery_time              (HH:MM string, default: 08:00)';
  RAISE NOTICE '    - delivery_method            (slack_dm | slack_channel | in_app)';
  RAISE NOTICE '';
  RAISE NOTICE '  Methodology override hints (gap_analysis_emphasis + prompt_injection):';
  RAISE NOTICE '    - methodology_hints.MEDDIC   (champion + metrics emphasis)';
  RAISE NOTICE '    - methodology_hints.BANT     (budget + authority emphasis)';
  RAISE NOTICE '    - methodology_hints.SPIN     (implication + need-payoff emphasis)';
  RAISE NOTICE '    - methodology_hints.Challenger (insight + tension emphasis)';
  RAISE NOTICE '    - methodology_hints.generic  (activity + next-step + momentum)';
  RAISE NOTICE '';
  RAISE NOTICE 'Quota config (stored separately in agent_config_org_overrides):';
  RAISE NOTICE '  Keys: quota.revenue, quota.deals_closed,';
  RAISE NOTICE '        quota.pipeline_generated, quota.coverage_ratio_target';
  RAISE NOTICE '  (Set by org admins, resolved via resolve_agent_config() at runtime)';
  RAISE NOTICE '';
  RAISE NOTICE 'All inserts use ON CONFLICT DO UPDATE — safe to re-run.';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
