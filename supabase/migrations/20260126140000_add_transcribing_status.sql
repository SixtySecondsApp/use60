-- Add 'transcribing' status to recordings table
-- This status represents async transcription in progress via Gladia webhook

-- Drop the existing constraint
ALTER TABLE recordings
DROP CONSTRAINT IF EXISTS recordings_status_check;

-- Add the updated constraint with 'transcribing' status
ALTER TABLE recordings
ADD CONSTRAINT recordings_status_check
CHECK (status = ANY (ARRAY['pending', 'bot_joining', 'recording', 'processing', 'transcribing', 'ready', 'failed']));

-- Update comment to document the new status
COMMENT ON COLUMN recordings.status IS
'Status of the recording: pending, bot_joining, recording, processing, transcribing, ready, failed';
