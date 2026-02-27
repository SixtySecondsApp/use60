-- ============================================================================
-- AI Feature Configuration Table
-- ============================================================================
-- Maps platform features to their configured AI models with fallbacks
-- Super admins can configure globally, changes take effect immediately

CREATE TABLE IF NOT EXISTS ai_feature_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Feature identification
  feature_key TEXT NOT NULL UNIQUE,  -- e.g., 'copilot_chat', 'enrich_crm_record'
  display_name TEXT NOT NULL,  -- Human-readable name
  description TEXT,  -- Description of what this feature does
  category TEXT NOT NULL,  -- 'Copilot', 'Enrichment', 'Meetings', 'Content', 'Documents', 'Skills', 'Intelligence'

  -- Model configuration
  primary_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
  fallback_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,

  -- Feature settings
  is_enabled BOOLEAN DEFAULT true,
  max_input_tokens INTEGER,  -- Optional limit on input tokens
  max_output_tokens INTEGER,  -- Optional limit on output tokens
  temperature DECIMAL(3, 2) DEFAULT 0.7,

  -- Metadata
  settings JSONB DEFAULT '{}',  -- Additional feature-specific settings

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ai_feature_config_category
  ON ai_feature_config(category);

CREATE INDEX IF NOT EXISTS idx_ai_feature_config_enabled
  ON ai_feature_config(is_enabled)
  WHERE is_enabled = true;

-- ============================================================================
-- Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION update_ai_feature_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ai_feature_config_updated_at ON ai_feature_config;
CREATE TRIGGER trigger_ai_feature_config_updated_at
  BEFORE UPDATE ON ai_feature_config
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_feature_config_updated_at();

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE ai_feature_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read feature config
DROP POLICY IF EXISTS "Anyone can read ai_feature_config" ON ai_feature_config;
DO $$ BEGIN
  CREATE POLICY "Anyone can read ai_feature_config"
  ON ai_feature_config FOR SELECT
  USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only platform admins can modify
DROP POLICY IF EXISTS "Platform admins can manage ai_feature_config" ON ai_feature_config;
DO $$ BEGIN
  CREATE POLICY "Platform admins can manage ai_feature_config"
  ON ai_feature_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Helper Function to Get Model for Feature
-- ============================================================================

CREATE OR REPLACE FUNCTION get_model_for_feature(
  p_feature_key TEXT,
  p_org_id UUID DEFAULT NULL
) RETURNS TABLE (
  model_id UUID,
  provider ai_provider,
  model_identifier TEXT,
  is_fallback BOOLEAN
) AS $$
DECLARE
  v_config RECORD;
  v_org_override RECORD;
  v_primary_model RECORD;
  v_fallback_model RECORD;
BEGIN
  -- Get feature config
  SELECT * INTO v_config
  FROM ai_feature_config
  WHERE feature_key = p_feature_key AND is_enabled = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Check for org-level override first
  IF p_org_id IS NOT NULL THEN
    SELECT oac.model_id INTO v_org_override
    FROM org_ai_config oac
    WHERE oac.org_id = p_org_id
      AND oac.feature_key = p_feature_key
      AND oac.model_id IS NOT NULL;

    IF FOUND THEN
      SELECT am.id, am.provider, am.model_id INTO v_primary_model
      FROM ai_models am
      WHERE am.id = v_org_override.model_id
        AND am.is_available = true;

      IF FOUND THEN
        RETURN QUERY SELECT v_primary_model.id, v_primary_model.provider, v_primary_model.model_id, false;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Try primary model
  SELECT am.id, am.provider, am.model_id INTO v_primary_model
  FROM ai_models am
  WHERE am.id = v_config.primary_model_id
    AND am.is_available = true;

  IF FOUND THEN
    RETURN QUERY SELECT v_primary_model.id, v_primary_model.provider, v_primary_model.model_id, false;
    RETURN;
  END IF;

  -- Try fallback model
  SELECT am.id, am.provider, am.model_id INTO v_fallback_model
  FROM ai_models am
  WHERE am.id = v_config.fallback_model_id
    AND am.is_available = true;

  IF FOUND THEN
    RETURN QUERY SELECT v_fallback_model.id, v_fallback_model.provider, v_fallback_model.model_id, true;
    RETURN;
  END IF;

  -- No available model found
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Seed Data - Feature Configurations
-- ============================================================================

