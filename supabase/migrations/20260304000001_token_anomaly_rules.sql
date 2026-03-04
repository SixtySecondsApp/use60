-- ============================================================================
-- Token Anomaly Rules — Configurable flagging thresholds for God's Eye admin
-- ============================================================================

CREATE TABLE IF NOT EXISTS token_anomaly_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('per_request_max', 'rate_spike', 'budget_percent')),
  description TEXT,
  -- Threshold configuration
  threshold_value NUMERIC NOT NULL,
  time_window_minutes INTEGER, -- For rate_spike: lookback window
  comparison_window_minutes INTEGER, -- For rate_spike: baseline comparison window
  -- Severity and state
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE token_anomaly_rules ENABLE ROW LEVEL SECURITY;

-- Platform admins can read all rules
DROP POLICY IF EXISTS "Platform admins can read anomaly rules" ON token_anomaly_rules;
CREATE POLICY "Platform admins can read anomaly rules"
  ON token_anomaly_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Platform admins can manage rules
DROP POLICY IF EXISTS "Platform admins can manage anomaly rules" ON token_anomaly_rules;
CREATE POLICY "Platform admins can manage anomaly rules"
  ON token_anomaly_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Seed default rules
INSERT INTO token_anomaly_rules (rule_name, rule_type, description, threshold_value, time_window_minutes, severity) VALUES
  ('High token request', 'per_request_max', 'Flag requests exceeding token threshold', 100000, NULL, 'warning'),
  ('Very high token request', 'per_request_max', 'Flag requests exceeding critical token threshold', 500000, NULL, 'critical'),
  ('Usage rate spike', 'rate_spike', 'Flag when user rate exceeds 5x their hourly average', 5, 60, 'warning'),
  ('Budget threshold 80%', 'budget_percent', 'Flag when user reaches 80% of budget', 80, NULL, 'warning'),
  ('Budget threshold 95%', 'budget_percent', 'Flag when user reaches 95% of budget', 95, NULL, 'critical');

-- Index for quick rule lookup
CREATE INDEX IF NOT EXISTS idx_token_anomaly_rules_enabled
  ON token_anomaly_rules(is_enabled, rule_type);

COMMENT ON TABLE token_anomaly_rules IS 'Configurable anomaly detection rules for the God''s Eye token flow admin page';
