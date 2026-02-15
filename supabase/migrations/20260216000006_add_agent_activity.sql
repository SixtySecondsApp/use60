-- ============================================================================
-- Migration: Agent Activity Table and RPCs
-- Purpose: Create in-app activity feed for orchestrator events
-- Feature: CONF-009 (Agent Activity Feed)
-- Date: 2026-02-16
-- ============================================================================

-- =============================================================================
-- Table: agent_activity
-- Stores orchestrator event activities for in-app feed display
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and organization context
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,

  -- Event and execution context
  sequence_type TEXT NOT NULL, -- e.g., 'meeting_debrief', 'deal_risk', 'reengagement'
  job_id UUID DEFAULT NULL REFERENCES sequence_jobs(id) ON DELETE SET NULL,

  -- Activity metadata
  title TEXT NOT NULL, -- e.g., "Meeting Debrief: Call with Acme Corp"
  summary TEXT NOT NULL, -- Brief summary of the activity output
  metadata JSONB DEFAULT '{}', -- Sequence-specific data (deal name, risk score, etc.)

  -- Read status
  is_read BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary feed query: user_id + org_id with recency
CREATE INDEX IF NOT EXISTS idx_agent_activity_feed
  ON agent_activity(user_id, org_id, created_at DESC);

-- Unread count query
CREATE INDEX IF NOT EXISTS idx_agent_activity_unread
  ON agent_activity(user_id, org_id)
  WHERE is_read = false;

-- Job lookup (optional, for tracing)
CREATE INDEX IF NOT EXISTS idx_agent_activity_job
  ON agent_activity(job_id)
  WHERE job_id IS NOT NULL;

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE agent_activity ENABLE ROW LEVEL SECURITY;

-- Users can read their own activity
DROP POLICY IF EXISTS "Users can read own agent activity" ON agent_activity;
CREATE POLICY "Users can read own agent activity"
  ON agent_activity FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can mark their own activity as read
DROP POLICY IF EXISTS "Users can mark own agent activity read" ON agent_activity;
CREATE POLICY "Users can mark own agent activity read"
  ON agent_activity FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role has full access (for edge functions that insert activity)
DROP POLICY IF EXISTS "Service role has full access to agent_activity" ON agent_activity;
CREATE POLICY "Service role has full access to agent_activity"
  ON agent_activity FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE agent_activity IS
  'Stores orchestrator event activities for in-app activity feed. Mirrored from orchestrator events.';

COMMENT ON COLUMN agent_activity.user_id IS
  'User who owns this activity';

COMMENT ON COLUMN agent_activity.org_id IS
  'Organization identifier (clerk_org_id)';

COMMENT ON COLUMN agent_activity.sequence_type IS
  'Orchestrator event/sequence type that generated this activity';

COMMENT ON COLUMN agent_activity.job_id IS
  'Optional reference to sequence_jobs record';

COMMENT ON COLUMN agent_activity.title IS
  'Human-readable title of the activity';

COMMENT ON COLUMN agent_activity.summary IS
  'Brief summary of the activity output';

COMMENT ON COLUMN agent_activity.metadata IS
  'Sequence-specific metadata for rendering (deal name, risk score, etc.)';

COMMENT ON COLUMN agent_activity.is_read IS
  'Whether user has marked this activity as read';

COMMENT ON COLUMN agent_activity.created_at IS
  'When this activity was created (matches orchestrator event time)';

-- =============================================================================
-- RPC: Get activity feed for user and organization
-- =============================================================================

CREATE OR REPLACE FUNCTION get_agent_activity_feed(
  p_user_id UUID,
  p_org_id TEXT,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  sequence_type TEXT,
  job_id UUID,
  title TEXT,
  summary TEXT,
  metadata JSONB,
  is_read BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id, sequence_type, job_id, title, summary, metadata, is_read, created_at
  FROM agent_activity
  WHERE user_id = p_user_id AND org_id = p_org_id
  ORDER BY created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

COMMENT ON FUNCTION get_agent_activity_feed IS
  'Returns paginated activity feed for a user in an organization, ordered by most recent first';

GRANT EXECUTE ON FUNCTION get_agent_activity_feed TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_activity_feed TO service_role;

-- =============================================================================
-- RPC: Get unread activity count
-- =============================================================================

CREATE OR REPLACE FUNCTION get_agent_activity_unread_count(
  p_user_id UUID,
  p_org_id TEXT
)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INT
  FROM agent_activity
  WHERE user_id = p_user_id AND org_id = p_org_id AND is_read = false;
$$;

COMMENT ON FUNCTION get_agent_activity_unread_count IS
  'Returns the count of unread activities for a user in an organization';

GRANT EXECUTE ON FUNCTION get_agent_activity_unread_count TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_activity_unread_count TO service_role;

-- =============================================================================
-- RPC: Mark activities as read
-- =============================================================================

CREATE OR REPLACE FUNCTION mark_agent_activity_read(
  p_user_id UUID,
  p_activity_ids UUID[]
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE agent_activity SET is_read = true
  WHERE id = ANY(p_activity_ids) AND user_id = p_user_id;
$$;

COMMENT ON FUNCTION mark_agent_activity_read IS
  'Marks specified activities as read for a user';

GRANT EXECUTE ON FUNCTION mark_agent_activity_read TO authenticated;
GRANT EXECUTE ON FUNCTION mark_agent_activity_read TO service_role;

-- =============================================================================
-- RPC: Insert agent activity (called by orchestrator)
-- =============================================================================

CREATE OR REPLACE FUNCTION insert_agent_activity(
  p_user_id UUID,
  p_org_id TEXT,
  p_sequence_type TEXT,
  p_title TEXT,
  p_summary TEXT,
  p_metadata JSONB DEFAULT '{}',
  p_job_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO agent_activity (
    user_id,
    org_id,
    sequence_type,
    job_id,
    title,
    summary,
    metadata,
    is_read,
    created_at
  ) VALUES (
    p_user_id,
    p_org_id,
    p_sequence_type,
    p_job_id,
    p_title,
    p_summary,
    p_metadata,
    false,
    now()
  )
  RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$;

COMMENT ON FUNCTION insert_agent_activity IS
  'Inserts a new activity into the agent activity feed. Called by orchestrator edge functions.';

GRANT EXECUTE ON FUNCTION insert_agent_activity TO authenticated;
GRANT EXECUTE ON FUNCTION insert_agent_activity TO service_role;
