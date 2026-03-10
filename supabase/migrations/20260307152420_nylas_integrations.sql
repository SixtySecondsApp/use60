-- Migration: nylas_integrations
-- Date: 20260307152420
--
-- What this migration does:
--   Creates the nylas_integrations table for storing Nylas grant connections.
--   Used by paid Google users to access restricted scopes (gmail.readonly,
--   gmail.compose, drive.readonly) via Nylas's pre-verified GCP app.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS nylas_integrations;

CREATE TABLE IF NOT EXISTS nylas_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google',
  email TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- One active integration per user per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_nylas_integrations_user_provider
  ON nylas_integrations (user_id, provider);

CREATE INDEX IF NOT EXISTS idx_nylas_integrations_active
  ON nylas_integrations (is_active) WHERE is_active = true;

-- RLS
ALTER TABLE nylas_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nylas_integrations_user_select" ON nylas_integrations;
CREATE POLICY "nylas_integrations_user_select"
  ON nylas_integrations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "nylas_integrations_user_insert" ON nylas_integrations;
CREATE POLICY "nylas_integrations_user_insert"
  ON nylas_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "nylas_integrations_user_update" ON nylas_integrations;
CREATE POLICY "nylas_integrations_user_update"
  ON nylas_integrations FOR UPDATE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_nylas_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_nylas_integrations_updated_at ON nylas_integrations;
CREATE TRIGGER trigger_nylas_integrations_updated_at
  BEFORE UPDATE ON nylas_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_nylas_integrations_updated_at();
