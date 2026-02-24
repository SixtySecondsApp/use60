-- Add Gladia job tracking columns to recordings table
-- This helps debug async transcription and track job status

ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS gladia_job_id TEXT,
ADD COLUMN IF NOT EXISTS gladia_result_url TEXT,
ADD COLUMN IF NOT EXISTS transcription_started_at TIMESTAMPTZ;

-- Add index for faster job lookups
CREATE INDEX IF NOT EXISTS idx_recordings_gladia_job_id
ON recordings(gladia_job_id)
WHERE gladia_job_id IS NOT NULL;

-- Add status enum value for transcribing state
COMMENT ON COLUMN recordings.status IS
'Status of the recording: pending, bot_joining, recording, processing, transcribing, ready, failed';

-- Add helpful comment
COMMENT ON COLUMN recordings.gladia_job_id IS
'Gladia transcription job ID for async processing tracking';
