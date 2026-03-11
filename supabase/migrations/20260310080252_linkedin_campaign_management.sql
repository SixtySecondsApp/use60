-- Migration: linkedin_campaign_management
-- Date: 20260310080252
--
-- What this migration does:
--   Creates tables for LinkedIn campaign management: managed campaign groups,
--   campaigns, creatives, lead gen forms, and campaign approval tracking.
--   Enables use60 to create, edit, pause, and monitor LinkedIn ad campaigns.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS linkedin_campaign_approvals CASCADE;
--   DROP TABLE IF EXISTS linkedin_managed_lead_forms CASCADE;
--   DROP TABLE IF EXISTS linkedin_managed_creatives CASCADE;
--   DROP TABLE IF EXISTS linkedin_managed_campaigns CASCADE;
--   DROP TABLE IF EXISTS linkedin_managed_campaign_groups CASCADE;

-- ---------------------------------------------------------------------------
-- 1. Managed Campaign Groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_managed_campaign_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id text NOT NULL,
  linkedin_group_id text, -- LinkedIn URN (null until synced)
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'PAUSED', 'ARCHIVED', 'DRAFT'
  daily_budget_amount numeric(12,2),
  total_budget_amount numeric(12,2),
  currency_code text DEFAULT 'USD',
  run_schedule_start timestamptz,
  run_schedule_end timestamptz,
  version_tag text, -- LinkedIn optimistic concurrency
  created_by uuid REFERENCES auth.users(id),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_campaign_groups_org ON linkedin_managed_campaign_groups(org_id);
