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

DO $$ BEGIN
  CREATE POLICY "Users can view workflows in their org" ON ops_table_workflows FOR SELECT
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create workflows in their org" ON ops_table_workflows FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update workflows in their org" ON ops_table_workflows FOR UPDATE
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete workflows in their org" ON ops_table_workflows FOR DELETE
  USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
