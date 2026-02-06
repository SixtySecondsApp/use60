-- ============================================================================
-- Ops Intelligence Platform - Staging Deployment
-- Project: caerqjzvuerejfrdtygb
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb/sql
-- ============================================================================

BEGIN;

-- Migration 1: Workflows
-- OI-001: Ops Table Workflows Schema
CREATE TABLE IF NOT EXISTS ops_table_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES dynamic_tables(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('on_sync', 'on_cell_change', 'on_schedule', 'manual')),
  trigger_config JSONB,
  steps JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ops_workflows_org ON ops_table_workflows(org_id);
CREATE INDEX idx_ops_workflows_table ON ops_table_workflows(table_id);
ALTER TABLE ops_table_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workflows in their org" ON ops_table_workflows FOR SELECT
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can create workflows in their org" ON ops_table_workflows FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can update workflows in their org" ON ops_table_workflows FOR UPDATE
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete workflows in their org" ON ops_table_workflows FOR DELETE
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

-- Migration 2: Insights
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

CREATE POLICY "Users can view insights in their org" ON ops_table_insights FOR SELECT
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can create insights in their org" ON ops_table_insights FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can update insights in their org" ON ops_table_insights FOR UPDATE
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

-- Migration 3: Recipes
-- OI-014: Ops Table Recipes Schema
CREATE TABLE IF NOT EXISTS ops_table_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES dynamic_tables(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  query_text TEXT NOT NULL,
  parsed_config JSONB NOT NULL,
  trigger_type TEXT DEFAULT 'one_shot' CHECK (trigger_type IN ('one_shot', 'on_sync', 'scheduled')),
  is_shared BOOLEAN DEFAULT false,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ops_recipes_table ON ops_table_recipes(table_id);
CREATE INDEX idx_ops_recipes_shared ON ops_table_recipes(table_id) WHERE is_shared = true;
ALTER TABLE ops_table_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view recipes in their org" ON ops_table_recipes FOR SELECT
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can create recipes in their org" ON ops_table_recipes FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can update recipes in their org" ON ops_table_recipes FOR UPDATE
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete recipes in their org" ON ops_table_recipes FOR DELETE
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));

-- Migration 4: Chat Sessions
-- OI-025: Ops Table Chat Sessions Schema
CREATE TABLE IF NOT EXISTS ops_table_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES dynamic_tables(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]'::jsonb,
  context JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_sessions_table ON ops_table_chat_sessions(table_id);
CREATE INDEX idx_chat_sessions_user ON ops_table_chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_expires ON ops_table_chat_sessions(expires_at);
ALTER TABLE ops_table_chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat sessions" ON ops_table_chat_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own chat sessions" ON ops_table_chat_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own chat sessions" ON ops_table_chat_sessions FOR UPDATE
  USING (user_id = auth.uid());

-- Migration 5: Predictions
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

-- Migration 6: Cross-Table Registry
-- OI-020: Cross-Table Data Source Registry
CREATE OR REPLACE FUNCTION get_available_data_sources(p_table_id UUID)
RETURNS TABLE (source_name TEXT, source_type TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dt.name AS source_name,
    'ops_table'::TEXT AS source_type
  FROM dynamic_tables dt
  WHERE dt.org_id = (SELECT org_id FROM dynamic_tables WHERE id = p_table_id)
    AND dt.id != p_table_id
  UNION ALL
  SELECT 'contacts'::TEXT, 'crm'::TEXT
  UNION ALL
  SELECT 'deals'::TEXT, 'crm'::TEXT
  UNION ALL
  SELECT 'companies'::TEXT, 'crm'::TEXT
  UNION ALL
  SELECT 'activities'::TEXT, 'crm'::TEXT
  UNION ALL
  SELECT 'meetings'::TEXT, 'meetings'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark migrations as applied
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES 
  ('20260206000001', 'ops_table_workflows', ARRAY['CREATE TABLE ops_table_workflows']),
  ('20260206000002', 'ops_table_insights', ARRAY['CREATE TABLE ops_table_insights']),
  ('20260206000003', 'ops_table_recipes', ARRAY['CREATE TABLE ops_table_recipes']),
  ('20260206000004', 'ops_table_chat_sessions', ARRAY['CREATE TABLE ops_table_chat_sessions']),
  ('20260206000005', 'ops_table_predictions', ARRAY['CREATE TABLE ops_behavioral_patterns', 'CREATE TABLE ops_table_predictions']),
  ('20260206000006', 'ops_cross_table_registry', ARRAY['CREATE FUNCTION get_available_data_sources'])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Verification queries
SELECT 'Workflows table' AS check_name, COUNT(*) AS count FROM information_schema.tables WHERE table_name = 'ops_table_workflows';
SELECT 'Insights table' AS check_name, COUNT(*) AS count FROM information_schema.tables WHERE table_name = 'ops_table_insights';
SELECT 'Recipes table' AS check_name, COUNT(*) AS count FROM information_schema.tables WHERE table_name = 'ops_table_recipes';
SELECT 'Chat sessions table' AS check_name, COUNT(*) AS count FROM information_schema.tables WHERE table_name = 'ops_table_chat_sessions';
SELECT 'Predictions table' AS check_name, COUNT(*) AS count FROM information_schema.tables WHERE table_name = 'ops_table_predictions';
SELECT 'Data sources function' AS check_name, COUNT(*) AS count FROM information_schema.routines WHERE routine_name = 'get_available_data_sources';
