-- Create api_usage_snapshots table for tracking provider API usage
-- Platform admin only - no RLS needed (accessed via service role)

CREATE TABLE IF NOT EXISTS api_usage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider identification
  provider TEXT NOT NULL CHECK (provider IN ('meetingbaas', 'gladia', 'deepgram')),

  -- Metric data
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL DEFAULT 0,
  metric_unit TEXT, -- 'minutes', 'hours', 'gb', 'calls', 'usd'

  -- Plan limits for comparison
  plan_name TEXT,
  plan_limit NUMERIC,

  -- Billing period
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,

  -- When this snapshot was taken
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Provider-specific metadata (API response details, etc.)
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient queries by provider and time
CREATE INDEX idx_api_usage_snapshots_provider_fetched
  ON api_usage_snapshots(provider, fetched_at DESC);

-- Index for getting latest snapshot per provider/metric
CREATE INDEX idx_api_usage_snapshots_latest
  ON api_usage_snapshots(provider, metric_name, fetched_at DESC);

-- Table for tracking alert history (prevent duplicate alerts)
CREATE TABLE IF NOT EXISTS api_usage_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  threshold_percent INTEGER NOT NULL, -- 80, 90, 100
  alert_date DATE NOT NULL DEFAULT CURRENT_DATE, -- Date of alert for deduplication
  alert_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  alert_message TEXT,

  -- Unique constraint to prevent duplicate alerts per day
  UNIQUE(provider, metric_name, threshold_percent, alert_date)
);

-- Add comment for documentation
COMMENT ON TABLE api_usage_snapshots IS 'Stores API usage snapshots from MeetingBaaS, Gladia, and Deepgram for platform admin monitoring';
COMMENT ON TABLE api_usage_alerts IS 'Tracks sent usage alerts to prevent duplicate notifications';
