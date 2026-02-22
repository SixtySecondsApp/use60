-- Custom SOP Builder Schema
-- PRD-12: SOP-001
-- Creates custom_sops and sop_steps tables with RLS

-- =============================================================================
-- custom_sops table
-- =============================================================================

CREATE TABLE IF NOT EXISTS custom_sops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'transcript_phrase',
    'crm_field_change',
    'email_pattern',
    'time_based',
    'manual'
  )),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_platform_default BOOLEAN NOT NULL DEFAULT false,
  version INT NOT NULL DEFAULT 1,
  credit_cost_estimate NUMERIC NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name, version)
);

-- =============================================================================
-- sop_steps table
-- =============================================================================

CREATE TABLE IF NOT EXISTS sop_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id UUID NOT NULL REFERENCES custom_sops(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'crm_action',
    'draft_email',
    'alert_rep',
    'alert_manager',
    'enrich_contact',
    'create_task',
    'custom'
  )),
  action_config JSONB NOT NULL DEFAULT '{}',
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_custom_sops_org_id ON custom_sops(org_id);
CREATE INDEX IF NOT EXISTS idx_custom_sops_org_active ON custom_sops(org_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_custom_sops_platform_default ON custom_sops(is_platform_default) WHERE is_platform_default = true;
CREATE INDEX IF NOT EXISTS idx_sop_steps_sop_id ON sop_steps(sop_id);
CREATE INDEX IF NOT EXISTS idx_sop_steps_order ON sop_steps(sop_id, step_order);

-- =============================================================================
-- Updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION update_custom_sops_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS custom_sops_updated_at ON custom_sops;
CREATE TRIGGER custom_sops_updated_at
  BEFORE UPDATE ON custom_sops
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_sops_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE custom_sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_steps ENABLE ROW LEVEL SECURITY;

-- Platform defaults are readable by everyone (org_id matches or is_platform_default)
-- Org admins can manage org-specific SOPs
-- Members can read active SOPs for their org

-- custom_sops policies
DROP POLICY IF EXISTS "custom_sops_select" ON custom_sops;
CREATE POLICY "custom_sops_select"
  ON custom_sops FOR SELECT
  USING (
    is_platform_default = true
    OR org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "custom_sops_insert" ON custom_sops;
CREATE POLICY "custom_sops_insert"
  ON custom_sops FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "custom_sops_update" ON custom_sops;
CREATE POLICY "custom_sops_update"
  ON custom_sops FOR UPDATE
  USING (
    is_platform_default = false
    AND org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "custom_sops_delete" ON custom_sops;
CREATE POLICY "custom_sops_delete"
  ON custom_sops FOR DELETE
  USING (
    is_platform_default = false
    AND org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- sop_steps policies (inherit access from custom_sops)
DROP POLICY IF EXISTS "sop_steps_select" ON sop_steps;
CREATE POLICY "sop_steps_select"
  ON sop_steps FOR SELECT
  USING (
    sop_id IN (
      SELECT id FROM custom_sops
      WHERE is_platform_default = true
        OR org_id IN (
          SELECT org_id FROM organization_members
          WHERE user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "sop_steps_insert" ON sop_steps;
CREATE POLICY "sop_steps_insert"
  ON sop_steps FOR INSERT
  WITH CHECK (
    sop_id IN (
      SELECT id FROM custom_sops
      WHERE org_id IN (
        SELECT org_id FROM organization_members
        WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  );

DROP POLICY IF EXISTS "sop_steps_update" ON sop_steps;
CREATE POLICY "sop_steps_update"
  ON sop_steps FOR UPDATE
  USING (
    sop_id IN (
      SELECT id FROM custom_sops
      WHERE is_platform_default = false
        AND org_id IN (
          SELECT org_id FROM organization_members
          WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "sop_steps_delete" ON sop_steps;
CREATE POLICY "sop_steps_delete"
  ON sop_steps FOR DELETE
  USING (
    sop_id IN (
      SELECT id FROM custom_sops
      WHERE is_platform_default = false
        AND org_id IN (
          SELECT org_id FROM organization_members
          WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    )
  );
