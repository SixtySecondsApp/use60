-- =============================================================================
-- Migration: CRM-001 — CRM Index Tables
-- =============================================================================
-- Purpose: Create lightweight index tables for HubSpot and Attio CRM data.
--          These tables provide fast search and filter capabilities without
--          materializing full records into contacts/companies/deals tables.
--          Webhook-driven for real-time freshness.
-- Date: 2026-02-19
-- =============================================================================

-- =============================================================================
-- Step 1: crm_contact_index — Indexed contact data from HubSpot/Attio
-- =============================================================================

CREATE TABLE crm_contact_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization and source tracking
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_source TEXT NOT NULL CHECK (crm_source IN ('hubspot', 'attio')),
  crm_record_id TEXT NOT NULL,

  -- Core contact fields
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  company_domain TEXT,
  job_title TEXT,

  -- Sales lifecycle fields
  lifecycle_stage TEXT,
  lead_status TEXT,
  owner_crm_id TEXT,

  -- Deal association fields
  has_active_deal BOOLEAN DEFAULT false,
  deal_stage TEXT,
  deal_value NUMERIC,

  -- Materialization tracking (future use)
  materialized_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  is_materialized BOOLEAN DEFAULT false,
  materialized_at TIMESTAMPTZ,

  -- CRM timestamps
  crm_created_at TIMESTAMPTZ,
  crm_updated_at TIMESTAMPTZ,

  -- Full raw properties from CRM
  raw_properties JSONB DEFAULT '{}',

  -- Webhook tracking
  last_webhook_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),

  -- App timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: one index record per CRM contact per org
  CONSTRAINT unique_crm_contact_per_org UNIQUE(org_id, crm_source, crm_record_id)
);

COMMENT ON TABLE crm_contact_index IS
  'Lightweight index of HubSpot and Attio contacts for fast search/filter without full materialization.';

COMMENT ON COLUMN crm_contact_index.crm_source IS
  'CRM system source: hubspot or attio';

COMMENT ON COLUMN crm_contact_index.crm_record_id IS
  'The external CRM record ID (HubSpot contact ID or Attio record ID)';

COMMENT ON COLUMN crm_contact_index.has_active_deal IS
  'True if this contact is associated with at least one open deal';

COMMENT ON COLUMN crm_contact_index.materialized_contact_id IS
  'Reference to contacts table if this CRM contact has been materialized into the app (future use)';

COMMENT ON COLUMN crm_contact_index.last_webhook_at IS
  'Timestamp of the most recent webhook update for this contact';

COMMENT ON COLUMN crm_contact_index.full_name IS
  'Full name of the contact (combined first + last, or as provided by CRM)';

COMMENT ON COLUMN crm_contact_index.company_domain IS
  'Company domain (e.g., example.com) for filtering by company';

COMMENT ON COLUMN crm_contact_index.phone IS
  'Contact phone number';

COMMENT ON COLUMN crm_contact_index.owner_crm_id IS
  'CRM owner/user ID who owns this contact (not app user UUID)';

COMMENT ON COLUMN crm_contact_index.raw_properties IS
  'Full raw CRM properties JSONB for advanced queries and debugging';

COMMENT ON COLUMN crm_contact_index.last_synced_at IS
  'Timestamp of the most recent successful sync (webhook or initial sync)';

-- =============================================================================
-- Step 2: crm_company_index — Indexed company data from HubSpot/Attio
-- =============================================================================

CREATE TABLE crm_company_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization and source tracking
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_source TEXT NOT NULL CHECK (crm_source IN ('hubspot', 'attio')),
  crm_record_id TEXT NOT NULL,

  -- Core company fields
  name TEXT,
  domain TEXT,
  industry TEXT,
  employee_count TEXT,
  annual_revenue NUMERIC,
  city TEXT,
  state TEXT,
  country TEXT,

  -- Materialization tracking (future use)
  materialized_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  is_materialized BOOLEAN DEFAULT false,

  -- CRM timestamps
  crm_updated_at TIMESTAMPTZ,

  -- Full raw properties from CRM
  raw_properties JSONB DEFAULT '{}',

  -- Webhook tracking
  last_webhook_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),

  -- App timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: one index record per CRM company per org
  CONSTRAINT unique_crm_company_per_org UNIQUE(org_id, crm_source, crm_record_id)
);

