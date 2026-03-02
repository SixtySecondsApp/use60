-- Migration: Coaching Analyses Table
-- Purpose: Store AI-powered coaching insights from meetings and weekly digests
-- Feature: proactive-agent-v2 (COACH-001)
-- Date: 2026-02-13

-- =============================================================================
-- Table: coaching_analyses
-- Stores AI-generated coaching insights and recommendations
-- =============================================================================

CREATE TABLE IF NOT EXISTS coaching_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and organization
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Meeting reference (nullable for weekly digests)
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,

  -- Analysis type
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('per_meeting', 'weekly')),

  -- Core coaching metrics (0-1 scale where applicable)
  talk_ratio NUMERIC(5,2), -- Rep speaking percentage (e.g., 65.50 = 65.5%)
  question_quality_score NUMERIC(3,2) CHECK (question_quality_score >= 0 AND question_quality_score <= 1),
  objection_handling_score NUMERIC(3,2) CHECK (objection_handling_score >= 0 AND objection_handling_score <= 1),
  discovery_depth_score NUMERIC(3,2) CHECK (discovery_depth_score >= 0 AND discovery_depth_score <= 1),

  -- Structured insights and recommendations
  insights JSONB DEFAULT '[]', -- Array of {category, text, severity, timestamp}
  recommendations JSONB DEFAULT '[]', -- Array of {category, action, priority, rationale}

  -- Detailed metrics breakdown
  raw_metrics JSONB DEFAULT '{}', -- Full metric data for drill-down

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE coaching_analyses IS
  'AI-powered coaching insights from individual meetings and weekly digests';

COMMENT ON COLUMN coaching_analyses.talk_ratio IS
  'Percentage of time the sales rep was speaking (0-100)';

COMMENT ON COLUMN coaching_analyses.question_quality_score IS
  'AI score for question quality: open-ended, relevant, SPIN framework (0-1 scale)';

COMMENT ON COLUMN coaching_analyses.objection_handling_score IS
  'AI score for objection handling: acknowledgment, empathy, reframing (0-1 scale)';

COMMENT ON COLUMN coaching_analyses.discovery_depth_score IS
  'AI score for discovery depth: pain points, budget, timeline, decision process (0-1 scale)';

COMMENT ON COLUMN coaching_analyses.insights IS
  'Array of insight objects: [{category: string, text: string, severity: "high"|"medium"|"low", timestamp: string}]';

COMMENT ON COLUMN coaching_analyses.recommendations IS
  'Array of recommendation objects: [{category: string, action: string, priority: number, rationale: string}]';

COMMENT ON COLUMN coaching_analyses.raw_metrics IS
  'Full metric breakdown for drill-down analysis and historical tracking';

-- =============================================================================
-- Indexes
-- =============================================================================

-- User queries (fetch coaching history)
CREATE INDEX IF NOT EXISTS idx_coaching_analyses_user_created
  ON coaching_analyses(user_id, created_at DESC);

-- Org-wide reporting
CREATE INDEX IF NOT EXISTS idx_coaching_analyses_org_type
  ON coaching_analyses(org_id, analysis_type);

-- Meeting-specific lookups
CREATE INDEX IF NOT EXISTS idx_coaching_analyses_meeting
  ON coaching_analyses(meeting_id)
  WHERE meeting_id IS NOT NULL;

-- Weekly digest queries
CREATE INDEX IF NOT EXISTS idx_coaching_analyses_weekly
  ON coaching_analyses(user_id, analysis_type, created_at DESC)
  WHERE analysis_type = 'weekly';

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE coaching_analyses ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for AI analysis generation)
DROP POLICY IF EXISTS "Service role has full access" ON coaching_analyses;
DO $$ BEGIN
  CREATE POLICY "Service role has full access"
  ON coaching_analyses
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can read their own coaching analyses
DROP POLICY IF EXISTS "Users can view own coaching analyses" ON coaching_analyses;
DO $$ BEGIN
  CREATE POLICY "Users can view own coaching analyses"
  ON coaching_analyses FOR SELECT
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Helper Function: Get latest coaching analysis for user
-- =============================================================================

CREATE OR REPLACE FUNCTION get_latest_coaching_analysis(
  p_user_id UUID,
  p_analysis_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  meeting_id UUID,
  analysis_type TEXT,
  talk_ratio NUMERIC,
  question_quality_score NUMERIC,
  objection_handling_score NUMERIC,
  discovery_depth_score NUMERIC,
  insights JSONB,
  recommendations JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ca.id,
    ca.meeting_id,
    ca.analysis_type,
    ca.talk_ratio,
    ca.question_quality_score,
    ca.objection_handling_score,
    ca.discovery_depth_score,
    ca.insights,
    ca.recommendations,
    ca.created_at
  FROM coaching_analyses ca
  WHERE ca.user_id = p_user_id
    AND (p_analysis_type IS NULL OR ca.analysis_type = p_analysis_type)
  ORDER BY ca.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_latest_coaching_analysis TO authenticated;

COMMENT ON FUNCTION get_latest_coaching_analysis IS
  'Fetches the most recent coaching analysis for a user, optionally filtered by type';
