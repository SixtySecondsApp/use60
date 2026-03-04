-- Migration: Create pipeline_saved_views table for PIPE-ADV-001
-- Stores named filter presets that users can create, apply, and share

CREATE TABLE IF NOT EXISTS pipeline_saved_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  filters     JSONB NOT NULL DEFAULT '{}',
  is_shared   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by org (covers both user-owned and shared views)
CREATE INDEX IF NOT EXISTS pipeline_saved_views_org_idx ON pipeline_saved_views (org_id);
CREATE INDEX IF NOT EXISTS pipeline_saved_views_user_idx ON pipeline_saved_views (user_id);

-- RLS: Users can see their own views plus shared views from their org
ALTER TABLE pipeline_saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read own and shared views" ON pipeline_saved_views;
CREATE POLICY "users can read own and shared views"
  ON pipeline_saved_views
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (is_shared = true AND org_id IN (
      SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "users can insert own views" ON pipeline_saved_views;
CREATE POLICY "users can insert own views"
  ON pipeline_saved_views
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users can update own views" ON pipeline_saved_views;
CREATE POLICY "users can update own views"
  ON pipeline_saved_views
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users can delete own views" ON pipeline_saved_views;
CREATE POLICY "users can delete own views"
  ON pipeline_saved_views
  FOR DELETE
  USING (user_id = auth.uid());

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_pipeline_saved_views_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pipeline_saved_views_updated_at ON pipeline_saved_views;
CREATE TRIGGER pipeline_saved_views_updated_at
  BEFORE UPDATE ON pipeline_saved_views
  FOR EACH ROW EXECUTE FUNCTION update_pipeline_saved_views_updated_at();
