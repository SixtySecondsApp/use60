-- Migration: Add transcription tracking columns to recordings table
-- Purpose: Track transcription lifecycle (status, provider, retries, errors)
-- so the cron-based transcription queue can efficiently poll for recordings
-- that have been uploaded to S3 but not yet transcribed.

ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS transcription_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (transcription_status IN ('pending', 'processing', 'complete', 'failed'));

ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS transcription_provider TEXT
    CHECK (transcription_provider IN ('whisperx', 'gladia', 'deepgram', 'meetingbaas'));

ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS transcription_error TEXT;

ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS transcription_retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS transcription_started_at TIMESTAMPTZ;

-- Partial index for efficient cron polling: find recordings that finished S3 upload
-- but have no transcript yet, ordered by status and retry count.
CREATE INDEX IF NOT EXISTS idx_recordings_transcription_queue
  ON recordings (transcription_status, s3_upload_status, transcription_retry_count)
  WHERE s3_upload_status = 'complete' AND transcript_text IS NULL;
