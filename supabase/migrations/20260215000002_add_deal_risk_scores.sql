-- ============================================================================
-- Migration: Deal Risk Scores Table
-- Purpose: Track deal health scores with risk signals for proactive monitoring
-- Feature: Proactive Agent V2 - Deal Risk Scoring & Alerting
-- Date: 2026-02-15
-- ============================================================================

-- =============================================================================
-- Table: deal_risk_scores
-- Tracks deal health scores with signals and alert status
-- =============================================================================

CREATE TABLE IF NOT EXISTS deal_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization and deal context
  org_id TEXT NOT NULL,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,

  -- Risk scoring
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  previous_score INTEGER DEFAULT NULL, -- Last scan's score for delta tracking
  signals JSONB NOT NULL DEFAULT '[]', -- Array of {type, weight, description}

  -- Scan and alert tracking
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  alert_sent_at TIMESTAMPTZ DEFAULT NULL, -- When Slack alert was sent

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One row per deal (upsert pattern)
  CONSTRAINT unique_deal_risk_score UNIQUE (deal_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Query by org and score threshold (e.g., get all high-risk deals)
CREATE INDEX IF NOT EXISTS idx_deal_risk_scores_org_score
  ON deal_risk_scores(org_id, score DESC);

-- Query by scan recency (e.g., find stale scores)
CREATE INDEX IF NOT EXISTS idx_deal_risk_scores_scanned_at
  ON deal_risk_scores(scanned_at);

-- Query deals needing alerts (low score, no alert sent)
CREATE INDEX IF NOT EXISTS idx_deal_risk_scores_alert_pending
  ON deal_risk_scores(score)
  WHERE alert_sent_at IS NULL AND score < 50;

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE deal_risk_scores ENABLE ROW LEVEL SECURITY;

-- Users in the same org can view risk scores
DROP POLICY IF EXISTS "Users can view org deal risk scores" ON deal_risk_scores;
CREATE POLICY "Users can view org deal risk scores"
  ON deal_risk_scores FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id::text
      FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Service role has full access (for edge functions)
DROP POLICY IF EXISTS "Service role has full access to deal_risk_scores" ON deal_risk_scores;
CREATE POLICY "Service role has full access to deal_risk_scores"
  ON deal_risk_scores FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE deal_risk_scores IS 'Tracks deal health scores with risk signals and alert status. Part of Proactive Agent V2 deal monitoring flow.';

COMMENT ON COLUMN deal_risk_scores.org_id IS 'Organization identifier (clerk_org_id)';
COMMENT ON COLUMN deal_risk_scores.deal_id IS 'Deal being scored';
COMMENT ON COLUMN deal_risk_scores.score IS 'Risk score (0-100, lower = higher risk)';
COMMENT ON COLUMN deal_risk_scores.previous_score IS 'Previous scan score for delta tracking';
COMMENT ON COLUMN deal_risk_scores.signals IS 'Array of risk signals: [{type, weight, description}]';
COMMENT ON COLUMN deal_risk_scores.scanned_at IS 'Last scan timestamp';
COMMENT ON COLUMN deal_risk_scores.alert_sent_at IS 'When Slack alert was sent (null if not sent)';

-- =============================================================================
-- RPC: Upsert deal risk score
-- =============================================================================

CREATE OR REPLACE FUNCTION upsert_deal_risk_score(
  p_org_id TEXT,
  p_deal_id UUID,
  p_score INTEGER,
  p_signals JSONB DEFAULT '[]'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score_id UUID;
  v_previous_score INTEGER;
BEGIN
  -- Validate score range
  IF p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'Score must be between 0 and 100: %', p_score;
  END IF;

  -- Get current score (will become previous_score)
  SELECT score INTO v_previous_score
  FROM deal_risk_scores
  WHERE deal_id = p_deal_id;

  -- Upsert the score record
  INSERT INTO deal_risk_scores (
    org_id,
    deal_id,
    score,
    previous_score,
    signals,
    scanned_at
  ) VALUES (
    p_org_id,
    p_deal_id,
    p_score,
    v_previous_score,
    p_signals,
    NOW()
  )
  ON CONFLICT (deal_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    previous_score = deal_risk_scores.score, -- Current becomes previous
    signals = EXCLUDED.signals,
    scanned_at = NOW()
  RETURNING id INTO v_score_id;

  RETURN v_score_id;
END;
$$;

COMMENT ON FUNCTION upsert_deal_risk_score IS 'Upserts a deal risk score with signal tracking';

GRANT EXECUTE ON FUNCTION upsert_deal_risk_score TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_deal_risk_score TO service_role;

-- =============================================================================
-- RPC: Mark alert as sent
-- =============================================================================

CREATE OR REPLACE FUNCTION mark_risk_alert_sent(
  p_deal_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE deal_risk_scores
  SET alert_sent_at = NOW()
  WHERE deal_id = p_deal_id;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION mark_risk_alert_sent IS 'Marks a risk score alert as sent';

GRANT EXECUTE ON FUNCTION mark_risk_alert_sent TO authenticated;
GRANT EXECUTE ON FUNCTION mark_risk_alert_sent TO service_role;

-- =============================================================================
-- RPC: Get high-risk deals for org
-- =============================================================================

CREATE OR REPLACE FUNCTION get_high_risk_deals(
  p_org_id TEXT,
  p_threshold INTEGER DEFAULT 50,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  deal_id UUID,
  deal_name TEXT,
  deal_value NUMERIC,
  score INTEGER,
  previous_score INTEGER,
  score_delta INTEGER,
  signals JSONB,
  scanned_at TIMESTAMPTZ,
  alert_sent_at TIMESTAMPTZ,
  owner_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    drs.deal_id,
    d.name as deal_name,
    d.value as deal_value,
    drs.score,
    drs.previous_score,
    (drs.previous_score - drs.score) as score_delta,
    drs.signals,
    drs.scanned_at,
    drs.alert_sent_at,
    COALESCE(CONCAT_WS(' ', p.first_name, p.last_name), p.email) as owner_name
  FROM deal_risk_scores drs
  INNER JOIN deals d ON d.id = drs.deal_id
  LEFT JOIN profiles p ON p.id = d.owner_id
  WHERE drs.org_id = p_org_id
    AND drs.score <= p_threshold
  ORDER BY drs.score ASC, drs.scanned_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_high_risk_deals(TEXT, INTEGER, INT) IS 'Returns high-risk deals for an org with owner info';

GRANT EXECUTE ON FUNCTION get_high_risk_deals(TEXT, INTEGER, INT) TO authenticated;

-- =============================================================================
-- RPC: Get deals needing risk scan
-- =============================================================================

CREATE OR REPLACE FUNCTION get_deals_needing_risk_scan(
  p_org_id TEXT,
  p_stale_hours INTEGER DEFAULT 24,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  deal_id UUID,
  deal_name TEXT,
  deal_stage TEXT,
  last_scanned_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    d.id as deal_id,
    d.name as deal_name,
    COALESCE(ds.name, 'Unknown') as deal_stage,
    drs.scanned_at as last_scanned_at
  FROM deals d
  LEFT JOIN deal_stages ds ON ds.id = d.stage_id
  LEFT JOIN deal_risk_scores drs ON drs.deal_id = d.id
  WHERE d.clerk_org_id = p_org_id
    AND d.status = 'active'
    AND (
      drs.scanned_at IS NULL
      OR drs.scanned_at < NOW() - (p_stale_hours || ' hours')::INTERVAL
    )
  ORDER BY drs.scanned_at NULLS FIRST
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_deals_needing_risk_scan IS 'Returns deals that need risk scoring (never scanned or stale)';

GRANT EXECUTE ON FUNCTION get_deals_needing_risk_scan TO authenticated;
GRANT EXECUTE ON FUNCTION get_deals_needing_risk_scan TO service_role;
