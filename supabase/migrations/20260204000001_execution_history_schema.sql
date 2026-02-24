-- Migration: Execution History - Structured Response Persistence & Retention
-- Purpose: Store full structured response payloads for the last 5 executions per skill,
--          enabling admin replay of past skill/sequence runs in Copilot Lab.
-- Date: 2026-02-04

-- =============================================================================
-- Add structured_response column to copilot_executions
-- =============================================================================

ALTER TABLE copilot_executions
  ADD COLUMN IF NOT EXISTS structured_response JSONB;

-- Comment for documentation
COMMENT ON COLUMN copilot_executions.structured_response IS
  'Full CopilotResponse payload (type, summary, data, actions, metadata) for replay. Retained for last 5 executions per skill_key, pruned to NULL for older rows.';

-- =============================================================================
-- Add skill_key to copilot_executions for efficient per-skill queries
-- (Currently skill_key only lives on copilot_tool_calls)
-- =============================================================================

ALTER TABLE copilot_executions
  ADD COLUMN IF NOT EXISTS skill_key TEXT;

ALTER TABLE copilot_executions
  ADD COLUMN IF NOT EXISTS sequence_key TEXT;

COMMENT ON COLUMN copilot_executions.skill_key IS 'Primary skill invoked in this execution. Populated from first tool call with a skill_key.';
COMMENT ON COLUMN copilot_executions.sequence_key IS 'Sequence key if this execution ran a sequence.';

-- =============================================================================
-- Indexes for execution history queries
-- =============================================================================

-- Per-skill history (used by skill detail History tab)
CREATE INDEX IF NOT EXISTS idx_copilot_executions_skill_key
  ON copilot_executions(skill_key, started_at DESC)
  WHERE skill_key IS NOT NULL;

-- Per-sequence history
CREATE INDEX IF NOT EXISTS idx_copilot_executions_sequence_key
  ON copilot_executions(sequence_key, started_at DESC)
  WHERE sequence_key IS NOT NULL;

-- Executions with structured responses (for replay filtering)
CREATE INDEX IF NOT EXISTS idx_copilot_executions_has_structured_response
  ON copilot_executions(organization_id, started_at DESC)
  WHERE structured_response IS NOT NULL;

-- Per-skill on tool_calls for joining
CREATE INDEX IF NOT EXISTS idx_copilot_tool_calls_skill_key
  ON copilot_tool_calls(skill_key, started_at DESC)
  WHERE skill_key IS NOT NULL;

-- =============================================================================
-- Service role can update executions (needed for structured_response writes)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'copilot_executions'
    AND policyname = 'Service role can update copilot executions'
  ) THEN
    CREATE POLICY "Service role can update copilot executions"
      ON copilot_executions
      FOR UPDATE
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- Retention function: keep last 5 structured_response per skill_key
-- =============================================================================

CREATE OR REPLACE FUNCTION prune_old_structured_responses(
  p_skill_key TEXT DEFAULT NULL,
  p_sequence_key TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pruned_count INTEGER := 0;
  seq_pruned INTEGER := 0;
BEGIN
  -- Prune by skill_key
  IF p_skill_key IS NOT NULL THEN
    WITH ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (ORDER BY started_at DESC) AS rn
      FROM copilot_executions
      WHERE skill_key = p_skill_key
        AND structured_response IS NOT NULL
    )
    UPDATE copilot_executions
    SET structured_response = NULL
    WHERE id IN (SELECT id FROM ranked WHERE rn > 5);

    GET DIAGNOSTICS pruned_count = ROW_COUNT;
  END IF;

  -- Prune by sequence_key
  IF p_sequence_key IS NOT NULL THEN
    WITH ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (ORDER BY started_at DESC) AS rn
      FROM copilot_executions
      WHERE sequence_key = p_sequence_key
        AND structured_response IS NOT NULL
    )
    UPDATE copilot_executions
    SET structured_response = NULL
    WHERE id IN (SELECT id FROM ranked WHERE rn > 5);

    GET DIAGNOSTICS seq_pruned = ROW_COUNT;
    pruned_count := pruned_count + seq_pruned;
  END IF;

  RETURN pruned_count;
END;
$$;

COMMENT ON FUNCTION prune_old_structured_responses IS
  'Keeps only the last 5 structured_response payloads per skill_key/sequence_key. Called after each execution insert.';

-- =============================================================================
-- Helper: Get execution history with tool calls for replay
-- =============================================================================

CREATE OR REPLACE FUNCTION get_execution_history(
  p_org_id UUID,
  p_skill_key TEXT DEFAULT NULL,
  p_sequence_key TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_success_only BOOLEAN DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  execution_id UUID,
  user_id UUID,
  user_message TEXT,
  skill_key TEXT,
  sequence_key TEXT,
  success BOOLEAN,
  error_message TEXT,
  tools_used TEXT[],
  tool_call_count INTEGER,
  iterations INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  total_tokens INTEGER,
  has_structured_response BOOLEAN,
  structured_response JSONB,
  tool_calls JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id AS execution_id,
    ce.user_id,
    ce.user_message,
    ce.skill_key,
    ce.sequence_key,
    ce.success,
    ce.error_message,
    ce.tools_used,
    ce.tool_call_count,
    ce.iterations,
    ce.started_at,
    ce.completed_at,
    ce.duration_ms,
    ce.total_tokens,
    (ce.structured_response IS NOT NULL) AS has_structured_response,
    ce.structured_response,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', tc.id,
            'tool_name', tc.tool_name,
            'skill_id', tc.skill_id,
            'skill_key', tc.skill_key,
            'input', tc.input,
            'output', tc.output,
            'status', tc.status,
            'error_message', tc.error_message,
            'started_at', tc.started_at,
            'completed_at', tc.completed_at,
            'duration_ms', tc.duration_ms
          )
          ORDER BY tc.started_at ASC
        )
        FROM copilot_tool_calls tc
        WHERE tc.execution_id = ce.id
      ),
      '[]'::JSONB
    ) AS tool_calls
  FROM copilot_executions ce
  WHERE ce.organization_id = p_org_id
    AND (p_skill_key IS NULL OR ce.skill_key = p_skill_key)
    AND (p_sequence_key IS NULL OR ce.sequence_key = p_sequence_key)
    AND (p_user_id IS NULL OR ce.user_id = p_user_id)
    AND (p_success_only IS NULL OR ce.success = p_success_only)
  ORDER BY ce.started_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION get_execution_history IS
  'Fetches execution history with embedded tool calls for the Copilot Lab History tab and per-skill History tab.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
