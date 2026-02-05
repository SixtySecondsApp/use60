-- OI-031: Create ops_table_predictions schema and migration
-- AI-generated predictions with team-wide behavioral learning

-- Create prediction_type enum
CREATE TYPE ops_prediction_type AS ENUM (
  'likely_to_convert',
  'going_dark',
  'optimal_timing',
  'similar_pattern',
  'team_behavior'
);

-- Create pattern_type enum
CREATE TYPE ops_behavioral_pattern_type AS ENUM (
  'response_time',
  'call_timing',
  'stage_velocity',
  'win_pattern',
  'loss_pattern'
);

-- Behavioral patterns table (org-wide learning)
CREATE TABLE ops_behavioral_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Pattern classification
  pattern_type ops_behavioral_pattern_type NOT NULL,

  -- Pattern data (org-wide aggregated insights)
  pattern_data JSONB NOT NULL,
  -- Examples:
  -- {
  --   "metric": "call_within_2h",
  --   "conversion_lift": 6.0,
  --   "sample_deals": 47,
  --   "baseline_rate": 0.08,
  --   "boosted_rate": 0.48,
  --   "time_window": "2h",
  --   "trigger_event": "page_viewed"
  -- }

  -- Credibility metrics
  sample_size INTEGER NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),

  -- Timestamps
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

-- Main predictions table
CREATE TABLE ops_table_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES dynamic_tables(id) ON DELETE CASCADE,
  row_id UUID NOT NULL REFERENCES dynamic_table_rows(id) ON DELETE CASCADE,

  -- Prediction classification
  prediction_type ops_prediction_type NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),

  -- Content (conversational with reasoning)
  title TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  -- Human-readable explanation of why this prediction was made

  -- Actionable suggestions
  suggested_actions JSONB DEFAULT '[]'::jsonb,
  -- Array of { label, action_type, action_config }

  -- Source behavioral pattern (for team_behavior predictions)
  source_pattern_id UUID REFERENCES ops_behavioral_patterns(id) ON DELETE SET NULL,

  -- Dismissal and expiry
  dismissed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for behavioral patterns
CREATE INDEX idx_behavioral_patterns_org_type ON ops_behavioral_patterns(org_id, pattern_type, expires_at DESC)
  WHERE expires_at > NOW();

CREATE INDEX idx_behavioral_patterns_confidence ON ops_behavioral_patterns(confidence DESC, sample_size DESC)
  WHERE expires_at > NOW();

-- Indexes for predictions
CREATE INDEX idx_predictions_table_active ON ops_table_predictions(table_id, confidence DESC, created_at DESC)
  WHERE dismissed_at IS NULL AND expires_at > NOW();

CREATE INDEX idx_predictions_row ON ops_table_predictions(row_id)
  WHERE dismissed_at IS NULL AND expires_at > NOW();

CREATE INDEX idx_predictions_type_confidence ON ops_table_predictions(prediction_type, confidence DESC)
  WHERE dismissed_at IS NULL AND expires_at > NOW();

-- RLS Policies
ALTER TABLE ops_behavioral_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_table_predictions ENABLE ROW LEVEL SECURITY;

-- Users can read behavioral patterns for their org
CREATE POLICY "Users can read org behavioral patterns"
  ON ops_behavioral_patterns FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can read predictions for their org's tables
CREATE POLICY "Users can read org predictions"
  ON ops_table_predictions FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can dismiss predictions
CREATE POLICY "Users can dismiss predictions"
  ON ops_table_predictions FOR UPDATE
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    dismissed_at IS NOT NULL
  );

-- Auto-cleanup function for expired predictions
CREATE OR REPLACE FUNCTION cleanup_expired_predictions()
RETURNS void AS $$
BEGIN
  DELETE FROM ops_table_predictions
  WHERE expires_at <= NOW();

  DELETE FROM ops_behavioral_patterns
  WHERE expires_at <= NOW();
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE ops_behavioral_patterns IS 'Org-wide behavioral patterns learned from all reps activity';
COMMENT ON TABLE ops_table_predictions IS 'AI-generated predictions about contacts/deals based on patterns';
COMMENT ON COLUMN ops_behavioral_patterns.pattern_data IS 'Aggregated org-wide insights with metrics and sample sizes';
COMMENT ON COLUMN ops_table_predictions.source_pattern_id IS 'Links prediction to the behavioral pattern that generated it';
COMMENT ON COLUMN ops_table_predictions.reasoning IS 'Human-readable explanation with specific numbers and context';
