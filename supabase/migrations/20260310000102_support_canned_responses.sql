-- Migration: Create support_canned_responses table
-- Date: 20260310000002
--
-- What this migration does:
--   Creates the support_canned_responses table for admin agents to use
--   pre-written replies when responding to support tickets.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS support_canned_responses;

CREATE TABLE IF NOT EXISTS support_canned_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  shortcut TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS support_canned_responses_org_id_idx
  ON support_canned_responses (org_id);
CREATE INDEX IF NOT EXISTS support_canned_responses_category_idx
  ON support_canned_responses (category);

-- RLS
ALTER TABLE support_canned_responses ENABLE ROW LEVEL SECURITY;

-- Platform admin: full CRUD
DROP POLICY IF EXISTS "canned_responses_platform_admin_select" ON support_canned_responses;
CREATE POLICY "canned_responses_platform_admin_select"
  ON support_canned_responses FOR SELECT USING (is_admin_optimized());

DROP POLICY IF EXISTS "canned_responses_platform_admin_insert" ON support_canned_responses;
CREATE POLICY "canned_responses_platform_admin_insert"
  ON support_canned_responses FOR INSERT WITH CHECK (is_admin_optimized());

DROP POLICY IF EXISTS "canned_responses_platform_admin_update" ON support_canned_responses;
CREATE POLICY "canned_responses_platform_admin_update"
  ON support_canned_responses FOR UPDATE USING (is_admin_optimized());

DROP POLICY IF EXISTS "canned_responses_platform_admin_delete" ON support_canned_responses;
CREATE POLICY "canned_responses_platform_admin_delete"
  ON support_canned_responses FOR DELETE USING (is_admin_optimized());

-- Org admin: see global + own org, manage own org only
DROP POLICY IF EXISTS "canned_responses_org_admin_select" ON support_canned_responses;
CREATE POLICY "canned_responses_org_admin_select"
  ON support_canned_responses FOR SELECT
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "canned_responses_org_admin_insert" ON support_canned_responses;
CREATE POLICY "canned_responses_org_admin_insert"
  ON support_canned_responses FOR INSERT
  WITH CHECK (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "canned_responses_org_admin_update" ON support_canned_responses;
CREATE POLICY "canned_responses_org_admin_update"
  ON support_canned_responses FOR UPDATE
  USING (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "canned_responses_org_admin_delete" ON support_canned_responses;
CREATE POLICY "canned_responses_org_admin_delete"
  ON support_canned_responses FOR DELETE
  USING (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_support_canned_responses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_support_canned_responses_updated_at ON support_canned_responses;
CREATE TRIGGER trigger_support_canned_responses_updated_at
  BEFORE UPDATE ON support_canned_responses
  FOR EACH ROW
  EXECUTE FUNCTION update_support_canned_responses_updated_at();
