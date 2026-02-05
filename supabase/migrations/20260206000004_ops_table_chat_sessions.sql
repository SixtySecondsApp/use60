-- OI-025: Create ops_table_chat_sessions schema and migration
-- Conversational context for multi-turn Ops table interactions

-- Main chat sessions table
CREATE TABLE ops_table_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES dynamic_tables(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Conversation history
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Array of { role: 'user' | 'assistant', content: string, timestamp: string, action_result?: object }

  -- Accumulated context
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- {
  --   current_filters: [...],
  --   current_sort: {...},
  --   visible_columns: [...],
  --   row_count: number,
  --   last_query_result: {...}
  -- }

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- Indexes
CREATE INDEX idx_chat_sessions_table_user ON ops_table_chat_sessions(table_id, user_id, expires_at DESC)
  WHERE expires_at > NOW();

CREATE INDEX idx_chat_sessions_expires ON ops_table_chat_sessions(expires_at)
  WHERE expires_at <= NOW();

-- RLS Policies
ALTER TABLE ops_table_chat_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own sessions
CREATE POLICY "Users can read own chat sessions"
  ON ops_table_chat_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own chat sessions"
  ON ops_table_chat_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own chat sessions"
  ON ops_table_chat_sessions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own chat sessions"
  ON ops_table_chat_sessions FOR DELETE
  USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_ops_table_chat_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ops_table_chat_sessions_updated_at
  BEFORE UPDATE ON ops_table_chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_ops_table_chat_sessions_updated_at();

-- Auto-cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_chat_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM ops_table_chat_sessions
  WHERE expires_at <= NOW();
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE ops_table_chat_sessions IS 'Conversational context for multi-turn Ops table query sessions';
COMMENT ON COLUMN ops_table_chat_sessions.messages IS 'Conversation history with role, content, and action results';
COMMENT ON COLUMN ops_table_chat_sessions.context IS 'Accumulated table state (filters, sort, columns) for context-aware queries';
COMMENT ON COLUMN ops_table_chat_sessions.expires_at IS 'Sessions auto-expire after 24 hours of inactivity';
