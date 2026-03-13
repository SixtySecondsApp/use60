-- Migration: linkedin_advertising_analytics
-- Date: 20260309232430
--
-- What this migration does:
--   Creates tables for LinkedIn advertising analytics: campaign metrics (time-series),
--   demographic breakdowns, sync audit trail, and a pipeline attribution view.
--
-- Rollback strategy:
--   DROP VIEW IF EXISTS linkedin_analytics_with_pipeline;
--   DROP TABLE IF EXISTS linkedin_demographic_metrics CASCADE;
--   DROP TABLE IF EXISTS linkedin_campaign_metrics CASCADE;
--   DROP TABLE IF EXISTS linkedin_analytics_sync_runs CASCADE;

-- ---------------------------------------------------------------------------
-- 1. Analytics Sync Runs (audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_analytics_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id text NOT NULL,
  sync_type text NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'manual', 'backfill'
  date_range_start date NOT NULL,
  date_range_end date NOT NULL,
  campaigns_synced int DEFAULT 0,
  metrics_upserted int DEFAULT 0,
  demographics_upserted int DEFAULT 0,
  status text NOT NULL DEFAULT 'running', -- 'running', 'complete', 'error'
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_sync_runs_org ON linkedin_analytics_sync_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_analytics_sync_runs_status ON linkedin_analytics_sync_runs(status) WHERE status = 'running';

-- ---------------------------------------------------------------------------
-- 2. Campaign Metrics (time-series ad performance data)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_campaign_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  campaign_group_id text,
  campaign_group_name text,
  campaign_status text, -- 'ACTIVE', 'PAUSED', 'COMPLETED', 'DRAFT', 'ARCHIVED'
  campaign_type text, -- 'SPONSORED_UPDATES', 'TEXT_AD', 'SPONSORED_INMAILS', etc.
  date date NOT NULL,

  -- Standard LinkedIn ad metrics
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  spend numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'USD',
  leads int DEFAULT 0,
  conversions int DEFAULT 0,
  video_views int DEFAULT 0,
  video_completions int DEFAULT 0,
  likes int DEFAULT 0,
  comments int DEFAULT 0,
  shares int DEFAULT 0,
  follows int DEFAULT 0,
  landing_page_clicks int DEFAULT 0,
  total_engagements int DEFAULT 0,

  -- Derived metrics (computed on upsert for fast queries)
  ctr numeric(8,4) DEFAULT 0,
  cpm numeric(10,2) DEFAULT 0,
  cpc numeric(10,2) DEFAULT 0,
  cpl numeric(10,2) DEFAULT 0,

  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_campaign_metric_per_day UNIQUE(org_id, campaign_id, date)
);

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_org_date ON linkedin_campaign_metrics(org_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_campaign ON linkedin_campaign_metrics(campaign_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_account ON linkedin_campaign_metrics(ad_account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_status ON linkedin_campaign_metrics(campaign_status) WHERE campaign_status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 3. Demographic Metrics (professional audience breakdowns)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_demographic_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id text NOT NULL,
  campaign_id text NOT NULL,
  date date NOT NULL,

  -- Demographic pivot dimension
  pivot_type text NOT NULL, -- 'JOB_TITLE', 'JOB_FUNCTION', 'SENIORITY', 'INDUSTRY', 'COMPANY_SIZE', 'GEOGRAPHY'
  pivot_value text NOT NULL,

  -- Metrics for this demographic segment
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  spend numeric(12,2) DEFAULT 0,
  leads int DEFAULT 0,
  conversions int DEFAULT 0,
  total_engagements int DEFAULT 0,

  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_demographic_metric UNIQUE(org_id, campaign_id, date, pivot_type, pivot_value)
);

CREATE INDEX IF NOT EXISTS idx_demographic_metrics_org_date ON linkedin_demographic_metrics(org_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_demographic_metrics_pivot ON linkedin_demographic_metrics(pivot_type, pivot_value);
CREATE INDEX IF NOT EXISTS idx_demographic_metrics_campaign ON linkedin_demographic_metrics(campaign_id, date DESC);

-- ---------------------------------------------------------------------------
-- 4. RLS Policies
-- ---------------------------------------------------------------------------

-- Analytics Sync Runs
ALTER TABLE linkedin_analytics_sync_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on analytics sync runs" ON linkedin_analytics_sync_runs;
CREATE POLICY "Service role full access on analytics sync runs" ON linkedin_analytics_sync_runs
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Org members can view sync runs" ON linkedin_analytics_sync_runs;
CREATE POLICY "Org members can view sync runs" ON linkedin_analytics_sync_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_analytics_sync_runs.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

-- Campaign Metrics
ALTER TABLE linkedin_campaign_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on campaign metrics" ON linkedin_campaign_metrics;
CREATE POLICY "Service role full access on campaign metrics" ON linkedin_campaign_metrics
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Org members can view campaign metrics" ON linkedin_campaign_metrics;
CREATE POLICY "Org members can view campaign metrics" ON linkedin_campaign_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_campaign_metrics.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

-- Demographic Metrics
ALTER TABLE linkedin_demographic_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on demographic metrics" ON linkedin_demographic_metrics;
CREATE POLICY "Service role full access on demographic metrics" ON linkedin_demographic_metrics
  FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Org members can view demographic metrics" ON linkedin_demographic_metrics;
CREATE POLICY "Org members can view demographic metrics" ON linkedin_demographic_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = linkedin_demographic_metrics.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Pipeline Attribution View
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW linkedin_analytics_with_pipeline AS
SELECT
  cm.org_id,
  cm.ad_account_id,
  cm.campaign_id,
  cm.campaign_name,
  cm.campaign_group_name,
  cm.campaign_status,
  cm.campaign_type,
  cm.currency,
  SUM(cm.impressions) AS total_impressions,
  SUM(cm.clicks) AS total_clicks,
  SUM(cm.spend) AS total_spend,
  SUM(cm.leads) AS total_leads,
  SUM(cm.conversions) AS total_conversions,
  SUM(cm.total_engagements) AS total_engagements,
  CASE WHEN SUM(cm.impressions) > 0
    THEN ROUND(SUM(cm.clicks)::numeric / SUM(cm.impressions) * 100, 2)
    ELSE 0
  END AS avg_ctr,
  CASE WHEN SUM(cm.clicks) > 0
    THEN ROUND(SUM(cm.spend) / SUM(cm.clicks), 2)
    ELSE 0
  END AS avg_cpc,
  CASE WHEN SUM(cm.impressions) > 0
    THEN ROUND(SUM(cm.spend) / (SUM(cm.impressions) / 1000.0), 2)
    ELSE 0
  END AS avg_cpm,
  CASE WHEN SUM(cm.leads) > 0
    THEN ROUND(SUM(cm.spend) / SUM(cm.leads), 2)
    ELSE 0
  END AS avg_cpl,
  COALESCE(p.total_leads, 0) AS pipeline_leads,
  COALESCE(p.total_meetings, 0) AS pipeline_meetings,
  COALESCE(p.total_deals, 0) AS pipeline_deals,
  COALESCE(p.won_deals, 0) AS pipeline_won_deals,
  COALESCE(p.won_revenue, 0) AS pipeline_revenue,
  COALESCE(p.proposals_sent, 0) AS pipeline_proposals,
  CASE WHEN COALESCE(p.total_meetings, 0) > 0
    THEN ROUND(SUM(cm.spend) / p.total_meetings, 2)
    ELSE NULL
  END AS cost_per_meeting,
  CASE WHEN COALESCE(p.won_deals, 0) > 0
    THEN ROUND(SUM(cm.spend) / p.won_deals, 2)
    ELSE NULL
  END AS cost_per_deal,
  CASE WHEN SUM(cm.spend) > 0 AND COALESCE(p.won_revenue, 0) > 0
    THEN ROUND(p.won_revenue / SUM(cm.spend), 2)
    ELSE NULL
  END AS roas,
  MIN(cm.date) AS first_date,
  MAX(cm.date) AS last_date
FROM linkedin_campaign_metrics cm
LEFT JOIN linkedin_campaign_performance p
  ON p.org_id = cm.org_id::text
  AND p.campaign_name = cm.campaign_name
GROUP BY
  cm.org_id, cm.ad_account_id, cm.campaign_id, cm.campaign_name,
  cm.campaign_group_name, cm.campaign_status, cm.campaign_type, cm.currency,
  p.total_leads, p.total_meetings, p.total_deals, p.won_deals,
  p.won_revenue, p.proposals_sent;
