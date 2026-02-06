-- Migration: Add bot_scheduling_enabled to meetingbaas_calendars
-- This column tracks whether MeetingBaaS native bot scheduling is active for a calendar
-- Native bot scheduling eliminates the need for our polling auto-join-scheduler

-- Add the column
ALTER TABLE meetingbaas_calendars
ADD COLUMN IF NOT EXISTS bot_scheduling_enabled BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN meetingbaas_calendars.bot_scheduling_enabled IS
  'Whether MeetingBaaS native bot scheduling is enabled for this calendar. When true, MeetingBaaS automatically deploys bots to all calendar events with meeting URLs.';

-- Index for efficient lookup of calendars with bot scheduling enabled
CREATE INDEX IF NOT EXISTS idx_meetingbaas_calendars_bot_scheduling
ON meetingbaas_calendars (org_id, bot_scheduling_enabled)
WHERE bot_scheduling_enabled = TRUE;
