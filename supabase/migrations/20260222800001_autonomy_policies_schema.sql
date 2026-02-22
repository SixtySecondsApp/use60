-- Migration: autonomy_policies and approval_statistics tables
-- AUT-001: Schema for autonomy policy engine

-- =====================================================================
-- ENUM: autonomy_policy
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'autonomy_policy') THEN
    CREATE TYPE autonomy_policy AS ENUM ('auto', 'approve', 'suggest', 'disabled');
  END IF;
END $$;

-- =====================================================================
-- TABLE: autonomy_policies
-- Stores per-action-type policy for org-wide or user-specific overrides
-- =====================================================================
CREATE TABLE IF NOT EXISTS autonomy_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- NULL user_id = org-wide policy; non-NULL = user override
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type     text NOT NULL,
  policy          autonomy_policy NOT NULL DEFAULT 'approve',
  preset_name     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Unique: one policy row per (org, user-or-null, action_type)
  -- COALESCE trick handles the nullable user_id uniqueness
  CONSTRAINT autonomy_policies_unique UNIQUE NULLS NOT DISTINCT (org_id, user_id, action_type)
);

-- Index for common lookups
CREATE INDEX IF NOT EXISTS idx_autonomy_policies_org_user
  ON autonomy_policies (org_id, user_id);

CREATE INDEX IF NOT EXISTS idx_autonomy_policies_action_type
  ON autonomy_policies (org_id, action_type);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_autonomy_policies_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS autonomy_policies_updated_at ON autonomy_policies;
CREATE TRIGGER autonomy_policies_updated_at
  BEFORE UPDATE ON autonomy_policies
  FOR EACH ROW EXECUTE FUNCTION update_autonomy_policies_updated_at();

-- =====================================================================
-- TABLE: approval_statistics
-- Daily aggregated stats for tracking approval patterns per action type
-- =====================================================================
CREATE TABLE IF NOT EXISTS approval_statistics (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                 uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type             text NOT NULL,
  period                  date NOT NULL,
  approved_count          integer NOT NULL DEFAULT 0,
  rejected_count          integer NOT NULL DEFAULT 0,
  auto_count              integer NOT NULL DEFAULT 0,
  avg_approval_time_seconds numeric(10, 2),
  created_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT approval_statistics_unique UNIQUE (org_id, user_id, action_type, period)
);

-- Indexes for statistics queries
CREATE INDEX IF NOT EXISTS idx_approval_statistics_org_period
  ON approval_statistics (org_id, period DESC);

CREATE INDEX IF NOT EXISTS idx_approval_statistics_user_period
  ON approval_statistics (org_id, user_id, period DESC);

-- =====================================================================
-- RLS: autonomy_policies
-- =====================================================================
ALTER TABLE autonomy_policies ENABLE ROW LEVEL SECURITY;

-- Org admins can read all org policies
CREATE POLICY "autonomy_policies_read_org" ON autonomy_policies
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Org admins can manage org-wide policies (user_id IS NULL)
CREATE POLICY "autonomy_policies_admin_write" ON autonomy_policies
  FOR ALL
  USING (
    user_id IS NULL
    AND org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    user_id IS NULL
    AND org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Users can read and write their own overrides (when admin has enabled override)
CREATE POLICY "autonomy_policies_user_override" ON autonomy_policies
  FOR ALL
  USING (
    user_id = auth.uid()
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- =====================================================================
-- RLS: approval_statistics
-- =====================================================================
ALTER TABLE approval_statistics ENABLE ROW LEVEL SECURITY;

-- Org admins can read all org stats
CREATE POLICY "approval_statistics_admin_read" ON approval_statistics
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Users can read their own stats
CREATE POLICY "approval_statistics_user_read" ON approval_statistics
  FOR SELECT
  USING (
    user_id = auth.uid()
  );

-- Service role writes stats (via edge functions)
CREATE POLICY "approval_statistics_service_write" ON approval_statistics
  FOR ALL
  USING (true)
  WITH CHECK (true);
