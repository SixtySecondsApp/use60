-- Add S3 upload tracking columns to recordings table
-- Part of S3 Storage & Cost Tracking implementation

-- Add s3_upload_status enum
DO $$ BEGIN
  CREATE TYPE s3_upload_status AS ENUM ('pending', 'uploading', 'complete', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add S3 tracking columns
ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS s3_upload_status s3_upload_status DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS s3_file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS s3_upload_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS s3_upload_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS s3_upload_error_message TEXT,
  ADD COLUMN IF NOT EXISTS s3_video_url TEXT,
  ADD COLUMN IF NOT EXISTS s3_audio_url TEXT;

-- Add index for efficient queue queries (find pending uploads)
CREATE INDEX IF NOT EXISTS idx_recordings_s3_upload_status
  ON recordings(s3_upload_status)
  WHERE s3_upload_status IN ('pending', 'uploading');

-- Add index for error monitoring
CREATE INDEX IF NOT EXISTS idx_recordings_s3_failed
  ON recordings(s3_upload_status, updated_at)
  WHERE s3_upload_status = 'failed';

-- Add comment explaining the workflow
COMMENT ON COLUMN recordings.s3_upload_status IS 'Status flow: pending → uploading → complete/failed. Used by poll-s3-upload-queue cron job.';
COMMENT ON COLUMN recordings.s3_file_size_bytes IS 'Total size of video + audio files in bytes. Used for cost tracking (GB * $0.023/month).';
COMMENT ON COLUMN recordings.s3_video_url IS 'Permanent S3 URL for video file. Replaces temporary MeetingBaaS URL after upload.';
COMMENT ON COLUMN recordings.s3_audio_url IS 'Permanent S3 URL for audio file. Replaces temporary MeetingBaaS URL after upload.';
