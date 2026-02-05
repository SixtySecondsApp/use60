-- OI-007: Create ops_table_insights schema and migration
-- Proactive intelligence system for Ops tables

-- Create insight_type enum
CREATE TYPE ops_insight_type AS ENUM (
  'new_cluster',
  'stale_leads',
  'conversion_pattern',
  'data_quality',
  'anomaly'
);

-- Create severity enum
CREATE TYPE ops_insight_severity AS ENUM (
  'info',
  'warning',
  'critical'
);

-- Main insights table
CREATE TABLE ops_table_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES dynamic_tables(id) ON DELETE CASCADE,

  -- Insight classification
  insight_type ops_insight_type NOT NULL,
  severity ops_insight_severity NOT NULL DEFAULT 'info',

  -- Content (conversational, emoji-prefixed, action-oriented)
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- body must be conversational with specific counts and "Want me to..." CTA

  -- Actionable suggestions
  actions JSONB DEFAULT '[]'::jsonb,
  -- Array of { label, action_type, action_config }
  -- Examples:
  -- { "label": "Apply Filter", "action_type": "filter", "action_config": {...} }
  -- { "label": "Draft Emails", "action_type": "draft_email", "action_config": {...} }

  -- Dismissal tracking
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_insights_table_active ON ops_table_insights(table_id, created_at DESC)
  WHERE dismissed_at IS NULL;

CREATE INDEX idx_insights_org_type ON ops_table_insights(org_id, insight_type, created_at DESC)
  WHERE dismissed_at IS NULL;

CREATE INDEX idx_insights_severity ON ops_table_insights(severity, created_at DESC)
  WHERE dismissed_at IS NULL;

-- RLS Policies
ALTER TABLE ops_table_insights ENABLE ROW LEVEL SECURITY;

-- Users can read insights for their org's tables
CREATE POLICY "Users can read org insights"
  ON ops_table_insights FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can dismiss insights
CREATE POLICY "Users can dismiss insights"
  ON ops_table_insights FOR UPDATE
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    dismissed_by = auth.uid()
    AND dismissed_at IS NOT NULL
  );

-- Comments
COMMENT ON TABLE ops_table_insights IS 'AI-generated proactive insights for Ops tables';
COMMENT ON COLUMN ops_table_insights.body IS 'Conversational insight text with specific counts and action-oriented CTA';
COMMENT ON COLUMN ops_table_insights.actions IS 'Array of actionable suggestions with labels and configs';