COMMENT ON TABLE crm_company_index IS
  'Lightweight index of HubSpot and Attio companies for fast search/filter without full materialization.';

COMMENT ON COLUMN crm_company_index.materialized_company_id IS
  'Reference to companies table if this CRM company has been materialized into the app (future use)';

COMMENT ON COLUMN crm_company_index.city IS
  'Company city location';

COMMENT ON COLUMN crm_company_index.state IS
  'Company state/province location';

COMMENT ON COLUMN crm_company_index.country IS
  'Company country location';

COMMENT ON COLUMN crm_company_index.raw_properties IS
  'Full raw CRM properties JSONB for advanced queries and debugging';

COMMENT ON COLUMN crm_company_index.last_synced_at IS
  'Timestamp of the most recent successful sync (webhook or initial sync)';

-- =============================================================================
-- Step 3: crm_deal_index — Indexed deal data from HubSpot/Attio
-- =============================================================================

CREATE TABLE crm_deal_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization and source tracking
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_source TEXT NOT NULL CHECK (crm_source IN ('hubspot', 'attio')),
  crm_record_id TEXT NOT NULL,

  -- Core deal fields
  name TEXT,
  stage TEXT,
  pipeline TEXT,
  amount NUMERIC,
  close_date DATE,

  -- Association fields (CRM IDs, not materialized UUIDs)
  contact_crm_ids TEXT[],
  company_crm_id TEXT,
  owner_crm_id TEXT,

  -- Materialization tracking (future use)
  materialized_deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  is_materialized BOOLEAN DEFAULT false,

  -- CRM timestamps
  crm_updated_at TIMESTAMPTZ,

  -- Full raw properties from CRM
  raw_properties JSONB DEFAULT '{}',

  -- Webhook tracking
  last_webhook_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),

  -- App timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: one index record per CRM deal per org
  CONSTRAINT unique_crm_deal_per_org UNIQUE(org_id, crm_source, crm_record_id)
);

COMMENT ON TABLE crm_deal_index IS
  'Lightweight index of HubSpot and Attio deals for fast search/filter without full materialization.';

COMMENT ON COLUMN crm_deal_index.contact_crm_ids IS
  'Array of CRM contact IDs associated with this deal (not app contact UUIDs)';

COMMENT ON COLUMN crm_deal_index.company_crm_id IS
  'CRM company ID associated with this deal (not app company UUID)';

COMMENT ON COLUMN crm_deal_index.owner_crm_id IS
  'CRM owner/user ID who owns this deal (not app user UUID)';

COMMENT ON COLUMN crm_deal_index.pipeline IS
  'Deal pipeline name (e.g., Sales Pipeline, Partner Pipeline)';

COMMENT ON COLUMN crm_deal_index.materialized_deal_id IS
  'Reference to deals table if this CRM deal has been materialized into the app (future use)';

COMMENT ON COLUMN crm_deal_index.is_materialized IS
  'True if this CRM deal has been materialized into the deals table';

COMMENT ON COLUMN crm_deal_index.raw_properties IS
  'Full raw CRM properties JSONB for advanced queries and debugging';

COMMENT ON COLUMN crm_deal_index.last_synced_at IS
  'Timestamp of the most recent successful sync (webhook or initial sync)';

-- =============================================================================
-- Step 4: Indexes for Performance
-- =============================================================================

-- crm_contact_index indexes
CREATE INDEX idx_crm_contact_index_org ON crm_contact_index(org_id);
CREATE INDEX idx_crm_contact_index_email ON crm_contact_index(org_id, email);
CREATE INDEX idx_crm_contact_index_name ON crm_contact_index(org_id, first_name, last_name);
CREATE INDEX idx_crm_contact_index_company ON crm_contact_index(org_id, company_name);
CREATE INDEX idx_crm_contact_index_title ON crm_contact_index(org_id, job_title);
CREATE INDEX idx_crm_contact_index_lifecycle ON crm_contact_index(org_id, lifecycle_stage);
CREATE INDEX idx_crm_contact_index_deal ON crm_contact_index(org_id, has_active_deal, deal_stage);

-- Full-text search GIN index for contact search
CREATE INDEX idx_crm_contact_index_fts ON crm_contact_index USING gin(
  to_tsvector('english',
    COALESCE(first_name, '') || ' ' ||
    COALESCE(last_name, '') || ' ' ||
    COALESCE(full_name, '') || ' ' ||
    COALESCE(email, '') || ' ' ||
    COALESCE(company_name, '') || ' ' ||
    COALESCE(job_title, '')
  )
);

