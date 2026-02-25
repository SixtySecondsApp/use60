-- ============================================================================
-- CM-001: Create Copilot Memory tables
-- 7-day conversation memory for AI context continuity
-- ============================================================================

-- Main table for copilot memory entries
CREATE TABLE IF NOT EXISTS copilot_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Conversation reference
  conversation_id UUID,

  -- Memory content
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'conversation',    -- General conversation summary
    'action_sent',     -- Email sent, Slack message posted
    'action_created',  -- Task created, field updated
    'insight_viewed',  -- User viewed an insight/alert
    'meeting_prep',    -- Meeting preparation was viewed
    'sequence_run'     -- Sequence was executed
  )),
  summary TEXT NOT NULL,  -- AI-generated summary of the interaction
  context_snippet TEXT,   -- Key quote or detail for context injection

  -- Entity references for context
  entities JSONB DEFAULT '{}',  -- {contacts: [{id, name}], deals: [{id, name}], companies: [{id, name}]}

  -- Metadata
  metadata JSONB DEFAULT '{}',  -- Additional context-specific data

  -- Timestamps
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),

  -- Full-text search
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(summary, '') || ' ' || COALESCE(context_snippet, ''))
  ) STORED
);

-- Indexes for efficient queries
-- Note: Partial indexes cannot use NOW() as it's not immutable
-- The expires_at filter is applied at query time instead
CREATE INDEX IF NOT EXISTS idx_copilot_memory_user_time
  ON copilot_memory(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_memory_org_time
  ON copilot_memory(organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_memory_expires
  ON copilot_memory(expires_at);

CREATE INDEX IF NOT EXISTS idx_copilot_memory_search
  ON copilot_memory USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_copilot_memory_conversation
  ON copilot_memory(conversation_id)
  WHERE conversation_id IS NOT NULL;

-- RLS policies
ALTER TABLE copilot_memory ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DO $$ BEGIN
  CREATE POLICY "Service role has full access to copilot_memory"
  ON copilot_memory
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can view their own memory
DO $$ BEGIN
  CREATE POLICY "Users can view own copilot memory"
  ON copilot_memory
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Comment
COMMENT ON TABLE copilot_memory IS 'Stores 7-day conversation memory for AI context continuity';

-- ============================================================================
-- Function to add memory entry
-- ============================================================================

CREATE OR REPLACE FUNCTION add_copilot_memory(
  p_user_id UUID,
  p_org_id UUID,
  p_memory_type TEXT,
  p_summary TEXT,
  p_context_snippet TEXT DEFAULT NULL,
  p_entities JSONB DEFAULT '{}',
  p_metadata JSONB DEFAULT '{}',
  p_conversation_id UUID DEFAULT NULL,
  p_occurred_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_memory_id UUID;
BEGIN
  INSERT INTO copilot_memory (
    user_id,
    organization_id,
    memory_type,
    summary,
    context_snippet,
    entities,
    metadata,
    conversation_id,
    occurred_at
  ) VALUES (
    p_user_id,
    p_org_id,
    p_memory_type,
    p_summary,
    p_context_snippet,
    p_entities,
    p_metadata,
    p_conversation_id,
    p_occurred_at
  )
  RETURNING id INTO v_memory_id;

  RETURN v_memory_id;
END;
$$;

COMMENT ON FUNCTION add_copilot_memory IS 'Adds a new memory entry for copilot context';

-- ============================================================================
-- Function to get recent memory for context injection
-- ============================================================================

CREATE OR REPLACE FUNCTION get_recent_copilot_memory(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  memory_type TEXT,
  summary TEXT,
  context_snippet TEXT,
  entities JSONB,
  occurred_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    id,
    memory_type,
    summary,
    context_snippet,
    entities,
    occurred_at
  FROM copilot_memory
  WHERE user_id = p_user_id
    AND expires_at > NOW()
  ORDER BY occurred_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_recent_copilot_memory IS 'Returns recent memory entries for context injection into copilot';

-- ============================================================================
-- Function to search memory
-- ============================================================================

CREATE OR REPLACE FUNCTION search_copilot_memory(
  p_user_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  memory_type TEXT,
  summary TEXT,
  context_snippet TEXT,
  entities JSONB,
  occurred_at TIMESTAMPTZ,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    id,
    memory_type,
    summary,
    context_snippet,
    entities,
    occurred_at,
    ts_rank(search_vector, websearch_to_tsquery('english', p_query)) AS rank
  FROM copilot_memory
  WHERE user_id = p_user_id
    AND expires_at > NOW()
    AND search_vector @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank DESC, occurred_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION search_copilot_memory IS 'Full-text search on copilot memory entries';

-- ============================================================================
-- Function to cleanup expired memory
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_copilot_memory()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM copilot_memory
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_copilot_memory IS 'Deletes expired memory entries older than 7 days';

-- ============================================================================
-- Schedule cleanup job (if pg_cron available)
-- ============================================================================

DO $$
BEGIN
  -- Schedule daily cleanup at 3am
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-copilot-memory',
      '0 3 * * *',
      'SELECT cleanup_expired_copilot_memory();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available, skip scheduling
  RAISE NOTICE 'pg_cron not available, skipping memory cleanup scheduling';
END $$;
