-- Migration: Create agent_schedules and agent_triggers tables
-- Purpose: Per-org scheduled and event-driven agent automation
-- Date: 2026-02-10

-- =============================================================================
-- Create agent_schedules table
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cron_expression TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  delivery_channel TEXT NOT NULL DEFAULT 'in_app',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- Create agent_triggers table
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_schedules_org_id ON agent_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_schedules_active ON agent_schedules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agent_triggers_org_id ON agent_triggers(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_triggers_event ON agent_triggers(trigger_event);
CREATE INDEX IF NOT EXISTS idx_agent_triggers_active ON agent_triggers(is_active) WHERE is_active = true;

-- =============================================================================
-- Row Level Security — agent_schedules
-- =============================================================================

ALTER TABLE agent_schedules ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access to agent_schedules"
  ON agent_schedules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Org members can read their own org's schedules
CREATE POLICY "Org members can view agent_schedules"
  ON agent_schedules
  FOR SELECT
  TO authenticated
  USING (can_access_org_data(organization_id));

-- Org admins can insert schedules
CREATE POLICY "Org admins can insert agent_schedules"
  ON agent_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (can_admin_org(organization_id));

-- Org admins can update schedules
CREATE POLICY "Org admins can update agent_schedules"
  ON agent_schedules
  FOR UPDATE
  TO authenticated
  USING (can_admin_org(organization_id))
  WITH CHECK (can_admin_org(organization_id));

-- Org admins can delete schedules
CREATE POLICY "Org admins can delete agent_schedules"
  ON agent_schedules
  FOR DELETE
  TO authenticated
  USING (can_admin_org(organization_id));

-- =============================================================================
-- Row Level Security — agent_triggers
-- =============================================================================

ALTER TABLE agent_triggers ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access to agent_triggers"
  ON agent_triggers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Org members can read their own org's triggers
CREATE POLICY "Org members can view agent_triggers"
  ON agent_triggers
  FOR SELECT
  TO authenticated
  USING (can_access_org_data(organization_id));

-- Org admins can insert triggers
CREATE POLICY "Org admins can insert agent_triggers"
  ON agent_triggers
  FOR INSERT
  TO authenticated
  WITH CHECK (can_admin_org(organization_id));

-- Org admins can update triggers
CREATE POLICY "Org admins can update agent_triggers"
  ON agent_triggers
  FOR UPDATE
  TO authenticated
  USING (can_admin_org(organization_id))
  WITH CHECK (can_admin_org(organization_id));

-- Org admins can delete triggers
CREATE POLICY "Org admins can delete agent_triggers"
  ON agent_triggers
  FOR DELETE
  TO authenticated
  USING (can_admin_org(organization_id));

-- =============================================================================
-- Auto-update updated_at triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION update_agent_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_schedules_updated_at
  BEFORE UPDATE ON agent_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_schedules_updated_at();

CREATE OR REPLACE FUNCTION update_agent_triggers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_triggers_updated_at
  BEFORE UPDATE ON agent_triggers
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_triggers_updated_at();

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
