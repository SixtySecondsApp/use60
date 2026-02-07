-- Migration: SLACK-028 — Slack command analytics + rate limiting
-- Tracks @60 commands and slash commands for analytics and rate limiting.

CREATE TABLE IF NOT EXISTS slack_command_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  command_type TEXT NOT NULL, -- 'app_mention', 'slash_command'
  intent TEXT, -- Parsed intent type: 'follow_up', 'find_contacts', etc.
  raw_text TEXT,
  response_time_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for rate limiting: recent commands per user
CREATE INDEX IF NOT EXISTS idx_slack_command_analytics_user_recent
ON slack_command_analytics (user_id, created_at DESC);

-- Index for analytics: commands per org
CREATE INDEX IF NOT EXISTS idx_slack_command_analytics_org
ON slack_command_analytics (org_id, created_at DESC);

-- Enable RLS
ALTER TABLE slack_command_analytics ENABLE ROW LEVEL SECURITY;

-- Service role full access (edge functions write analytics)
CREATE POLICY "Service role full access to command analytics"
ON slack_command_analytics FOR ALL
USING (true)
WITH CHECK (true);

-- Users can read their own analytics
CREATE POLICY "Users can read own command analytics"
ON slack_command_analytics FOR SELECT
USING (user_id = auth.uid());

-- Grant permissions
GRANT SELECT ON slack_command_analytics TO authenticated;
GRANT ALL ON slack_command_analytics TO service_role;

COMMENT ON TABLE slack_command_analytics IS 'Tracks @60 mention commands and slash commands for analytics and rate limiting';
