-- ============================================================================
-- CTI-001: Coaching Skill Progression Schema (PRD-19)
-- Phase 6: Coaching & Team Intelligence — Rep Improvement Tracking
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. coaching_skill_progression — weekly rep coaching metrics over time
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS coaching_skill_progression (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start                date NOT NULL,
  talk_ratio                numeric(5,2),
  question_quality_score    numeric(5,2),
  objection_handling_score  numeric(5,2),
  discovery_depth_score     numeric(5,2),
  overall_score             numeric(5,2),
  meetings_analysed         integer NOT NULL DEFAULT 0,
  forecast_accuracy         numeric(5,2),
  competitive_win_rate      numeric(5,2),
  metadata                  jsonb NOT NULL DEFAULT '{}',
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one row per user per week
ALTER TABLE coaching_skill_progression
  ADD CONSTRAINT unique_coaching_progression_per_week
  UNIQUE (org_id, user_id, week_start);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coaching_skill_progression_user_week
  ON coaching_skill_progression (org_id, user_id, week_start DESC);

-- ----------------------------------------------------------------------------
-- 2. RLS Policies
-- ----------------------------------------------------------------------------

ALTER TABLE coaching_skill_progression ENABLE ROW LEVEL SECURITY;

-- Users can read their own progression
CREATE POLICY "Users can read own coaching progression"
  ON coaching_skill_progression FOR SELECT
  USING (auth.uid() = user_id);

-- Org admins can read all org progression (for manager views)
CREATE POLICY "Org admins can read all org coaching progression"
  ON coaching_skill_progression FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.org_id = coaching_skill_progression.org_id
        AND organization_memberships.user_id = auth.uid()
        AND organization_memberships.role IN ('admin', 'owner')
    )
  );

-- Service role inserts (edge functions write progression data)
CREATE POLICY "Service role can insert coaching progression"
  ON coaching_skill_progression FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update coaching progression"
  ON coaching_skill_progression FOR UPDATE
  USING (true);

-- ----------------------------------------------------------------------------
-- 3. Helper RPC: get_coaching_progression
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_coaching_progression(
  p_org_id uuid,
  p_user_id uuid,
  p_weeks integer DEFAULT 8
)
RETURNS SETOF coaching_skill_progression
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM coaching_skill_progression
  WHERE org_id = p_org_id
    AND user_id = p_user_id
  ORDER BY week_start DESC
  LIMIT p_weeks;
$$;
