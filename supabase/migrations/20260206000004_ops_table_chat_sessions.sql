-- OI-025: Ops Table Chat Sessions Schema
CREATE TABLE IF NOT EXISTS ops_table_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES dynamic_tables(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]'::jsonb,
  context JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_sessions_table ON ops_table_chat_sessions(table_id);
CREATE INDEX idx_chat_sessions_user ON ops_table_chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_expires ON ops_table_chat_sessions(expires_at);
ALTER TABLE ops_table_chat_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own chat sessions" ON ops_table_chat_sessions FOR SELECT
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own chat sessions" ON ops_table_chat_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own chat sessions" ON ops_table_chat_sessions FOR UPDATE
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
