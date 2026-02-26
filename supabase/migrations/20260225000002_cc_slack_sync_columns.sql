-- ============================================================================
-- Migration: Add Slack sync columns to command_centre_items
-- Purpose: Enable bi-directional state sync between Slack messages and CC items.
--          Stores the Slack message timestamp and channel for chat.update calls.
-- Story: CC-002
-- Date: 2026-02-25
-- ============================================================================

-- Slack message reference for bi-directional sync
ALTER TABLE command_centre_items
  ADD COLUMN IF NOT EXISTS slack_message_ts TEXT,
  ADD COLUMN IF NOT EXISTS slack_channel_id TEXT;

-- Index for efficient Slack → CC lookup when processing interactive actions
CREATE INDEX IF NOT EXISTS idx_cc_slack_message
  ON command_centre_items (slack_message_ts)
  WHERE slack_message_ts IS NOT NULL;

-- Add auto_send_types to user_settings for per-type auto-execution preferences
-- Default empty object means all types require manual approval
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_settings'
      AND column_name = 'auto_send_types'
  ) THEN
    ALTER TABLE user_settings
      ADD COLUMN auto_send_types JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Comments
COMMENT ON COLUMN command_centre_items.slack_message_ts IS
  'Slack message timestamp (ts) for bi-directional status sync. Used with chat.update.';
COMMENT ON COLUMN command_centre_items.slack_channel_id IS
  'Slack channel/DM ID where the notification was sent. Required for chat.update.';

-- Migration summary
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260225000002_cc_slack_sync_columns.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Story: CC-002';
  RAISE NOTICE '';
  RAISE NOTICE 'New columns:';
  RAISE NOTICE '  command_centre_items.slack_message_ts — Slack message timestamp';
  RAISE NOTICE '  command_centre_items.slack_channel_id — Slack channel/DM ID';
  RAISE NOTICE '  user_settings.auto_send_types — Per-type auto-send preferences';
  RAISE NOTICE '';
  RAISE NOTICE 'New index:';
  RAISE NOTICE '  idx_cc_slack_message — Slack message lookup';
  RAISE NOTICE '============================================================================';
END $$;
