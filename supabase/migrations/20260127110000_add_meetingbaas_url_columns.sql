-- Add MeetingBaaS URL columns to bot_deployments table
-- These store temporary 4-hour URLs from MeetingBaaS for S3 upload

ALTER TABLE bot_deployments
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS audio_url TEXT;

COMMENT ON COLUMN bot_deployments.video_url IS 'Temporary video URL from MeetingBaaS (expires after 4 hours)';
COMMENT ON COLUMN bot_deployments.audio_url IS 'Temporary audio URL from MeetingBaaS (expires after 4 hours)';
