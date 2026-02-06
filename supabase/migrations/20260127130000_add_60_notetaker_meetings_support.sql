-- Add 60_notetaker support to meetings table
-- Adds bot_id, video_url, audio_url, recording_id columns
-- Updates source_type CHECK constraint to allow '60_notetaker'

-- 1. Add new columns for 60_notetaker meetings
ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS bot_id TEXT,
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS audio_url TEXT,
ADD COLUMN IF NOT EXISTS recording_id UUID REFERENCES recordings(id);

COMMENT ON COLUMN meetings.bot_id IS 'MeetingBaaS bot ID linking meeting to bot deployment';
COMMENT ON COLUMN meetings.video_url IS 'Permanent S3 video URL (synced from recordings.s3_video_url)';
COMMENT ON COLUMN meetings.audio_url IS 'Permanent S3 audio URL (synced from recordings.s3_audio_url)';
COMMENT ON COLUMN meetings.recording_id IS 'FK to recordings table for 60_notetaker meetings';

-- 2. Update source_type CHECK constraint to allow '60_notetaker'
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_source_type_check;
ALTER TABLE meetings ADD CONSTRAINT meetings_source_type_check
  CHECK (source_type = ANY (ARRAY['fathom'::text, 'voice'::text, '60_notetaker'::text]));

-- 3. Add unique index on bot_id (only one meeting per bot)
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_bot_id_unique
  ON meetings (bot_id) WHERE bot_id IS NOT NULL;

-- 4. Add index on recording_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_meetings_recording_id
  ON meetings (recording_id) WHERE recording_id IS NOT NULL;

-- 5. Add index on source_type for filtering 60_notetaker meetings
CREATE INDEX IF NOT EXISTS idx_meetings_source_type
  ON meetings (source_type) WHERE source_type = '60_notetaker';

-- 6. RLS: 60_notetaker meetings follow same policies as existing meetings
-- (owner_user_id based access - no additional RLS changes needed)
