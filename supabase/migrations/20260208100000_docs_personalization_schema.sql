-- Documentation Personalization Schema
-- DOCS-101: Add metadata fields for integration-aware filtering, role-based visibility, and personalization context

-- Add a comment documenting the expected metadata JSONB structure for docs_articles
COMMENT ON COLUMN docs_articles.metadata IS 'JSONB with optional fields: required_integrations (text[]), required_features (text[]), target_roles (text[]), personalization_vars (text[])';

-- Create index for filtering articles by required integrations
CREATE INDEX IF NOT EXISTS idx_docs_articles_metadata_integrations
  ON docs_articles USING gin ((metadata->'required_integrations'));

-- Create index for filtering articles by target roles
CREATE INDEX IF NOT EXISTS idx_docs_articles_metadata_roles
  ON docs_articles USING gin ((metadata->'target_roles'));

-- Personalization context cache table
-- Caches org-specific context (contact names, deal names, etc.) for fast template variable resolution
CREATE TABLE IF NOT EXISTS docs_personalization_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  context_key TEXT NOT NULL,
  context_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, context_key)
);

CREATE INDEX IF NOT EXISTS idx_docs_personalization_context_org
  ON docs_personalization_context(org_id);

-- Enable RLS
ALTER TABLE docs_personalization_context ENABLE ROW LEVEL SECURITY;

-- Users can read their org's personalization context
CREATE POLICY "Users can read own org personalization context"
  ON docs_personalization_context FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
      AND organization_memberships.org_id = docs_personalization_context.org_id
    )
  );

-- Admins can manage personalization context
CREATE POLICY "Admins can manage personalization context"
  ON docs_personalization_context FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
      AND organization_memberships.org_id = docs_personalization_context.org_id
      AND organization_memberships.role IN ('admin', 'owner')
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_docs_personalization_context_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER docs_personalization_context_updated_at
  BEFORE UPDATE ON docs_personalization_context
  FOR EACH ROW
  EXECUTE FUNCTION update_docs_personalization_context_updated_at();
