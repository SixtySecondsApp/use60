-- SLACK-001: Snoozed items table for re-notification scheduling
-- Stores items that have been snoozed by users in Slack, with a scheduled re-notification time.

CREATE TABLE IF NOT EXISTS slack_snoozed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- 'deal', 'task', 'meeting', 'notification', 'deal_alert', 'campaign_alert'
  entity_id TEXT NOT NULL,
  snooze_until TIMESTAMPTZ NOT NULL,
  original_message_blocks JSONB, -- Store original Slack blocks for re-send
  original_context JSONB, -- Additional context (deal name, value, etc.)
  notification_type TEXT, -- 'morning_brief', 'deal_risk', 'stale_deal', 'campaign_alert', 'task_reminder'
  snoozed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resurfaced_at TIMESTAMPTZ, -- NULL until re-notification sent
  slack_user_id TEXT, -- Slack user ID for DM delivery
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for the cron job that checks for due snoozes
CREATE INDEX idx_slack_snoozed_items_due
  ON slack_snoozed_items (snooze_until)
  WHERE resurfaced_at IS NULL;

-- Index for user lookups
CREATE INDEX idx_slack_snoozed_items_user
  ON slack_snoozed_items (user_id, entity_type, entity_id);

-- RLS
ALTER TABLE slack_snoozed_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own snoozed items"
  ON slack_snoozed_items FOR SELECT
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own snoozed items"
  ON slack_snoozed_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role has full access to snoozed items"
  ON slack_snoozed_items FOR ALL
  USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
