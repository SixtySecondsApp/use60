-- Migration: Copilot Routing Logs
-- Purpose: Track routing decisions for analytics and debugging
-- Feature: sequence-simplification (SEQ-009)
-- Date: 2026-02-03

-- =============================================================================
-- Table: copilot_routing_logs
-- Tracks which skills are matched to user messages
-- =============================================================================

CREATE TABLE IF NOT EXISTS copilot_routing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User context
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Message info (truncated for privacy)
  message_snippet TEXT, -- First 200 chars of the message

  -- Routing decision
  selected_skill_id UUID REFERENCES platform_skills(id) ON DELETE SET NULL,
  selected_skill_key TEXT,
  is_sequence_match BOOLEAN DEFAULT false,
  confidence DECIMAL(3, 2), -- 0.00 to 1.00
  candidate_count INT DEFAULT 0,
  reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_copilot_routing_logs_user ON copilot_routing_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_copilot_routing_logs_skill ON copilot_routing_logs(selected_skill_id);
CREATE INDEX IF NOT EXISTS idx_copilot_routing_logs_created ON copilot_routing_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_routing_logs_sequence ON copilot_routing_logs(is_sequence_match, created_at DESC);

-- RLS: Users can see their own logs, admins can see all
ALTER TABLE copilot_routing_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own routing logs" ON copilot_routing_logs;
CREATE POLICY "Users can view own routing logs"
  ON copilot_routing_logs FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all routing logs" ON copilot_routing_logs;
CREATE POLICY "Admins can view all routing logs"
  ON copilot_routing_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ));

-- Service role can insert logs
DROP POLICY IF EXISTS "Service can insert routing logs" ON copilot_routing_logs;
CREATE POLICY "Service can insert routing logs"
  ON copilot_routing_logs FOR INSERT
  WITH CHECK (true);

-- =============================================================================
-- Function: Get routing analytics
-- =============================================================================

CREATE OR REPLACE FUNCTION get_routing_analytics(
  p_days INT DEFAULT 7
)
RETURNS TABLE (
  total_routes BIGINT,
  sequence_matches BIGINT,
  individual_matches BIGINT,
  no_match BIGINT,
  avg_confidence DECIMAL,
  top_sequences JSONB,
  top_skills JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH recent_logs AS (
    SELECT *
    FROM copilot_routing_logs
    WHERE created_at > now() - (p_days || ' days')::INTERVAL
  ),
  stats AS (
    SELECT
      COUNT(*) as total_routes,
      COUNT(*) FILTER (WHERE is_sequence_match = true) as sequence_matches,
      COUNT(*) FILTER (WHERE is_sequence_match = false AND selected_skill_id IS NOT NULL) as individual_matches,
      COUNT(*) FILTER (WHERE selected_skill_id IS NULL) as no_match,
      AVG(confidence) FILTER (WHERE confidence > 0) as avg_confidence
    FROM recent_logs
  ),
  top_seq AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'skill_key', selected_skill_key,
        'count', cnt
      ) ORDER BY cnt DESC
    ) as top_sequences
    FROM (
      SELECT selected_skill_key, COUNT(*) as cnt
      FROM recent_logs
      WHERE is_sequence_match = true AND selected_skill_key IS NOT NULL
      GROUP BY selected_skill_key
      ORDER BY cnt DESC
      LIMIT 5
    ) sq
  ),
  top_ind AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'skill_key', selected_skill_key,
        'count', cnt
      ) ORDER BY cnt DESC
    ) as top_skills
    FROM (
      SELECT selected_skill_key, COUNT(*) as cnt
      FROM recent_logs
      WHERE is_sequence_match = false AND selected_skill_key IS NOT NULL
      GROUP BY selected_skill_key
      ORDER BY cnt DESC
      LIMIT 5
    ) ind
  )
  SELECT
    s.total_routes,
    s.sequence_matches,
    s.individual_matches,
    s.no_match,
    s.avg_confidence,
    COALESCE(ts.top_sequences, '[]'::jsonb),
    COALESCE(ti.top_skills, '[]'::jsonb)
  FROM stats s
  CROSS JOIN top_seq ts
  CROSS JOIN top_ind ti;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_routing_analytics TO authenticated;

-- =============================================================================
-- Comment
-- =============================================================================

COMMENT ON TABLE copilot_routing_logs IS 'Tracks copilot skill routing decisions. Sequences are checked first (agent-sequence category), then individual skills.';
