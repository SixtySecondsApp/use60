-- ============================================================================
-- Organization AI Configuration Table
-- ============================================================================
-- Allows organizations to override default model selections per feature
-- Usage is still tracked regardless of override

CREATE TABLE IF NOT EXISTS org_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization reference
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Feature override
  feature_key TEXT NOT NULL REFERENCES ai_feature_config(feature_key) ON DELETE CASCADE,

  -- Model override (NULL means use global default)
  model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,

  -- Override settings
  is_enabled BOOLEAN DEFAULT true,  -- Can disable a feature for this org
  custom_temperature DECIMAL(3, 2),  -- Override temperature if needed
  custom_max_tokens INTEGER,  -- Override max tokens if needed

  -- Metadata
  notes TEXT,  -- Admin notes about why this override exists
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one config per org per feature
  UNIQUE(org_id, feature_key)
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_org_ai_config_org_id
  ON org_ai_config(org_id);

CREATE INDEX IF NOT EXISTS idx_org_ai_config_feature_key
  ON org_ai_config(feature_key);

-- ============================================================================
-- Triggers
-- ============================================================================

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

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE org_ai_config ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's config
DROP POLICY IF EXISTS "Org members can read their org_ai_config" ON org_ai_config;
DO $$ BEGIN
  CREATE POLICY "Org members can read their org_ai_config"
  ON org_ai_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = org_ai_config.org_id
      AND om.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins can manage their org's config
DROP POLICY IF EXISTS "Org admins can manage their org_ai_config" ON org_ai_config;
DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Platform admins can manage all configs
DROP POLICY IF EXISTS "Platform admins can manage all org_ai_config" ON org_ai_config;
DO $$ BEGIN
  CREATE POLICY "Platform admins can manage all org_ai_config"
  ON org_ai_config FOR ALL
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
-- Helper Function to Get Effective Config for Org
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
  is_enabled BOOLEAN
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
    COALESCE(oac.is_enabled, fc.is_enabled) AS is_enabled
  FROM ai_feature_config fc
  LEFT JOIN org_ai_config oac ON oac.feature_key = fc.feature_key AND oac.org_id = p_org_id
  LEFT JOIN ai_models am ON am.id = COALESCE(oac.model_id, fc.primary_model_id)
  WHERE fc.is_enabled = true
  ORDER BY fc.category, fc.display_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE org_ai_config IS 'Organization-level AI model configuration overrides';
COMMENT ON COLUMN org_ai_config.model_id IS 'Override model ID, NULL means use global default';
COMMENT ON COLUMN org_ai_config.notes IS 'Admin notes explaining the override reason';
COMMENT ON FUNCTION get_org_effective_ai_config IS 'Returns effective AI config for an org, merging global defaults with org overrides';
