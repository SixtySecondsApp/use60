-- Migration: Add bot minimum wait time setting
-- Date: 2026-01-27
--
-- Purpose: Allow configuring how long the bot should wait in an empty meeting
-- before leaving. This prevents bots from leaving immediately if the host is late.

-- Add minimum_wait_minutes to recording_settings
COMMENT ON COLUMN organizations.recording_settings IS
  'JSON settings for MeetingBaaS bot recording configuration. Fields:
   - bot_name: Display name for the bot
   - bot_image_url: Avatar image URL
   - entry_message_enabled: Whether to show entry message
   - entry_message: Custom entry message
   - default_transcription_provider: gladia or meetingbaas
   - recordings_enabled: Global enable/disable
   - auto_record_enabled: Enable auto-join scheduler
   - auto_record_lead_time_minutes: Minutes before meeting to join (default: 2)
   - auto_record_external_only: Only record meetings with external attendees
   - minimum_wait_minutes: Minimum time bot should stay in empty meeting (default: 15)
   - webhook_token: Token for webhook authentication';

-- Note: The field is added to the existing JSONB column, no schema change needed
-- Organizations can now set: recording_settings->minimum_wait_minutes

-- Example usage:
-- UPDATE organizations
-- SET recording_settings = jsonb_set(
--   COALESCE(recording_settings, '{}'::jsonb),
--   '{minimum_wait_minutes}',
--   '15'::jsonb
-- )
-- WHERE id = '<org_id>';