COMMENT ON INDEX idx_crm_contact_index_fts IS
  'Full-text search index for fast contact searches across name, email, company, and title fields.';

-- Additional indexes for new fields
CREATE INDEX idx_crm_contact_index_phone ON crm_contact_index(org_id, phone);
CREATE INDEX idx_crm_contact_index_company_domain ON crm_contact_index(org_id, company_domain);
CREATE INDEX idx_crm_contact_index_owner ON crm_contact_index(org_id, owner_crm_id);

-- crm_company_index indexes
CREATE INDEX idx_crm_company_index_org ON crm_company_index(org_id);
CREATE INDEX idx_crm_company_index_name ON crm_company_index(org_id, name);
CREATE INDEX idx_crm_company_index_domain ON crm_company_index(org_id, domain);
CREATE INDEX idx_crm_company_index_location ON crm_company_index(org_id, city, state, country);

-- crm_deal_index indexes
CREATE INDEX idx_crm_deal_index_org ON crm_deal_index(org_id);
CREATE INDEX idx_crm_deal_index_stage ON crm_deal_index(org_id, stage);
CREATE INDEX idx_crm_deal_index_pipeline ON crm_deal_index(org_id, pipeline);
CREATE INDEX idx_crm_deal_index_close_date ON crm_deal_index(org_id, close_date);

-- =============================================================================
-- Step 5: RLS Policies
-- =============================================================================

-- crm_contact_index RLS
ALTER TABLE crm_contact_index ENABLE ROW LEVEL SECURITY;

-- Service role full access (edge functions use service role)
CREATE POLICY "Service role full access to crm_contact_index"
ON crm_contact_index FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can read contacts from their org
CREATE POLICY "Org members can read crm_contact_index"
ON crm_contact_index FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM organization_memberships
    WHERE org_id::text = crm_contact_index.org_id::text
      AND user_id = auth.uid()
  )
);

-- crm_company_index RLS
ALTER TABLE crm_company_index ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access to crm_company_index"
ON crm_company_index FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can read companies from their org
CREATE POLICY "Org members can read crm_company_index"
ON crm_company_index FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM organization_memberships
    WHERE org_id::text = crm_company_index.org_id::text
      AND user_id = auth.uid()
  )
);

-- crm_deal_index RLS
ALTER TABLE crm_deal_index ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access to crm_deal_index"
ON crm_deal_index FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can read deals from their org
CREATE POLICY "Org members can read crm_deal_index"
ON crm_deal_index FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM organization_memberships
    WHERE org_id::text = crm_deal_index.org_id::text
      AND user_id = auth.uid()
  )
);

-- =============================================================================
-- Step 6: Triggers for updated_at
-- =============================================================================

-- crm_contact_index updated_at trigger
CREATE OR REPLACE FUNCTION update_crm_contact_index_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crm_contact_index_updated_at ON crm_contact_index;
CREATE TRIGGER trigger_crm_contact_index_updated_at
  BEFORE UPDATE ON crm_contact_index
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_contact_index_updated_at();

-- crm_company_index updated_at trigger
CREATE OR REPLACE FUNCTION update_crm_company_index_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crm_company_index_updated_at ON crm_company_index;
CREATE TRIGGER trigger_crm_company_index_updated_at
  BEFORE UPDATE ON crm_company_index
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_company_index_updated_at();

-- crm_deal_index updated_at trigger
CREATE OR REPLACE FUNCTION update_crm_deal_index_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crm_deal_index_updated_at ON crm_deal_index;
CREATE TRIGGER trigger_crm_deal_index_updated_at
  BEFORE UPDATE ON crm_deal_index
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_deal_index_updated_at();

-- =============================================================================
-- Step 7: Permissions
-- =============================================================================

GRANT SELECT ON crm_contact_index TO authenticated;
GRANT ALL ON crm_contact_index TO service_role;

GRANT SELECT ON crm_company_index TO authenticated;
GRANT ALL ON crm_company_index TO service_role;

GRANT SELECT ON crm_deal_index TO authenticated;
GRANT ALL ON crm_deal_index TO service_role;

-- =============================================================================
-- Done
-- =============================================================================

NOTIFY pgrst, 'reload schema';
