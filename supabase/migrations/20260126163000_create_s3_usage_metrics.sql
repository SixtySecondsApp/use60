-- S3 Usage Metrics table for cost tracking
-- Stores daily aggregated metrics for monitoring S3 storage costs

CREATE TABLE IF NOT EXISTS s3_usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Metric type: storage_gb, upload_gb, download_gb, api_requests
  metric_type TEXT NOT NULL CHECK (metric_type IN ('storage_gb', 'upload_gb', 'download_gb', 'api_requests')),

  -- Metric value (GB for storage/bandwidth, count for API requests)
  value NUMERIC NOT NULL DEFAULT 0,

  -- Calculated cost in USD
  cost_usd NUMERIC NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one metric per org/date/type
  UNIQUE(org_id, date, metric_type)
);

-- Indexes for fast queries
CREATE INDEX idx_s3_usage_metrics_org_date ON s3_usage_metrics(org_id, date DESC);
CREATE INDEX idx_s3_usage_metrics_date ON s3_usage_metrics(date DESC);
CREATE INDEX idx_s3_usage_metrics_type ON s3_usage_metrics(metric_type);

-- RLS policies: only admins can read
ALTER TABLE s3_usage_metrics ENABLE ROW LEVEL SECURITY;

-- Admin read policy (org admins can see their org's metrics)
DO $$ BEGIN
  CREATE POLICY "Admins can read s3_usage_metrics"
  ON s3_usage_metrics FOR SELECT
  USING (
    -- Org admins/owners can see their org's metrics
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.org_id = s3_usage_metrics.org_id
        AND om.role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role can insert/update (for update-s3-metrics cron)
DO $$ BEGIN
  CREATE POLICY "Service role can manage s3_usage_metrics"
  ON s3_usage_metrics FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Cost calculation constants
COMMENT ON TABLE s3_usage_metrics IS 'Daily aggregated S3 usage metrics for cost tracking. Updated by update-s3-metrics cron job.';
COMMENT ON COLUMN s3_usage_metrics.metric_type IS 'storage_gb: total storage, upload_gb: new uploads (free), download_gb: bandwidth out ($0.09/GB), api_requests: S3 API calls';
COMMENT ON COLUMN s3_usage_metrics.cost_usd IS 'Calculated cost: storage_gb * $0.023/30 (daily), download_gb * $0.09, uploads free';

-- Function to calculate daily storage cost
CREATE OR REPLACE FUNCTION calculate_s3_storage_cost(storage_gb NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- $0.023 per GB per month / 30 days = daily cost
  RETURN storage_gb * 0.023 / 30;
END;
$$;

-- Function to calculate download cost
CREATE OR REPLACE FUNCTION calculate_s3_download_cost(download_gb NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- $0.09 per GB for downloads
  RETURN download_gb * 0.09;
END;
$$;

-- Trigger to update updated_at on row changes
CREATE OR REPLACE FUNCTION update_s3_usage_metrics_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER s3_usage_metrics_updated_at
  BEFORE UPDATE ON s3_usage_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_s3_usage_metrics_updated_at();
