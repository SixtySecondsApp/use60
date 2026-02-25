-- OI-007: Ops Table Insights Schema
CREATE TABLE IF NOT EXISTS ops_table_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES dynamic_tables(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('new_cluster', 'stale_leads', 'conversion_pattern', 'data_quality')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  actions JSONB,
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ops_insights_table ON ops_table_insights(table_id);
CREATE INDEX idx_ops_insights_active ON ops_table_insights(table_id) WHERE dismissed_at IS NULL;
ALTER TABLE ops_table_insights ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view insights in their org" ON ops_table_insights FOR SELECT
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create insights in their org" ON ops_table_insights FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update insights in their org" ON ops_table_insights FOR UPDATE
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
