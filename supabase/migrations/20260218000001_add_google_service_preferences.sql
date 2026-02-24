-- Add service_preferences JSONB column to google_integrations
-- This allows users to toggle individual Google services (Gmail, Calendar, Drive) on/off
-- Default: all services enabled for existing integrations

ALTER TABLE google_integrations
ADD COLUMN IF NOT EXISTS service_preferences jsonb NOT NULL DEFAULT '{"gmail": true, "calendar": true, "drive": true}'::jsonb;

-- Comment
COMMENT ON COLUMN google_integrations.service_preferences IS
  'Per-service enable/disable flags. Keys: gmail, calendar, drive. Defaults to all enabled.';
