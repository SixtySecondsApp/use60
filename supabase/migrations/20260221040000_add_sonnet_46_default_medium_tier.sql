-- ============================================================================
-- Add Claude Sonnet 4.6 and default new users to Medium intelligence tier
-- ============================================================================
-- Claude Sonnet 4.6 is the designated Medium tier model.
-- New orgs with no explicit config already fall through to 'medium' tier
-- in costTracking.ts and SimpleModelTierSelector.tsx.

-- 1. Insert Claude Sonnet 4.6 into ai_models
INSERT INTO ai_models (
  provider, model_id, display_name,
  input_cost_per_million, output_cost_per_million,
  context_window, max_output_tokens,
  supports_vision, supports_function_calling, supports_streaming
)
VALUES (
  'anthropic', 'claude-sonnet-4-6-20250929', 'Claude Sonnet 4.6',
  3.00, 15.00,
  200000, 64000,
  true, true, true
)
ON CONFLICT (provider, model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  supports_vision = EXCLUDED.supports_vision,
  supports_function_calling = EXCLUDED.supports_function_calling,
  supports_streaming = EXCLUDED.supports_streaming,
  is_available = true,
  is_deprecated = false,
  last_synced_at = NOW();

-- 2. Update ai_feature_config to use Claude Sonnet 4.6 as primary model
--    for features that should default to Medium tier quality.
--    This ensures new orgs (with no org_ai_config overrides) get Sonnet 4.6.
DO $$
DECLARE
  v_sonnet_46_id UUID;
  v_haiku_45_id UUID;
BEGIN
  SELECT id INTO v_sonnet_46_id
  FROM ai_models
  WHERE provider = 'anthropic' AND model_id = 'claude-sonnet-4-6-20250929'
  LIMIT 1;

  SELECT id INTO v_haiku_45_id
  FROM ai_models
  WHERE provider = 'anthropic' AND model_id = 'claude-haiku-4-5-20251001'
  LIMIT 1;

  IF v_sonnet_46_id IS NULL THEN
    RAISE NOTICE 'Claude Sonnet 4.6 not found in ai_models, skipping feature config update';
    RETURN;
  END IF;

  -- Copilot features → Sonnet 4.6 primary, Haiku 4.5 fallback
  UPDATE ai_feature_config
  SET primary_model_id = v_sonnet_46_id,
      fallback_model_id = COALESCE(v_haiku_45_id, fallback_model_id)
  WHERE feature_key IN ('copilot_chat', 'copilot_autonomous', 'entity_resolution');

  -- Meeting features → Sonnet 4.6 primary
  UPDATE ai_feature_config
  SET primary_model_id = v_sonnet_46_id,
      fallback_model_id = COALESCE(v_haiku_45_id, fallback_model_id)
  WHERE feature_key IN ('extract_action_items', 'analyze_action_item', 'condense_meeting_summary', 'meeting_scorecard');

  -- Enrichment features → Sonnet 4.6 primary
  UPDATE ai_feature_config
  SET primary_model_id = v_sonnet_46_id,
      fallback_model_id = COALESCE(v_haiku_45_id, fallback_model_id)
  WHERE feature_key IN ('enrich_crm_record', 'enrich_organization', 'deep_enrich_organization', 'enrich_dynamic_table');

  -- Content features → Sonnet 4.6 primary
  UPDATE ai_feature_config
  SET primary_model_id = v_sonnet_46_id,
      fallback_model_id = COALESCE(v_haiku_45_id, fallback_model_id)
  WHERE feature_key IN ('categorize_email', 'analyze_email', 'analyze_writing_style', 'generate_marketing_content');

  -- Document & Skills & Intelligence → Sonnet 4.6 primary
  UPDATE ai_feature_config
  SET primary_model_id = v_sonnet_46_id,
      fallback_model_id = COALESCE(v_haiku_45_id, fallback_model_id)
  WHERE feature_key IN ('generate_proposal', 'skill_builder', 'suggest_next_actions');

  RAISE NOTICE 'Updated all ai_feature_config rows to use Claude Sonnet 4.6 (%) as primary model', v_sonnet_46_id;
END $$;
