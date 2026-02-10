-- ============================================================================
-- Planner Model Support for AI Feature Config
-- ============================================================================
-- Adds planner_model_id to ai_feature_config and org_ai_config tables.
-- The "planner" model handles reasoning/routing/tool selection, while the
-- existing primary_model_id (the "driver") does the actual work.
-- This is ADDITIVE ONLY — no existing columns are renamed or removed.

-- ============================================================================
-- 0. Ensure org_ai_config table exists (prerequisite)
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES ai_feature_config(feature_key) ON DELETE CASCADE,
  model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
  is_enabled BOOLEAN DEFAULT true,
  custom_temperature DECIMAL(3, 2),
  custom_max_tokens INTEGER,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_org_ai_config_org_id ON org_ai_config(org_id);
CREATE INDEX IF NOT EXISTS idx_org_ai_config_feature_key ON org_ai_config(feature_key);

CREATE OR REPLACE FUNCTION update_org_ai_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_org_ai_config_updated_at ON org_ai_config;
CREATE TRIGGER trigger_org_ai_config_updated_at
  BEFORE UPDATE ON org_ai_config
  FOR EACH ROW
  EXECUTE FUNCTION update_org_ai_config_updated_at();

ALTER TABLE org_ai_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read their org_ai_config" ON org_ai_config;
CREATE POLICY "Org members can read their org_ai_config"
  ON org_ai_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = org_ai_config.org_id
      AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org admins can manage their org_ai_config" ON org_ai_config;
CREATE POLICY "Org admins can manage their org_ai_config"
  ON org_ai_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = org_ai_config.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Platform admins can manage all org_ai_config" ON org_ai_config;
CREATE POLICY "Platform admins can manage all org_ai_config"
  ON org_ai_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- ============================================================================
-- 1. ALTER ai_feature_config — add planner_model_id
-- ============================================================================

ALTER TABLE ai_feature_config
ADD COLUMN IF NOT EXISTS planner_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL;

COMMENT ON COLUMN ai_feature_config.planner_model_id IS 'AI model for planning/reasoning phase (nullable - not all features use planning)';

-- ============================================================================
-- 2. ALTER org_ai_config — add planner_model_id
-- ============================================================================

ALTER TABLE org_ai_config
ADD COLUMN IF NOT EXISTS planner_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL;

COMMENT ON COLUMN org_ai_config.planner_model_id IS 'Org-level override for planner model';

-- ============================================================================
-- 3. Update get_org_effective_ai_config — add planner info
-- ============================================================================

CREATE OR REPLACE FUNCTION get_org_effective_ai_config(
  p_org_id UUID
) RETURNS TABLE (
  feature_key TEXT,
  display_name TEXT,
  category TEXT,
  model_id UUID,
  model_name TEXT,
  provider ai_provider,
  is_override BOOLEAN,
  is_enabled BOOLEAN,
  planner_model_id UUID,
  planner_model_name TEXT,
  planner_provider ai_provider,
  is_planner_override BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.feature_key,
    fc.display_name,
    fc.category,
    COALESCE(oac.model_id, fc.primary_model_id) AS model_id,
    am.display_name AS model_name,
    am.provider,
    (oac.model_id IS NOT NULL) AS is_override,
    COALESCE(oac.is_enabled, fc.is_enabled) AS is_enabled,
    COALESCE(oac.planner_model_id, fc.planner_model_id) AS planner_model_id,
    pm.display_name AS planner_model_name,
    pm.provider AS planner_provider,
    (oac.planner_model_id IS NOT NULL) AS is_planner_override
  FROM ai_feature_config fc
  LEFT JOIN org_ai_config oac ON oac.feature_key = fc.feature_key AND oac.org_id = p_org_id
  LEFT JOIN ai_models am ON am.id = COALESCE(oac.model_id, fc.primary_model_id)
  LEFT JOIN ai_models pm ON pm.id = COALESCE(oac.planner_model_id, fc.planner_model_id)
  WHERE fc.is_enabled = true
  ORDER BY fc.category, fc.display_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. Update get_model_for_feature — add p_role parameter
-- ============================================================================

CREATE OR REPLACE FUNCTION get_model_for_feature(
  p_feature_key TEXT,
  p_org_id UUID DEFAULT NULL,
  p_role TEXT DEFAULT 'driver'
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
  v_planner_model_id UUID;
BEGIN
  -- Get feature config
  SELECT * INTO v_config
  FROM ai_feature_config afc
  WHERE afc.feature_key = p_feature_key AND afc.is_enabled = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- ---------------------------------------------------------------
  -- PLANNER role: resolve planner_model_id, fall back to driver
  -- ---------------------------------------------------------------
  IF p_role = 'planner' THEN
    -- Check org-level planner override first
    IF p_org_id IS NOT NULL THEN
      SELECT oac.planner_model_id INTO v_planner_model_id
      FROM org_ai_config oac
      WHERE oac.org_id = p_org_id
        AND oac.feature_key = p_feature_key
        AND oac.planner_model_id IS NOT NULL;
    END IF;

    -- Fall back to global planner
    IF v_planner_model_id IS NULL THEN
      v_planner_model_id := v_config.planner_model_id;
    END IF;

    -- If a planner model is configured, try to return it
    IF v_planner_model_id IS NOT NULL THEN
      SELECT am.id, am.provider, am.model_id INTO v_primary_model
      FROM ai_models am
      WHERE am.id = v_planner_model_id
        AND am.is_available = true;

      IF FOUND THEN
        RETURN QUERY SELECT v_primary_model.id, v_primary_model.provider, v_primary_model.model_id, false;
        RETURN;
      END IF;
    END IF;

    -- No planner configured or planner unavailable — fall through to driver logic
  END IF;

  -- ---------------------------------------------------------------
  -- DRIVER role (default) — existing behavior
  -- ---------------------------------------------------------------

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
-- 5. Seed planner models for features that support planning
-- ============================================================================

DO $$
DECLARE
  v_claude_sonnet_id UUID;
  v_gemini_pro_id UUID;
BEGIN
  SELECT id INTO v_claude_sonnet_id FROM ai_models WHERE provider = 'anthropic' AND model_id = 'claude-sonnet-4-20250514' LIMIT 1;
  SELECT id INTO v_gemini_pro_id FROM ai_models WHERE provider = 'google' AND model_id = 'gemini-2.5-pro' LIMIT 1;

  UPDATE ai_feature_config SET planner_model_id = v_gemini_pro_id WHERE feature_key = 'copilot_chat';
  UPDATE ai_feature_config SET planner_model_id = v_claude_sonnet_id WHERE feature_key = 'copilot_autonomous';
  UPDATE ai_feature_config SET planner_model_id = v_gemini_pro_id WHERE feature_key = 'generate_proposal';
END $$;

-- ============================================================================
-- 6. Update function comments
-- ============================================================================

COMMENT ON FUNCTION get_model_for_feature(TEXT, UUID, TEXT) IS 'Returns the appropriate model for a feature by role (driver or planner), considering org overrides and fallbacks';
COMMENT ON FUNCTION get_org_effective_ai_config IS 'Returns effective AI config for an org, merging global defaults with org overrides, including planner models';
