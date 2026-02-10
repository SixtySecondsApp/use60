-- Migration: Create agent_routing_log table
-- Purpose: Track intent classification and agent delegation decisions
-- Date: 2026-02-10

-- =============================================================================
-- Create agent_routing_log table
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_routing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES copilot_executions(id) ON DELETE CASCADE,
  intent_classification JSONB NOT NULL DEFAULT '{}'::JSONB,
  agents_selected TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  delegation_strategy TEXT NOT NULL DEFAULT 'single',
  reasoning TEXT,
  confidence NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_routing_log_execution_id ON agent_routing_log(execution_id);
CREATE INDEX IF NOT EXISTS idx_agent_routing_log_strategy ON agent_routing_log(delegation_strategy);
CREATE INDEX IF NOT EXISTS idx_agent_routing_log_created_at ON agent_routing_log(created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE agent_routing_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access to agent_routing_log"
  ON agent_routing_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view routing logs for their own executions
CREATE POLICY "Users can view own agent routing logs"
  ON agent_routing_log
  FOR SELECT
  TO authenticated
  USING (
    execution_id IN (
      SELECT id FROM copilot_executions WHERE user_id = auth.uid()
    )
  );

-- Platform admins can view all routing logs in their org
CREATE POLICY "Platform admins can view org agent routing logs"
  ON agent_routing_log
  FOR SELECT
  TO authenticated
  USING (
    execution_id IN (
      SELECT id FROM copilot_executions
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid() AND role IN ('admin', 'platform_admin')
      )
    )
  );

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
