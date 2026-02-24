-- Migration: SLACK-018 — Per-user notification preferences
-- Gives each user granular control over which Slack notifications they receive,
-- quiet hours, and rate limiting.

CREATE TABLE IF NOT EXISTS slack_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  quiet_hours_start TIME DEFAULT '20:00',
  quiet_hours_end TIME DEFAULT '07:00',
  max_notifications_per_hour INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT slack_user_preferences_feature_check CHECK (
    feature IN (
      'morning_brief',
      'post_meeting',
      'deal_risk',
      'campaign_alerts',
      'task_reminders',
      'deal_momentum'
    )
  ),
  CONSTRAINT slack_user_preferences_unique UNIQUE (user_id, org_id, feature)
);

-- Index for delivery layer lookups
CREATE INDEX IF NOT EXISTS idx_slack_user_preferences_user
ON slack_user_preferences (user_id, org_id);

-- Enable RLS
ALTER TABLE slack_user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own preferences
CREATE POLICY "Users can read own notification preferences"
ON slack_user_preferences FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own notification preferences"
ON slack_user_preferences FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notification preferences"
ON slack_user_preferences FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Service role has full access
CREATE POLICY "Service role full access to notification preferences"
ON slack_user_preferences FOR ALL
USING (true)
WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_slack_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_slack_user_preferences_updated_at
  BEFORE UPDATE ON slack_user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_slack_user_preferences_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON slack_user_preferences TO authenticated;
GRANT ALL ON slack_user_preferences TO service_role;

COMMENT ON TABLE slack_user_preferences IS 'Per-user Slack notification preferences with quiet hours and rate limiting';
