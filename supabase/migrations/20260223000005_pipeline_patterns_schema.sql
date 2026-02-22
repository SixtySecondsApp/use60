-- ============================================================================
-- KNW-009: Pipeline Patterns Schema (PRD-18)
-- Phase 5: Knowledge & Memory — Cross-Deal Pattern Recognition
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE pipeline_pattern_type AS ENUM (
    'objection_cluster',
    'stage_bottleneck',
    'engagement_correlation',
    'win_loss_factor',
    'rep_behavior',
    'velocity_anomaly'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pipeline_pattern_severity AS ENUM ('info', 'warning', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pipeline_pattern_status AS ENUM ('active', 'dismissed', 'resolved', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. pipeline_patterns — detected cross-deal insights
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pipeline_patterns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pattern_type        pipeline_pattern_type NOT NULL,
  title               text NOT NULL,
  description         text NOT NULL,
  confidence          numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  supporting_evidence jsonb NOT NULL DEFAULT '{}',
  affected_deal_ids   uuid[] NOT NULL DEFAULT '{}',
  actionable_deals    jsonb NOT NULL DEFAULT '[]',
  severity            pipeline_pattern_severity NOT NULL DEFAULT 'info',
  status              pipeline_pattern_status NOT NULL DEFAULT 'active',
  dismissed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pipeline_patterns_org_type_status
  ON pipeline_patterns (org_id, pattern_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_patterns_org_status_severity
  ON pipeline_patterns (org_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_pipeline_patterns_org_active
  ON pipeline_patterns (org_id, created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pipeline_patterns_expires
  ON pipeline_patterns (expires_at) WHERE status = 'active';
-- GIN index for affected_deal_ids array lookups
CREATE INDEX IF NOT EXISTS idx_pipeline_patterns_affected_deals
  ON pipeline_patterns USING GIN (affected_deal_ids);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_pipeline_patterns_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS pipeline_patterns_updated_at ON pipeline_patterns;
CREATE TRIGGER pipeline_patterns_updated_at
  BEFORE UPDATE ON pipeline_patterns
  FOR EACH ROW EXECUTE FUNCTION update_pipeline_patterns_updated_at();

-- ----------------------------------------------------------------------------
-- 3. RLS Policies
-- ----------------------------------------------------------------------------

ALTER TABLE pipeline_patterns ENABLE ROW LEVEL SECURITY;

-- org members can read
DROP POLICY IF EXISTS "org_members_select_pipeline_patterns" ON pipeline_patterns;
CREATE POLICY "org_members_select_pipeline_patterns"
  ON pipeline_patterns FOR SELECT
  USING (org_id IN (
    SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid()
  ));

-- org members can dismiss (update status)
DROP POLICY IF EXISTS "org_members_update_pipeline_patterns" ON pipeline_patterns;
CREATE POLICY "org_members_update_pipeline_patterns"
  ON pipeline_patterns FOR UPDATE
  USING (org_id IN (
    SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid()
  ));

-- service role full access
DROP POLICY IF EXISTS "service_role_all_pipeline_patterns" ON pipeline_patterns;
CREATE POLICY "service_role_all_pipeline_patterns"
  ON pipeline_patterns FOR ALL
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 4. Auto-expire cron function
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION expire_stale_pipeline_patterns()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE pipeline_patterns
  SET status = 'expired', updated_at = now()
  WHERE status = 'active' AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Helper RPCs
-- ----------------------------------------------------------------------------

-- Get active patterns for an org
CREATE OR REPLACE FUNCTION get_active_pipeline_patterns(
  p_org_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  pattern_type pipeline_pattern_type,
  title text,
  description text,
  confidence numeric,
  severity pipeline_pattern_severity,
  affected_deal_count integer,
  actionable_deals jsonb,
  supporting_evidence jsonb,
  created_at timestamptz
) LANGUAGE sql STABLE AS $$
  -- First expire any stale patterns
  -- (lightweight: only touches rows past expiry)
  SELECT
    pp.id,
    pp.pattern_type,
    pp.title,
    pp.description,
    pp.confidence,
    pp.severity,
    array_length(pp.affected_deal_ids, 1) AS affected_deal_count,
    pp.actionable_deals,
    pp.supporting_evidence,
    pp.created_at
  FROM pipeline_patterns pp
  WHERE pp.org_id = p_org_id
    AND pp.status = 'active'
    AND pp.expires_at > now()
  ORDER BY
    CASE pp.severity
      WHEN 'critical' THEN 0
      WHEN 'warning' THEN 1
      WHEN 'info' THEN 2
    END,
    pp.confidence DESC,
    pp.created_at DESC
  LIMIT p_limit;
$$;

-- Get patterns affecting a specific deal
CREATE OR REPLACE FUNCTION get_deal_patterns(
  p_org_id uuid,
  p_deal_id uuid
)
RETURNS TABLE (
  id uuid,
  pattern_type pipeline_pattern_type,
  title text,
  description text,
  severity pipeline_pattern_severity,
  recommended_action text
) LANGUAGE sql STABLE AS $$
  SELECT
    pp.id,
    pp.pattern_type,
    pp.title,
    pp.description,
    pp.severity,
    (
      SELECT ad->>'recommended_action'
      FROM jsonb_array_elements(pp.actionable_deals) ad
      WHERE (ad->>'deal_id')::uuid = p_deal_id
      LIMIT 1
    ) AS recommended_action
  FROM pipeline_patterns pp
  WHERE pp.org_id = p_org_id
    AND pp.status = 'active'
    AND pp.expires_at > now()
    AND p_deal_id = ANY(pp.affected_deal_ids)
  ORDER BY pp.severity DESC, pp.confidence DESC;
$$;

-- Dismiss a pattern
CREATE OR REPLACE FUNCTION dismiss_pipeline_pattern(
  p_pattern_id uuid,
  p_user_id uuid
)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  UPDATE pipeline_patterns
  SET status = 'dismissed', dismissed_by = p_user_id, updated_at = now()
  WHERE id = p_pattern_id AND status = 'active';

  RETURN FOUND;
END;
$$;
