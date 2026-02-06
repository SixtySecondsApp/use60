-- ============================================================================
-- Create slack_pending_actions table for HITL confirmation flow
-- HITL-002: Preserve context through proactive → action flow
-- ============================================================================

-- Table to store pending actions awaiting user confirmation in Slack
CREATE TABLE IF NOT EXISTS slack_pending_actions (
  id TEXT PRIMARY KEY,  -- Format: slack_pending_{timestamp}_{random}
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,  -- Slack channel ID
  thread_ts TEXT,  -- Slack thread timestamp for reply threading
  sequence_key TEXT NOT NULL,  -- The sequence to execute on confirm
  sequence_context JSONB DEFAULT '{}',  -- Context to pass to sequence
  preview TEXT,  -- Preview text shown to user
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,  -- Auto-expire after 30 minutes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by user and status
CREATE INDEX IF NOT EXISTS idx_slack_pending_actions_user_status
  ON slack_pending_actions(user_id, status);

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_slack_pending_actions_expires
  ON slack_pending_actions(expires_at)
  WHERE status = 'pending';

-- RLS policies
ALTER TABLE slack_pending_actions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role has full access to slack_pending_actions"
  ON slack_pending_actions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own pending actions
CREATE POLICY "Users can view own pending actions"
  ON slack_pending_actions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Comment
COMMENT ON TABLE slack_pending_actions IS 'Stores pending Slack HITL actions awaiting user confirmation before execution';

-- ============================================================================
-- Function to auto-expire old pending actions
-- ============================================================================

CREATE OR REPLACE FUNCTION expire_slack_pending_actions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE slack_pending_actions
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'pending'
    AND expires_at < NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

COMMENT ON FUNCTION expire_slack_pending_actions IS 'Expires pending Slack HITL actions that have passed their expiration time';
