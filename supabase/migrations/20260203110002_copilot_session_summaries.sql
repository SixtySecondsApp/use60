-- Migration: Create copilot_session_summaries table for compaction storage
-- Purpose: Store conversation summaries when messages are compacted
-- Date: 2026-02-03

-- =============================================================================
-- Create copilot_session_summaries table
-- =============================================================================

CREATE TABLE IF NOT EXISTS copilot_session_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES copilot_conversations(id) ON DELETE CASCADE,

  -- Summary content
  summary TEXT NOT NULL,
  key_points JSONB,                     -- Array of extracted key points

  -- Message range that was summarized
  message_range_start UUID,             -- First message ID summarized
  message_range_end UUID,               -- Last message ID summarized
  messages_summarized INTEGER NOT NULL DEFAULT 0,

  -- Token metrics for analytics
  tokens_before INTEGER,                -- Token count before compaction
  tokens_after INTEGER,                 -- Token count after compaction (summary tokens)

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Indexes for efficient querying
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_session_summaries_user_id
  ON copilot_session_summaries(user_id);

CREATE INDEX IF NOT EXISTS idx_session_summaries_conversation
  ON copilot_session_summaries(conversation_id);

CREATE INDEX IF NOT EXISTS idx_session_summaries_created
  ON copilot_session_summaries(conversation_id, created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE copilot_session_summaries ENABLE ROW LEVEL SECURITY;

-- Users can view summaries for their own conversations
DO $$ BEGIN
  CREATE POLICY "Users can view own session summaries"
  ON copilot_session_summaries
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can insert summaries for their own conversations
DO $$ BEGIN
  CREATE POLICY "Users can insert own session summaries"
  ON copilot_session_summaries
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role can manage all summaries (for edge functions)
DO $$ BEGIN
  CREATE POLICY "Service role can manage all session summaries"
  ON copilot_session_summaries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Helper function to get summaries for context building
-- =============================================================================

CREATE OR REPLACE FUNCTION get_conversation_summaries(
  p_conversation_id UUID,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  summary TEXT,
  key_points JSONB,
  messages_summarized INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.summary,
    s.key_points,
    s.messages_summarized,
    s.created_at
  FROM copilot_session_summaries s
  WHERE s.conversation_id = p_conversation_id
  ORDER BY s.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
