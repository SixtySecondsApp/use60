-- OI-001: Create ops_table_workflows schema and migration
-- Workflow automation system for Ops tables

-- Create trigger_type enum
CREATE TYPE ops_workflow_trigger_type AS ENUM (
  'on_sync',
  'on_cell_change',
  'on_schedule',
  'manual'
);

-- Create workflow execution status enum
CREATE TYPE ops_workflow_execution_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled'
);

-- Main workflows table
CREATE TABLE ops_table_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES dynamic_tables(id) ON DELETE CASCADE,

  -- Metadata
  name TEXT NOT NULL,
  description TEXT,

  -- Trigger configuration
  trigger_type ops_workflow_trigger_type NOT NULL DEFAULT 'manual',
  trigger_config JSONB DEFAULT '{}'::jsonb,
  -- Examples:
  -- on_sync: { "after_sync": true }
  -- on_cell_change: { "watch_columns": ["status", "score"] }
  -- on_schedule: { "cron": "0 9 * * *", "timezone": "America/New_York" }

  -- Workflow steps
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Array of { condition, action_type, action_config, on_error }
  -- action_type includes: filter_rows, update_cells, enrich_apollo, score_icp,
  --   assign_by_territory, create_task, send_slack, draft_email,
  --   add_to_instantly_sequence, move_to_table

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow execution history
CREATE TABLE ops_table_workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES ops_table_workflows(id) ON DELETE CASCADE,

  -- Trigger context
  trigger_event TEXT,
  -- Examples: "hubspot_sync_completed", "cell_changed:status", "schedule:daily"

  -- Execution status
  status ops_workflow_execution_status NOT NULL DEFAULT 'pending',

  -- Results
  step_results JSONB DEFAULT '[]'::jsonb,
  -- Array of { step_index, status, result, error, duration_ms }

  error TEXT,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT execution_completed_at_check
    CHECK (status != 'completed' OR completed_at IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_workflows_table ON ops_table_workflows(table_id)
  WHERE is_active = true;

CREATE INDEX idx_workflows_org_trigger ON ops_table_workflows(org_id, trigger_type)
  WHERE is_active = true;

CREATE INDEX idx_workflow_executions_workflow ON ops_table_workflow_executions(workflow_id, created_at DESC);

CREATE INDEX idx_workflow_executions_status ON ops_table_workflow_executions(status, started_at DESC);

-- RLS Policies
ALTER TABLE ops_table_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_table_workflow_executions ENABLE ROW LEVEL SECURITY;

-- Users can read workflows in their org
CREATE POLICY "Users can read org workflows"
  ON ops_table_workflows FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can create workflows in their org
CREATE POLICY "Users can create org workflows"
  ON ops_table_workflows FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- Users can update workflows they created
CREATE POLICY "Users can update own workflows"
  ON ops_table_workflows FOR UPDATE
  USING (created_by = auth.uid());

-- Users can delete workflows they created
CREATE POLICY "Users can delete own workflows"
  ON ops_table_workflows FOR DELETE
  USING (created_by = auth.uid());

-- Users can read execution history for their org's workflows
CREATE POLICY "Users can read org workflow executions"
  ON ops_table_workflow_executions FOR SELECT
  USING (
    workflow_id IN (
      SELECT id FROM ops_table_workflows
      WHERE org_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_ops_table_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ops_table_workflows_updated_at
  BEFORE UPDATE ON ops_table_workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_ops_table_workflows_updated_at();

-- Comments
COMMENT ON TABLE ops_table_workflows IS 'Workflow automation definitions for Ops tables';
COMMENT ON TABLE ops_table_workflow_executions IS 'Execution history for workflow runs';
COMMENT ON COLUMN ops_table_workflows.steps IS 'Ordered array of workflow steps with conditions and actions';
COMMENT ON COLUMN ops_table_workflows.trigger_config IS 'Trigger-specific configuration (cron, watched columns, etc.)';
COMMENT ON COLUMN ops_table_workflow_executions.step_results IS 'Per-step execution results with status and timing';
