-- PRD-11: CRM Field Mapping & Write Policies Schema
-- CRM-001: Create crm_field_mappings and crm_write_policies tables

-- ============================================================
-- crm_field_mappings table
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_field_mappings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_provider  TEXT NOT NULL CHECK (crm_provider IN ('hubspot', 'attio', 'bullhorn')),
  crm_object    TEXT NOT NULL CHECK (crm_object IN ('contact', 'deal', 'company', 'activity')),
  crm_field_name TEXT NOT NULL,
  crm_field_type TEXT,
  sixty_field_name TEXT,
  confidence    NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  is_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
  is_excluded   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_field_mappings_unique UNIQUE (org_id, crm_provider, crm_object, crm_field_name)
);

-- ============================================================
-- crm_write_policies table
-- ============================================================
DO $$ BEGIN CREATE TYPE crm_write_policy_enum AS ENUM ('auto', 'approval', 'suggest', 'disabled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS crm_write_policies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_object  TEXT NOT NULL CHECK (crm_object IN ('contact', 'deal', 'company', 'activity')),
  field_name  TEXT NOT NULL,
  policy      crm_write_policy_enum NOT NULL DEFAULT 'auto',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_write_policies_unique UNIQUE (org_id, crm_object, field_name)
);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_crm_field_mappings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_field_mappings_updated_at
  BEFORE UPDATE ON crm_field_mappings
  FOR EACH ROW EXECUTE FUNCTION update_crm_field_mappings_updated_at();

CREATE OR REPLACE FUNCTION update_crm_write_policies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_write_policies_updated_at
  BEFORE UPDATE ON crm_write_policies
  FOR EACH ROW EXECUTE FUNCTION update_crm_write_policies_updated_at();

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_crm_field_mappings_org_id ON crm_field_mappings(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_field_mappings_org_provider ON crm_field_mappings(org_id, crm_provider);
CREATE INDEX IF NOT EXISTS idx_crm_write_policies_org_id ON crm_write_policies(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_write_policies_org_object ON crm_write_policies(org_id, crm_object);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE crm_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_write_policies ENABLE ROW LEVEL SECURITY;

-- crm_field_mappings: org admins (owner/admin) can manage, members can read
CREATE POLICY crm_field_mappings_select ON crm_field_mappings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE org_id = crm_field_mappings.org_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY crm_field_mappings_insert ON crm_field_mappings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE org_id = crm_field_mappings.org_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY crm_field_mappings_update ON crm_field_mappings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE org_id = crm_field_mappings.org_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY crm_field_mappings_delete ON crm_field_mappings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE org_id = crm_field_mappings.org_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- crm_write_policies: org admins manage, members read
CREATE POLICY crm_write_policies_select ON crm_write_policies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE org_id = crm_write_policies.org_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY crm_write_policies_insert ON crm_write_policies
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE org_id = crm_write_policies.org_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY crm_write_policies_update ON crm_write_policies
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE org_id = crm_write_policies.org_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY crm_write_policies_delete ON crm_write_policies
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE org_id = crm_write_policies.org_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );
