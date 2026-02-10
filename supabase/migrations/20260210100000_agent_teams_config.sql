-- Migration: Create agent_team_config table
-- Purpose: Per-org configuration for AI agent teams (models, enabled agents, budget)
-- Date: 2026-02-10

-- =============================================================================
-- Create agent_team_config table
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_team_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  orchestrator_model TEXT DEFAULT 'claude-haiku-4-5-20251001',
  worker_model TEXT DEFAULT 'claude-haiku-4-5-20251001',
  enabled_agents TEXT[] DEFAULT ARRAY['pipeline','outreach','research'],
  budget_limit_daily_usd NUMERIC(10,2) DEFAULT 50.00,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT agent_team_config_org_unique UNIQUE (organization_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_team_config_org_id ON agent_team_config(organization_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE agent_team_config ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access to agent_team_config"
  ON agent_team_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Org members can read their own org's config
CREATE POLICY "Org members can view agent_team_config"
  ON agent_team_config
  FOR SELECT
  TO authenticated
  USING (can_access_org_data(organization_id));

-- Org admins can insert config
CREATE POLICY "Org admins can insert agent_team_config"
  ON agent_team_config
  FOR INSERT
  TO authenticated
  WITH CHECK (can_admin_org(organization_id));

-- Org admins can update config
CREATE POLICY "Org admins can update agent_team_config"
  ON agent_team_config
  FOR UPDATE
  TO authenticated
  USING (can_admin_org(organization_id))
  WITH CHECK (can_admin_org(organization_id));

-- Org admins can delete config
CREATE POLICY "Org admins can delete agent_team_config"
  ON agent_team_config
  FOR DELETE
  TO authenticated
  USING (can_admin_org(organization_id));

-- =============================================================================
-- Auto-update updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION update_agent_team_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_team_config_updated_at
  BEFORE UPDATE ON agent_team_config
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_team_config_updated_at();

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
