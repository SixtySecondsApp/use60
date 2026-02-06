-- OI-031: Ops Table Predictions Schema
CREATE TABLE IF NOT EXISTS ops_behavioral_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL,
  pattern_data JSONB NOT NULL,
  sample_size INTEGER,
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_table_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES dynamic_tables(id) ON DELETE CASCADE,
  prediction_type TEXT NOT NULL,
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  title TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  suggested_actions JSONB,
  dismissed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_behavioral_patterns_org ON ops_behavioral_patterns(org_id);
CREATE INDEX idx_predictions_table ON ops_table_predictions(table_id);
CREATE INDEX idx_predictions_active ON ops_table_predictions(table_id) WHERE dismissed_at IS NULL AND (expires_at IS NULL OR expires_at > now());
ALTER TABLE ops_behavioral_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_table_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view patterns in their org" ON ops_behavioral_patterns FOR SELECT
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can view predictions in their org" ON ops_table_predictions FOR SELECT
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can create predictions in their org" ON ops_table_predictions FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can update predictions in their org" ON ops_table_predictions FOR UPDATE
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
