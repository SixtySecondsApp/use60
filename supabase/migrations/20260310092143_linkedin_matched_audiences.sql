-- Migration: linkedin_matched_audiences
-- Date: 20260310092143
--
-- What this migration does:
--   Creates linkedin_matched_audiences table for DMP segments (contact/company lists)
--   synced with the LinkedIn Advertising API. Supports creation from ops tables, CSV, or manual.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS linkedin_matched_audiences CASCADE;

-- ---------------------------------------------------------------------------
-- Table: linkedin_matched_audiences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS linkedin_matched_audiences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id   text NOT NULL,
  linkedin_segment_id text,  -- LinkedIn DMP segment URN, null until synced
  name            text NOT NULL,
  audience_type   text NOT NULL DEFAULT 'CONTACT_LIST'
    CHECK (audience_type IN ('CONTACT_LIST', 'COMPANY_LIST')),
  description     text,
  member_count    integer DEFAULT 0,
  match_rate      numeric(5,2),  -- percentage matched by LinkedIn
  upload_status   text DEFAULT 'PENDING'
    CHECK (upload_status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED')),
  source_type     text
    CHECK (source_type IS NULL OR source_type IN ('csv', 'ops_table', 'manual', 'contacts')),
  source_table_id uuid REFERENCES dynamic_tables(id) ON DELETE SET NULL,
  source_row_count integer,
  last_upload_at  timestamptz,
  error_message   text,
  version_tag     text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_matched_audiences_org
  ON linkedin_matched_audiences(org_id);
CREATE INDEX IF NOT EXISTS idx_matched_audiences_account
  ON linkedin_matched_audiences(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_matched_audiences_status
  ON linkedin_matched_audiences(upload_status);
CREATE INDEX IF NOT EXISTS idx_matched_audiences_source_table
  ON linkedin_matched_audiences(source_table_id)
  WHERE source_table_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE linkedin_matched_audiences ENABLE ROW LEVEL SECURITY;

-- Service role bypass
DROP POLICY IF EXISTS "service_role_matched_audiences" ON linkedin_matched_audiences;
CREATE POLICY "service_role_matched_audiences"
  ON linkedin_matched_audiences FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Org members can read
DROP POLICY IF EXISTS "org_members_select_matched_audiences" ON linkedin_matched_audiences;
CREATE POLICY "org_members_select_matched_audiences"
  ON linkedin_matched_audiences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = linkedin_matched_audiences.org_id
        AND om.user_id = auth.uid()
    )
  );

-- Org members can insert
DROP POLICY IF EXISTS "org_members_insert_matched_audiences" ON linkedin_matched_audiences;
CREATE POLICY "org_members_insert_matched_audiences"
  ON linkedin_matched_audiences FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = linkedin_matched_audiences.org_id
        AND om.user_id = auth.uid()
    )
  );

-- Org members can update
DROP POLICY IF EXISTS "org_members_update_matched_audiences" ON linkedin_matched_audiences;
CREATE POLICY "org_members_update_matched_audiences"
  ON linkedin_matched_audiences FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = linkedin_matched_audiences.org_id
        AND om.user_id = auth.uid()
    )
  );

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_matched_audiences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_matched_audiences_updated_at ON linkedin_matched_audiences;
CREATE TRIGGER trg_matched_audiences_updated_at
  BEFORE UPDATE ON linkedin_matched_audiences
  FOR EACH ROW EXECUTE FUNCTION update_matched_audiences_updated_at();
