-- ============================================================================
-- Credit Menu Audit: Add 5 new actions + activate 9 draft items
-- ============================================================================
-- New actions: instant_replay, writing_style_analysis, fact_profile_research,
--              battlecard_generation, linkedin_enrichment
-- Activations: notetaker_bot, pre_meeting_brief, transcript_search,
--              deal_proposal, coaching_analysis, deal_intelligence,
--              lead_qualification, competitor_intel, deal_rescue_plan
-- ============================================================================

-- ── Insert 5 new actions ────────────────────────────────────────────────────

INSERT INTO credit_menu (
  action_id, display_name, description, category, unit,
  cost_low, cost_medium, cost_high, is_active, free_with_sub, is_flat_rate, updated_by
) VALUES

  ('instant_replay',
   'Instant Replay',
   'Full pipeline run (summary + actions + email)',
   'ai_actions', 'per run',
   1.5, 3.0, 5.0, true, false, false, 'system:migration'),

  ('writing_style_analysis',
   'Writing Style Analysis',
   'Brand voice learning',
   'ai_actions', 'per analysis',
   0.5, 1.0, 2.0, true, false, false, 'system:migration'),

  ('fact_profile_research',
   'Fact Profile Research',
   'Organization fact profile',
   'enrichment', 'per profile',
   0.3, 1.0, 2.5, true, false, false, 'system:migration'),

  ('battlecard_generation',
   'Battlecard Generation',
   'Competitive battlecard',
   'ai_actions', 'per battlecard',
   0.5, 1.5, 3.0, true, false, false, 'system:migration'),

  ('linkedin_enrichment',
   'LinkedIn Enrichment',
   'LinkedIn profile data (flat rate)',
   'enrichment', 'per contact',
   0.3, 0.3, 0.3, true, false, true, 'system:migration')

ON CONFLICT (action_id) DO NOTHING;

-- ── Activate 9 existing draft items ────────────────────────────────────────

UPDATE credit_menu
SET
  is_active  = true,
  updated_by = 'system:migration'
WHERE action_id IN (
  'notetaker_bot',
  'pre_meeting_brief',
  'transcript_search',
  'deal_proposal',
  'coaching_analysis',
  'deal_intelligence',
  'lead_qualification',
  'competitor_intel',
  'deal_rescue_plan'
)
AND is_active = false;
