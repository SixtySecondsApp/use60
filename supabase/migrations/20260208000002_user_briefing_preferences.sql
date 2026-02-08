-- Migration: SLACK-013 — Per-user briefing time preference
-- Adds preferred morning brief time + timezone to slack_user_mappings
-- Allows each user to receive their morning brief at their preferred local time

-- Add briefing preference columns to slack_user_mappings
ALTER TABLE slack_user_mappings
  ADD COLUMN IF NOT EXISTS preferred_briefing_time TIME DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS preferred_timezone TEXT DEFAULT 'America/New_York';

-- Comment on new columns
COMMENT ON COLUMN slack_user_mappings.preferred_briefing_time IS 'User preferred morning brief delivery time (local to their timezone)';
COMMENT ON COLUMN slack_user_mappings.preferred_timezone IS 'IANA timezone for morning brief scheduling';

-- Index for cron query: find users whose briefing is due
CREATE INDEX IF NOT EXISTS idx_slack_user_mappings_briefing_time
ON slack_user_mappings (preferred_briefing_time, preferred_timezone)
WHERE sixty_user_id IS NOT NULL;
