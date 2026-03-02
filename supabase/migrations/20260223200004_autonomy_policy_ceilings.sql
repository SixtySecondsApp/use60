-- Migration: autonomy_policy_ceilings
-- GRAD-006: Manager controls for org-wide autonomy ceilings and auto-promotion eligibility

-- =====================================================================
-- TABLE: autonomy_policy_ceilings
-- Manager-set ceilings and promotion eligibility per action type
-- =====================================================================
CREATE TABLE IF NOT EXISTS autonomy_policy_ceilings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action_type             text NOT NULL,
  -- Maximum autonomy level that auto-promotion can reach
  max_ceiling             autonomy_policy NOT NULL DEFAULT 'approve',
  -- Whether this action type is eligible for auto-promotion
  auto_promotion_eligible boolean NOT NULL DEFAULT false,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES auth.users(id),

  CONSTRAINT autonomy_policy_ceilings_unique UNIQUE (org_id, action_type)
);

CREATE INDEX IF NOT EXISTS idx_autonomy_policy_ceilings_org
  ON autonomy_policy_ceilings (org_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_autonomy_policy_ceilings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS autonomy_policy_ceilings_updated_at ON autonomy_policy_ceilings;
CREATE TRIGGER autonomy_policy_ceilings_updated_at
  BEFORE UPDATE ON autonomy_policy_ceilings
  FOR EACH ROW EXECUTE FUNCTION update_autonomy_policy_ceilings_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE autonomy_policy_ceilings ENABLE ROW LEVEL SECURITY;

-- Org members can read ceilings
DROP POLICY IF EXISTS "autonomy_policy_ceilings_read" ON autonomy_policy_ceilings;
DO $$ BEGIN
  CREATE POLICY "autonomy_policy_ceilings_read" ON autonomy_policy_ceilings
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins/owners can manage ceilings
DROP POLICY IF EXISTS "autonomy_policy_ceilings_admin_write" ON autonomy_policy_ceilings;
DO $$ BEGIN
  CREATE POLICY "autonomy_policy_ceilings_admin_write" ON autonomy_policy_ceilings
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================================
-- RPC: get_team_autonomy_stats
-- Org-level analytics: team approval rates and promotion velocity
-- =====================================================================
CREATE OR REPLACE FUNCTION get_team_autonomy_stats(
  p_org_id uuid,
  p_window_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  cutoff_date date;
BEGIN
  cutoff_date := CURRENT_DATE - p_window_days;

  SELECT jsonb_build_object(
    'total_actions', COALESCE(SUM(approved_count + rejected_count + auto_count), 0),
    'total_approved', COALESCE(SUM(approved_count), 0),
    'total_rejected', COALESCE(SUM(rejected_count), 0),
    'total_auto', COALESCE(SUM(auto_count), 0),
    'approval_rate', CASE
      WHEN COALESCE(SUM(approved_count + rejected_count), 0) = 0 THEN 0
      ELSE ROUND(SUM(approved_count)::numeric / NULLIF(SUM(approved_count + rejected_count), 0) * 100, 1)
    END,
    'promotions_count', (
      SELECT COUNT(*) FROM autonomy_audit_log
      WHERE org_id = p_org_id
        AND change_type = 'promotion'
        AND created_at >= cutoff_date
    ),
    'demotions_count', (
      SELECT COUNT(*) FROM autonomy_audit_log
      WHERE org_id = p_org_id
        AND change_type = 'demotion'
        AND created_at >= cutoff_date
    ),
    'per_user', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'user_id', s.user_id,
          'total_actions', s.total_actions,
          'approved', s.approved,
          'rejected', s.rejected,
          'auto_approved', s.auto_approved,
          'approval_rate', CASE
            WHEN s.approved + s.rejected = 0 THEN 0
            ELSE ROUND(s.approved::numeric / NULLIF(s.approved + s.rejected, 0) * 100, 1)
          END
        )
      ), '[]'::jsonb)
      FROM (
        SELECT
          user_id,
          SUM(approved_count + rejected_count + auto_count) as total_actions,
          SUM(approved_count) as approved,
          SUM(rejected_count) as rejected,
          SUM(auto_count) as auto_approved
        FROM approval_statistics
        WHERE org_id = p_org_id
          AND period >= cutoff_date
          AND user_id IS NOT NULL
        GROUP BY user_id
        ORDER BY SUM(approved_count + rejected_count + auto_count) DESC
      ) s
    )
  ) INTO result
  FROM approval_statistics
  WHERE org_id = p_org_id
    AND period >= cutoff_date;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;