CREATE INDEX IF NOT EXISTS idx_managed_campaign_groups_account ON linkedin_managed_campaign_groups(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_managed_campaign_groups_status ON linkedin_managed_campaign_groups(status) WHERE status IN ('ACTIVE', 'DRAFT');

-- ---------------------------------------------------------------------------
-- 2. Managed Campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_managed_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id text NOT NULL, -- LinkedIn ad account URN
  campaign_group_id uuid REFERENCES linkedin_managed_campaign_groups(id),
  linkedin_campaign_id text, -- LinkedIn campaign URN (null until synced)
  name text NOT NULL,
  objective_type text NOT NULL, -- 'LEAD_GENERATION', 'WEBSITE_VISITS', 'WEBSITE_CONVERSIONS', 'ENGAGEMENT', 'BRAND_AWARENESS', 'VIDEO_VIEWS'
  campaign_type text, -- 'SPONSORED_UPDATES', 'TEXT_AD', 'SPONSORED_INMAILS', 'DYNAMIC'
  format text, -- 'SINGLE_IMAGE', 'CAROUSEL', 'VIDEO', 'TEXT_AD', 'DYNAMIC', 'MESSAGE', 'EVENT'
  status text NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED', 'CANCELED'
  daily_budget_amount numeric(12,2),
  total_budget_amount numeric(12,2),
  currency_code text DEFAULT 'USD',
  unit_cost_amount numeric(12,2),
  cost_type text, -- 'CPC', 'CPM', 'TARGET_COST', 'COST_CAP'
  targeting_criteria jsonb DEFAULT '{}', -- Job titles, functions, seniorities, companies, industries, geos
  run_schedule_start timestamptz,
  run_schedule_end timestamptz,
  pacing_strategy text DEFAULT 'DAILY', -- 'DAILY', 'LIFETIME'
  audience_expansion_enabled boolean DEFAULT false,
  offsite_delivery_enabled boolean DEFAULT false,
  version_tag text, -- LinkedIn optimistic concurrency
  linkedin_group_urn text, -- LinkedIn campaign group URN
  is_externally_modified boolean DEFAULT false, -- Drift detection flag
  last_external_modification_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_campaigns_org ON linkedin_managed_campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_managed_campaigns_account ON linkedin_managed_campaigns(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_managed_campaigns_status ON linkedin_managed_campaigns(status) WHERE status IN ('ACTIVE', 'DRAFT', 'PAUSED');
CREATE INDEX IF NOT EXISTS idx_managed_campaigns_group ON linkedin_managed_campaigns(campaign_group_id);
CREATE INDEX IF NOT EXISTS idx_managed_campaigns_linkedin_id ON linkedin_managed_campaigns(linkedin_campaign_id) WHERE linkedin_campaign_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Managed Creatives
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_managed_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES linkedin_managed_campaigns(id) ON DELETE CASCADE,
  linkedin_creative_id text, -- LinkedIn creative URN (null until synced)
  headline text,
  body_text text,
  cta_text text,
  destination_url text,
  media_type text DEFAULT 'IMAGE', -- 'IMAGE', 'VIDEO', 'CAROUSEL'
  media_asset_id text, -- LinkedIn asset URN
  media_url text, -- Original upload URL
  status text NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'
  is_direct_sponsored boolean DEFAULT true,
  version_tag text,
  created_by uuid REFERENCES auth.users(id),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_creatives_org ON linkedin_managed_creatives(org_id);
CREATE INDEX IF NOT EXISTS idx_managed_creatives_campaign ON linkedin_managed_creatives(campaign_id);
CREATE INDEX IF NOT EXISTS idx_managed_creatives_status ON linkedin_managed_creatives(status) WHERE status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 4. Managed Lead Gen Forms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_managed_lead_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  linkedin_form_id text, -- LinkedIn form URN (null until synced)
  name text NOT NULL,
  headline text,
  description text,
  fields jsonb DEFAULT '[]', -- Array of { fieldType, label, required }
  thank_you_message text,
  landing_page_url text,
  privacy_policy_url text,
  status text NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'ACTIVE', 'ARCHIVED'
  created_by uuid REFERENCES auth.users(id),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_lead_forms_org ON linkedin_managed_lead_forms(org_id);

-- ---------------------------------------------------------------------------
-- 5. Campaign Approvals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_campaign_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES linkedin_managed_campaigns(id) ON DELETE CASCADE,
  action_type text NOT NULL, -- 'activate', 'increase_budget', 'delete', 'resume'
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  details jsonb DEFAULT '{}', -- Action-specific data (e.g., { old_budget, new_budget })
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_approvals_org ON linkedin_campaign_approvals(org_id);
CREATE INDEX IF NOT EXISTS idx_campaign_approvals_status ON linkedin_campaign_approvals(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_campaign_approvals_campaign ON linkedin_campaign_approvals(campaign_id);

-- ---------------------------------------------------------------------------
-- 6. RLS Policies
-- ---------------------------------------------------------------------------

-- Campaign Groups
ALTER TABLE linkedin_managed_campaign_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on managed campaign groups" ON linkedin_managed_campaign_groups;
CREATE POLICY "Service role full access on managed campaign groups" ON linkedin_managed_campaign_groups
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Org members can view managed campaign groups" ON linkedin_managed_campaign_groups;
CREATE POLICY "Org members can view managed campaign groups" ON linkedin_managed_campaign_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_managed_campaign_groups.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Org members can insert managed campaign groups" ON linkedin_managed_campaign_groups;
CREATE POLICY "Org members can insert managed campaign groups" ON linkedin_managed_campaign_groups
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_managed_campaign_groups.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Org members can update managed campaign groups" ON linkedin_managed_campaign_groups;
CREATE POLICY "Org members can update managed campaign groups" ON linkedin_managed_campaign_groups
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_managed_campaign_groups.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

-- Managed Campaigns
ALTER TABLE linkedin_managed_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on managed campaigns" ON linkedin_managed_campaigns;
CREATE POLICY "Service role full access on managed campaigns" ON linkedin_managed_campaigns
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Org members can view managed campaigns" ON linkedin_managed_campaigns;
CREATE POLICY "Org members can view managed campaigns" ON linkedin_managed_campaigns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_managed_campaigns.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Org members can insert managed campaigns" ON linkedin_managed_campaigns;
CREATE POLICY "Org members can insert managed campaigns" ON linkedin_managed_campaigns
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_managed_campaigns.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Org members can update managed campaigns" ON linkedin_managed_campaigns;
CREATE POLICY "Org members can update managed campaigns" ON linkedin_managed_campaigns
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_managed_campaigns.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

-- Managed Creatives
ALTER TABLE linkedin_managed_creatives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on managed creatives" ON linkedin_managed_creatives;
CREATE POLICY "Service role full access on managed creatives" ON linkedin_managed_creatives
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Org members can view managed creatives" ON linkedin_managed_creatives;
CREATE POLICY "Org members can view managed creatives" ON linkedin_managed_creatives
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_managed_creatives.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Org members can insert managed creatives" ON linkedin_managed_creatives;
CREATE POLICY "Org members can insert managed creatives" ON linkedin_managed_creatives
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_managed_creatives.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Org members can update managed creatives" ON linkedin_managed_creatives;
CREATE POLICY "Org members can update managed creatives" ON linkedin_managed_creatives
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_managed_creatives.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

-- Managed Lead Gen Forms
ALTER TABLE linkedin_managed_lead_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on managed lead forms" ON linkedin_managed_lead_forms;
CREATE POLICY "Service role full access on managed lead forms" ON linkedin_managed_lead_forms
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Org members can view managed lead forms" ON linkedin_managed_lead_forms;
CREATE POLICY "Org members can view managed lead forms" ON linkedin_managed_lead_forms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_managed_lead_forms.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Org members can insert managed lead forms" ON linkedin_managed_lead_forms;
CREATE POLICY "Org members can insert managed lead forms" ON linkedin_managed_lead_forms
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_managed_lead_forms.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Org members can update managed lead forms" ON linkedin_managed_lead_forms;
CREATE POLICY "Org members can update managed lead forms" ON linkedin_managed_lead_forms
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_managed_lead_forms.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

-- Campaign Approvals
ALTER TABLE linkedin_campaign_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on campaign approvals" ON linkedin_campaign_approvals;
CREATE POLICY "Service role full access on campaign approvals" ON linkedin_campaign_approvals
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Org members can view campaign approvals" ON linkedin_campaign_approvals;
CREATE POLICY "Org members can view campaign approvals" ON linkedin_campaign_approvals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_campaign_approvals.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Org members can insert campaign approvals" ON linkedin_campaign_approvals;
CREATE POLICY "Org members can insert campaign approvals" ON linkedin_campaign_approvals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_campaign_approvals.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Org members can update campaign approvals" ON linkedin_campaign_approvals;
CREATE POLICY "Org members can update campaign approvals" ON linkedin_campaign_approvals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_campaign_approvals.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
