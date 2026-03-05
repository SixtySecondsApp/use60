-- ============================================================================
-- CTI-002: Org Learning Insights Schema (PRD-20)
-- Phase 6: Coaching & Team Intelligence — Anonymised Team Intelligence
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE org_learning_insight_type AS ENUM (
    'winning_talk_track',
    'objection_handling',
    'optimal_cadence',
    'competitive_positioning',
    'stage_best_practice',
    'discovery_pattern'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE org_learning_insight_status AS ENUM ('active', 'expired', 'superseded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. org_learning_insights — anonymised cross-rep intelligence
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS org_learning_insights (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  insight_type        org_learning_insight_type NOT NULL,
  title               text NOT NULL,
  description         text NOT NULL,
  supporting_data     jsonb NOT NULL DEFAULT '{}',
  confidence          numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  sample_size         integer NOT NULL DEFAULT 0,
  status              org_learning_insight_status NOT NULL DEFAULT 'active',
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_learning_insights_lookup
  ON org_learning_insights (org_id, insight_type, status, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_org_learning_insights_active
  ON org_learning_insights (org_id, status)
  WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- 3. RLS Policies
-- ----------------------------------------------------------------------------

ALTER TABLE org_learning_insights ENABLE ROW LEVEL SECURITY;

-- All org members can read insights (data is already anonymised)
DO $$ BEGIN
  CREATE POLICY "Org members can read org learning insights"
  ON org_learning_insights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = org_learning_insights.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role inserts (edge functions write insights)
DO $$ BEGIN
  CREATE POLICY "Service role can insert org learning insights"
  ON org_learning_insights FOR INSERT
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can update org learning insights"
  ON org_learning_insights FOR UPDATE
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Helper RPCs
-- ----------------------------------------------------------------------------

-- Get active insights for an org
CREATE OR REPLACE FUNCTION get_active_org_insights(
  p_org_id uuid,
  p_insight_type org_learning_insight_type DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS SETOF org_learning_insights
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM org_learning_insights
  WHERE org_id = p_org_id
    AND status = 'active'
    AND expires_at > now()
    AND (p_insight_type IS NULL OR insight_type = p_insight_type)
  ORDER BY confidence DESC, created_at DESC
  LIMIT p_limit;
$$;

-- Expire stale org learning insights
CREATE OR REPLACE FUNCTION expire_stale_org_insights()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE org_learning_insights
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at <= now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;
