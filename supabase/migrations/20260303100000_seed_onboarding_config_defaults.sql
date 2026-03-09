-- ============================================================================
-- Migration: Seed Onboarding Config Defaults (US-006)
-- Purpose: Add 14 config keys used by AgentConfigConfirmStep during onboarding.
--          The agent-config-admin edge function validates each key exists in
--          agent_config_defaults before allowing set_org_override. Without these
--          rows the onboarding step throws "Failed to save configuration".
--
-- Agent type mapping comes from agentTypeForKey() in AgentConfigConfirmStep.tsx:
--   category 'pipeline' → agent_type 'deal_risk'
--   category 'sales'    → agent_type 'crm_update'
--   category 'company'  → agent_type 'morning_briefing'
--
-- Date: 2026-03-03
-- ============================================================================

INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description) VALUES

-- ============================================================================
-- DEAL RISK agent — pipeline category keys
-- ============================================================================

('deal_risk', 'fiscal_year_start_month', '"1"'::jsonb,
 'Month the fiscal year starts (1=Jan … 12=Dec). Used to align quarter-phase calculations with the org''s calendar.'),

('deal_risk', 'typical_deal_size_range', '""'::jsonb,
 'Typical deal size range as a free-text descriptor (e.g. "$10k–$50k"). Informs deal risk scoring thresholds.'),

('deal_risk', 'average_sales_cycle_days', '90'::jsonb,
 'Average number of days from first touch to close. Used to assess whether a deal is running ahead or behind schedule.'),

('deal_risk', 'crm_stage_mapping', '""'::jsonb,
 'Free-text description of the org''s CRM pipeline stages. Helps the agent interpret stage labels that differ from defaults.'),

-- ============================================================================
-- CRM UPDATE agent — sales category keys
-- ============================================================================

('crm_update', 'sales_methodology', '"generic"'::jsonb,
 'Active sales methodology (generic, meddic, bant, spin, challenger). Shapes CRM update prompts and field extraction rules.'),

('crm_update', 'sales_motion_type', '"mid_market"'::jsonb,
 'Sales motion used by the team (plg, mid_market, enterprise, transactional). Adjusts automation defaults accordingly.'),

('crm_update', 'key_competitors', '[]'::jsonb,
 'List of key competitors the org faces. Used to flag competitive mentions in meeting transcripts.'),

('crm_update', 'pricing_model', '"subscription"'::jsonb,
 'Pricing model (subscription, usage_based, one_time, hybrid, freemium). Contextualises deal value and renewal risk signals.'),

('crm_update', 'target_customer_profile', '""'::jsonb,
 'Free-text description of the ideal customer profile. Enriches lead scoring and outreach personalisation.'),

('crm_update', 'common_objections', '[]'::jsonb,
 'List of common objections the sales team encounters. Used to surface matching objection-handling guidance during meeting prep.'),

-- ============================================================================
-- MORNING BRIEFING agent — company category keys
-- ============================================================================

('morning_briefing', 'industry_vertical', '""'::jsonb,
 'Industry or vertical the org operates in (e.g. SaaS, FinTech, Healthcare). Provides context for benchmark comparisons in briefings.'),

('morning_briefing', 'company_size', '""'::jsonb,
 'Company size descriptor (e.g. "1-10", "11-50", "51-200"). Used to calibrate pipeline benchmarks in morning briefings.'),

('morning_briefing', 'product_service_category', '""'::jsonb,
 'Category of the org''s product or service (e.g. "B2B SaaS", "Consulting"). Adds context to daily pipeline narratives.'),

('morning_briefing', 'team_size', '1'::jsonb,
 'Number of people on the sales team. Influences per-rep pipeline targets and workload distribution in briefings.')

ON CONFLICT (agent_type, config_key) DO NOTHING;

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260303100000_seed_onboarding_config_defaults.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Story: US-006 — seed 14 onboarding config keys missing from agent_config_defaults';
  RAISE NOTICE '';
  RAISE NOTICE 'Keys added under agent_type = deal_risk (pipeline category):';
  RAISE NOTICE '  fiscal_year_start_month, typical_deal_size_range,';
  RAISE NOTICE '  average_sales_cycle_days, crm_stage_mapping';
  RAISE NOTICE '';
  RAISE NOTICE 'Keys added under agent_type = crm_update (sales category):';
  RAISE NOTICE '  sales_methodology, sales_motion_type, key_competitors,';
  RAISE NOTICE '  pricing_model, target_customer_profile, common_objections';
  RAISE NOTICE '';
  RAISE NOTICE 'Keys added under agent_type = morning_briefing (company category):';
  RAISE NOTICE '  industry_vertical, company_size,';
  RAISE NOTICE '  product_service_category, team_size';
  RAISE NOTICE '';
  RAISE NOTICE 'ON CONFLICT DO NOTHING — safe to re-run, will not overwrite org overrides.';
  RAISE NOTICE '============================================================================';
END $$;