-- First, we need to get model IDs. Using a DO block for this.
DO $$
DECLARE
  v_claude_sonnet_46_id UUID;
  v_claude_haiku_id UUID;
  v_gemini_flash_id UUID;
  v_gemini_pro_id UUID;
BEGIN
  -- Get model IDs (Sonnet 4.6 is the default Medium tier model)
  SELECT id INTO v_claude_sonnet_46_id FROM ai_models WHERE provider = 'anthropic' AND model_id = 'claude-sonnet-4-6-20250929' LIMIT 1;
  SELECT id INTO v_claude_haiku_id FROM ai_models WHERE provider = 'anthropic' AND model_id = 'claude-haiku-4-5-20251001' LIMIT 1;
  SELECT id INTO v_gemini_flash_id FROM ai_models WHERE provider = 'google' AND model_id = 'gemini-2.5-flash' LIMIT 1;
  SELECT id INTO v_gemini_pro_id FROM ai_models WHERE provider = 'google' AND model_id = 'gemini-2.5-pro' LIMIT 1;

  -- Copilot Features (Medium tier: Sonnet 4.6 primary, Haiku 4.5 fallback)
  INSERT INTO ai_feature_config (feature_key, display_name, description, category, primary_model_id, fallback_model_id, temperature)
  VALUES
    ('copilot_chat', 'Copilot Chat', 'Main copilot conversation interface', 'Copilot', v_claude_sonnet_46_id, v_claude_haiku_id, 0.7),
    ('copilot_autonomous', 'Autonomous Skills', 'Autonomous skill execution with tool use', 'Copilot', v_claude_sonnet_46_id, v_claude_haiku_id, 0.5),
    ('entity_resolution', 'Entity Resolution', 'Resolve ambiguous person/company references', 'Copilot', v_claude_sonnet_46_id, v_claude_haiku_id, 0.3)
  ON CONFLICT (feature_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    primary_model_id = EXCLUDED.primary_model_id,
    fallback_model_id = EXCLUDED.fallback_model_id;

  -- Enrichment Features (Medium tier: Sonnet 4.6 primary, Haiku 4.5 fallback)
  INSERT INTO ai_feature_config (feature_key, display_name, description, category, primary_model_id, fallback_model_id, temperature)
  VALUES
    ('enrich_crm_record', 'CRM Record Enrichment', 'Enrich contact/company records with AI', 'Enrichment', v_claude_sonnet_46_id, v_claude_haiku_id, 0.3),
    ('enrich_organization', 'Organization Enrichment', 'Basic organization profile enrichment', 'Enrichment', v_claude_sonnet_46_id, v_claude_haiku_id, 0.3),
    ('deep_enrich_organization', 'Deep Organization Profile', 'Comprehensive organization profiling', 'Enrichment', v_claude_sonnet_46_id, v_claude_haiku_id, 0.5),
    ('enrich_dynamic_table', 'Dynamic Table Enrichment', 'Batch enrichment for ops tables', 'Enrichment', v_claude_sonnet_46_id, v_claude_haiku_id, 0.3)
  ON CONFLICT (feature_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    primary_model_id = EXCLUDED.primary_model_id,
    fallback_model_id = EXCLUDED.fallback_model_id;

  -- Meeting Features (Medium tier: Sonnet 4.6 primary, Haiku 4.5 fallback)
  INSERT INTO ai_feature_config (feature_key, display_name, description, category, primary_model_id, fallback_model_id, temperature)
  VALUES
    ('extract_action_items', 'Action Item Extraction', 'Extract action items from meeting transcripts', 'Meetings', v_claude_sonnet_46_id, v_claude_haiku_id, 0.3),
    ('analyze_action_item', 'Action Item Analysis', 'Analyze and categorize action items', 'Meetings', v_claude_sonnet_46_id, v_claude_haiku_id, 0.3),
    ('condense_meeting_summary', 'Meeting Summary', 'Condense meeting transcripts into summaries', 'Meetings', v_claude_sonnet_46_id, v_claude_haiku_id, 0.5),
    ('meeting_scorecard', 'Meeting Scorecard', 'Generate meeting quality scorecards', 'Meetings', v_claude_sonnet_46_id, v_claude_haiku_id, 0.5)
  ON CONFLICT (feature_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    primary_model_id = EXCLUDED.primary_model_id,
    fallback_model_id = EXCLUDED.fallback_model_id;

  -- Content Features (Medium tier: Sonnet 4.6 primary, Haiku 4.5 fallback)
  INSERT INTO ai_feature_config (feature_key, display_name, description, category, primary_model_id, fallback_model_id, temperature)
  VALUES
    ('categorize_email', 'Email Categorization', 'Categorize emails by type and intent', 'Content', v_claude_sonnet_46_id, v_claude_haiku_id, 0.3),
    ('analyze_email', 'Email Analysis', 'Analyze email content and sentiment', 'Content', v_claude_sonnet_46_id, v_claude_haiku_id, 0.5),
    ('analyze_writing_style', 'Writing Style Analysis', 'Analyze user writing style for personalization', 'Content', v_claude_sonnet_46_id, v_claude_haiku_id, 0.5),
    ('generate_marketing_content', 'Marketing Content', 'Generate marketing copy and content', 'Content', v_claude_sonnet_46_id, v_claude_haiku_id, 0.7)
  ON CONFLICT (feature_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    primary_model_id = EXCLUDED.primary_model_id,
    fallback_model_id = EXCLUDED.fallback_model_id;

  -- Document Features (Medium tier: Sonnet 4.6 primary, Haiku 4.5 fallback)
  INSERT INTO ai_feature_config (feature_key, display_name, description, category, primary_model_id, fallback_model_id, temperature)
  VALUES
    ('generate_proposal', 'Proposal Generation', 'Generate sales proposals and quotes', 'Documents', v_claude_sonnet_46_id, v_claude_haiku_id, 0.7)
  ON CONFLICT (feature_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    primary_model_id = EXCLUDED.primary_model_id,
    fallback_model_id = EXCLUDED.fallback_model_id;

  -- Skills Features (Medium tier: Sonnet 4.6 primary, Haiku 4.5 fallback)
  INSERT INTO ai_feature_config (feature_key, display_name, description, category, primary_model_id, fallback_model_id, temperature)
  VALUES
    ('skill_builder', 'Skill Builder', 'AI-assisted skill creation and refinement', 'Skills', v_claude_sonnet_46_id, v_claude_haiku_id, 0.7)
  ON CONFLICT (feature_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    primary_model_id = EXCLUDED.primary_model_id,
    fallback_model_id = EXCLUDED.fallback_model_id;

  -- Intelligence Features (Medium tier: Sonnet 4.6 primary, Haiku 4.5 fallback)
  INSERT INTO ai_feature_config (feature_key, display_name, description, category, primary_model_id, fallback_model_id, temperature)
  VALUES
    ('suggest_next_actions', 'Next Actions Suggestion', 'Suggest next best actions for deals/contacts', 'Intelligence', v_claude_sonnet_46_id, v_claude_haiku_id, 0.5)
  ON CONFLICT (feature_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    primary_model_id = EXCLUDED.primary_model_id,
    fallback_model_id = EXCLUDED.fallback_model_id;
END $$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE ai_feature_config IS 'Global configuration mapping platform features to AI models';
COMMENT ON COLUMN ai_feature_config.feature_key IS 'Unique identifier for the feature (used in code)';
COMMENT ON COLUMN ai_feature_config.primary_model_id IS 'Primary AI model to use for this feature';
COMMENT ON COLUMN ai_feature_config.fallback_model_id IS 'Fallback model if primary is unavailable';
COMMENT ON FUNCTION get_model_for_feature IS 'Returns the appropriate model for a feature, considering org overrides and fallbacks';
