-- ============================================================================
-- RETRY-002: Create agent_dead_letters table
-- Dead Letter Queue (DLQ) for failed agent executions awaiting review/retry
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_dead_letters (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id        UUID        NOT NULL,
  agent_name      TEXT        NOT NULL,
  trigger_type    TEXT        NOT NULL,
  trigger_payload JSONB       NOT NULL DEFAULT '{}',
  failure_reason  TEXT        NOT NULL,
  error_detail    TEXT,
  retry_count     INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_agent_dead_letters_agent_created
  ON agent_dead_letters(agent_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_dead_letters_unresolved
  ON agent_dead_letters(resolved_at)
  WHERE resolved_at IS NULL;

-- RLS
ALTER TABLE agent_dead_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to agent_dead_letters" ON agent_dead_letters;
DO $$ BEGIN
  CREATE POLICY "Service role has full access to agent_dead_letters"
  ON agent_dead_letters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Platform admins can read agent_dead_letters" ON agent_dead_letters;
DO $$ BEGIN
  CREATE POLICY "Platform admins can read agent_dead_letters"
  ON agent_dead_letters
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Comments
COMMENT ON TABLE agent_dead_letters IS 'Dead Letter Queue for failed agent executions — stores failures for review, retry, and debugging';
COMMENT ON COLUMN agent_dead_letters.trace_id IS 'Correlation ID linking this failure to a specific agent execution trace';
COMMENT ON COLUMN agent_dead_letters.agent_name IS 'Name of the agent that failed (e.g. pipeline-monitor, meeting-prep)';
COMMENT ON COLUMN agent_dead_letters.trigger_type IS 'How the agent was triggered (e.g. cron, webhook, user, proactive)';
COMMENT ON COLUMN agent_dead_letters.trigger_payload IS 'Original trigger payload for replay/retry purposes';
COMMENT ON COLUMN agent_dead_letters.failure_reason IS 'Human-readable summary of why the agent failed';
COMMENT ON COLUMN agent_dead_letters.error_detail IS 'Full error message or stack trace for debugging';
COMMENT ON COLUMN agent_dead_letters.retry_count IS 'Number of retry attempts made before landing in the DLQ';
COMMENT ON COLUMN agent_dead_letters.resolved_at IS 'Timestamp when the failure was resolved or dismissed; NULL = still open';
