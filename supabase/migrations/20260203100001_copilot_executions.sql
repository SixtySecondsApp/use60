-- Migration: Add copilot_executions table for analytics
-- Purpose: Track autonomous copilot usage, tool calls, and performance
-- Date: 2026-02-03

-- =============================================================================
-- Create copilot_executions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS copilot_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Request details
  user_message TEXT NOT NULL,
  execution_mode TEXT NOT NULL DEFAULT 'autonomous', -- 'autonomous', 'agent', 'legacy'
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',

  -- Response details
  response_text TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,

  -- Tool usage
  tools_used TEXT[] DEFAULT ARRAY[]::TEXT[],
  tool_call_count INTEGER DEFAULT 0,
  iterations INTEGER DEFAULT 1,

  -- Performance metrics
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- Create copilot_tool_calls table for detailed tool analytics
-- =============================================================================

CREATE TABLE IF NOT EXISTS copilot_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES copilot_executions(id) ON DELETE CASCADE,

  -- Tool details
  tool_name TEXT NOT NULL,
  skill_id UUID REFERENCES platform_skills(id) ON DELETE SET NULL,
  skill_key TEXT,

  -- Input/Output
  input JSONB DEFAULT '{}'::JSONB,
  output JSONB,

  -- Status
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'error'
  error_message TEXT,

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- Indexes for efficient querying
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_copilot_executions_org_id ON copilot_executions(organization_id);
CREATE INDEX IF NOT EXISTS idx_copilot_executions_user_id ON copilot_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_copilot_executions_started_at ON copilot_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_executions_success ON copilot_executions(success);
CREATE INDEX IF NOT EXISTS idx_copilot_executions_mode ON copilot_executions(execution_mode);

CREATE INDEX IF NOT EXISTS idx_copilot_tool_calls_execution_id ON copilot_tool_calls(execution_id);
CREATE INDEX IF NOT EXISTS idx_copilot_tool_calls_tool_name ON copilot_tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_copilot_tool_calls_skill_id ON copilot_tool_calls(skill_id);
CREATE INDEX IF NOT EXISTS idx_copilot_tool_calls_status ON copilot_tool_calls(status);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE copilot_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_tool_calls ENABLE ROW LEVEL SECURITY;

-- Users can view their own executions
CREATE POLICY "Users can view own copilot executions"
  ON copilot_executions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Platform admins can view all executions in their org
CREATE POLICY "Platform admins can view org copilot executions"
  ON copilot_executions
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'platform_admin')
    )
  );

-- Service role can insert executions
CREATE POLICY "Service role can insert copilot executions"
  ON copilot_executions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Users can view tool calls for their executions
CREATE POLICY "Users can view own copilot tool calls"
  ON copilot_tool_calls
  FOR SELECT
  TO authenticated
  USING (
    execution_id IN (
      SELECT id FROM copilot_executions WHERE user_id = auth.uid()
    )
  );

-- Service role can insert tool calls
CREATE POLICY "Service role can insert copilot tool calls"
  ON copilot_tool_calls
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- =============================================================================
-- Helper function for analytics dashboard
-- =============================================================================

CREATE OR REPLACE FUNCTION get_copilot_analytics(
  p_org_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_executions BIGINT,
  successful_executions BIGINT,
  success_rate NUMERIC,
  total_tool_calls BIGINT,
  unique_tools_used BIGINT,
  avg_duration_ms NUMERIC,
  avg_iterations NUMERIC,
  total_tokens BIGINT,
  top_tools JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH execution_stats AS (
    SELECT
      COUNT(*) AS total_execs,
      COUNT(*) FILTER (WHERE success = true) AS success_execs,
      AVG(duration_ms) AS avg_dur,
      AVG(iterations) AS avg_iter,
      SUM(total_tokens) AS sum_tokens
    FROM copilot_executions
    WHERE organization_id = p_org_id
      AND started_at >= NOW() - (p_days || ' days')::INTERVAL
  ),
  tool_stats AS (
    SELECT
      COUNT(*) AS total_calls,
      COUNT(DISTINCT tool_name) AS unique_tools
    FROM copilot_tool_calls tc
    JOIN copilot_executions ce ON ce.id = tc.execution_id
    WHERE ce.organization_id = p_org_id
      AND ce.started_at >= NOW() - (p_days || ' days')::INTERVAL
  ),
  top_tool_stats AS (
    SELECT jsonb_agg(
      jsonb_build_object('tool', tool_name, 'count', cnt)
      ORDER BY cnt DESC
    ) AS top_tools_json
    FROM (
      SELECT tc.tool_name, COUNT(*) AS cnt
      FROM copilot_tool_calls tc
      JOIN copilot_executions ce ON ce.id = tc.execution_id
      WHERE ce.organization_id = p_org_id
        AND ce.started_at >= NOW() - (p_days || ' days')::INTERVAL
      GROUP BY tc.tool_name
      ORDER BY cnt DESC
      LIMIT 10
    ) t
  )
  SELECT
    es.total_execs,
    es.success_execs,
    CASE WHEN es.total_execs > 0
      THEN ROUND((es.success_execs::NUMERIC / es.total_execs) * 100, 2)
      ELSE 0
    END,
    ts.total_calls,
    ts.unique_tools,
    ROUND(es.avg_dur, 2),
    ROUND(es.avg_iter, 2),
    es.sum_tokens,
    COALESCE(tts.top_tools_json, '[]'::JSONB)
  FROM execution_stats es
  CROSS JOIN tool_stats ts
  CROSS JOIN top_tool_stats tts;
END;
$$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
